#!/usr/bin/env node
// Gives every spacecraft sample an attitude it could actually have flown: nose
// along the velocity in cruise, engine along the thrust while a burn is on, with a
// slew in and out of the burn attitude. Without this the model only ever follows
// the velocity vector, so LOI-1 — a 180° turn to a tail-first burn — is invisible.
//
// Idempotent: it rewrites orientation from position/velocity + manoeuvres, so it can
// be re-run after any regeneration of the tracks.
const fs = require('fs');

const store = require('./scenario-store');
const SLEW_RATE_DPS = 1.5;    // deg/s — Apollo's big slews were of this order
const SLEW_MIN_S = 20;
const SLEW_MAX_S = 300;
const SLEW_STEP_S = 5;        // sample spacing through a slew, so the slerp is smooth


const V = (a) => ({ x: a[0], y: a[1], z: a[2] });
const arr = (v) => [v.x, v.y, v.z];
const mag = (v) => Math.hypot(v.x, v.y, v.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (v) => scale(v, 1 / mag(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r8 = (x) => Math.round(x * 1e8) / 1e8;

// The model's forward axis is -Z, matching quatFromMinusZ() in the generators.
function quatFromMinusZ(v) {
    const n = mag(v);
    if (!(n > 0)) return [1, 0, 0, 0];
    const u = [v.x / n, v.y / n, v.z / n];
    const a = [0, 0, -1];
    const r = a[0] * u[0] + a[1] * u[1] + a[2] * u[2] + 1;
    if (r < 1e-8) return [1, 0, 0, 0];
    const c = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const nn = Math.hypot(c[0], c[1], c[2], r);
    return [c[0] / nn, c[1] / nn, c[2] / nn, r / nn];
}
function slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { bb = b.map((x) => -x); d = -d; }
    if (d > 0.9995) return a.map((x, i) => r8(x + (bb[i] - x) * t));
    const th0 = Math.acos(clamp(d, -1, 1));
    const s0 = Math.sin(th0);
    const k0 = Math.sin((1 - t) * th0) / s0;
    const k1 = Math.sin(t * th0) / s0;
    return [0, 1, 2, 3].map((i) => r8(a[i] * k0 + bb[i] * k1));
}
function smoothstep(x) { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); }

// Burn attitude: the engine points along the thrust, so the nose points the way the
// dv pushes the vehicle. A retrograde burn therefore flies tail-first.
function thrustDirection(m, stateAt) {
    if (Array.isArray(m.dv_vector) && m.dv_vector.length === 3) return V(m.dv_vector);
    const st = stateAt(m.t_start);
    if (!st) return null;
    const r = V(st.position), v = V(st.velocity);
    const R = unit(r);
    const h = cross(r, v);
    const T = unit(cross(h, R));            // transverse, along the motion
    const N = unit(h);
    switch (m.dv_direction) {
        case 'prograde': return v;
        case 'retrograde': return scale(v, -1);
        case 'normal': return N;
        case 'anti-normal': return scale(N, -1);
        case 'radial-out': return R;
        case 'radial-in': return scale(R, -1);
        default: return null;               // 'vector' without dv_vector: unresolved
    }
}

// Cubic Hermite position through the neighbouring sample velocities, matching the
// engine's interpolation, so inserted samples sit on the same arc.
function sampleStates(list, t) {
    let i = 0;
    while (i < list.length - 1 && list[i + 1].t < t) i++;
    const a = list[i], b = list[Math.min(i + 1, list.length - 1)];
    const span = b.t - a.t || 1;
    const u = (t - a.t) / span, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const f = (k) => h00 * a.position[k] + h10 * span * a.velocity[k] + h01 * b.position[k] + h11 * span * b.velocity[k];
    const g = (k) => a.velocity[k] + (b.velocity[k] - a.velocity[k]) * u;
    return {
        position: [f(0), f(1), f(2)],
        velocity: [g(0), g(1), g(2)],
        orientation: slerp(a.orientation, b.orientation, u),
    };
}

const data = store.dataset();
for (const sc of data.scenarios) {
    for (const tr of sc.tracks) {
        if (tr.meta && tr.meta.kind === 'celestial') continue;
        if (!tr.samples || tr.samples.length < 2) continue;
        const S = tr.samples;
        const stateAt = (t) => {
            if (t < S[0].t || t > S[S.length - 1].t) return null;
            return sampleStates(S, t);
        };

        // Resolve the manoeuvres that have a usable thrust axis, and the slew each
        // one needs to reach its burn attitude.
        const burns = [];
        for (const m of tr.maneuvers || []) {
            // A 0.15 m/s jettison nudge is not worth a 148° turn: only real burns get
            // an attitude change.
            if (!(m.dv_mps >= 5)) continue;
            const push = thrustDirection(m, stateAt);
            if (!push) continue;                       // e.g. the ascent pitch programme
            const st = stateAt(m.t_start);
            if (!st) continue;
            const vhat = unit(V(st.velocity));
            const a = Math.acos(clamp(dot(unit(push), vhat), -1, 1));
            const slew = clamp((a * 180 / Math.PI) / SLEW_RATE_DPS, SLEW_MIN_S, SLEW_MAX_S);
            if (a * 180 / Math.PI < 3) continue;       // already aligned: nothing to show
            burns.push({
                id: m.id, t0: m.t_start, t1: m.t_end != null ? m.t_end : m.t_start,
                push: unit(push), slew, angleDeg: a * 180 / Math.PI,
            });
        }
        if (!burns.length) continue;

        // 1. Insert samples so each slew has something to interpolate through.
        const extra = [];
        for (const b of burns) {
            const from = b.t0 - b.slew, to = b.t1 + b.slew;
            for (let t = from; t <= to; t += SLEW_STEP_S) {
                if (t < S[0].t || t > S[S.length - 1].t) continue;
                if (S.some((s) => Math.abs(s.t - t) < 0.5)) continue;
                const st = sampleStates(S, t);
                extra.push({ t: Math.round(t * 100) / 100, position: st.position.map((x) => Math.round(x * 1000) / 1000),
                    velocity: st.velocity.map((x) => Math.round(x * 1000) / 1000), orientation: st.orientation });
            }
        }
        if (extra.length) {
            tr.samples = S.concat(extra).sort((a, b) => a.t - b.t);
        }

        // 2. Rewrite the orientation inside each window.
        const samples = tr.samples;
        let touched = 0;
        for (const s of samples) {
            const v = V(s.velocity);
            if (!(mag(v) > 1e-6)) continue;
            let q = quatFromMinusZ(v);
            let burnQ = null;
            for (const b of burns) {
                if (s.t >= b.t0 - b.slew && s.t <= b.t1 + b.slew) { burnQ = b; break; }
            }
            if (burnQ) {
                const bq = quatFromMinusZ(burnQ.push);
                if (s.t < burnQ.t0) {
                    q = slerp(q, bq, smoothstep((s.t - (burnQ.t0 - burnQ.slew)) / burnQ.slew));
                } else if (s.t <= burnQ.t1) {
                    q = bq;
                } else {
                    q = slerp(bq, q, smoothstep((s.t - burnQ.t1) / burnQ.slew));
                }
                touched++;
            }
            s.orientation = q.map(r8);
        }
        console.log(`${sc.id}/${tr.id}: ${burns.map((b) => b.id + ' ' + b.angleDeg.toFixed(0) + 'deg/' + b.slew.toFixed(0) + 's').join(', ')}; +${extra.length} samples, ${touched} re-oriented`);
    }
}

for (const sc of data.scenarios) store.save(sc);
console.log('written');
