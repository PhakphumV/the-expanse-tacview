// js/trails.js
// Trail geometry maths shared by the renderer and the Node tests (ADR-0006):
// the osculating orbit of a state, the perimeter of that orbit, and the time
// window that covers a wanted path length.
//
// Pure functions — no THREE, no DOM. Samples are { t, position: {x,y,z} } with
// ascending t; states are { position, velocity }. THREE.Vector3 objects satisfy
// both shapes, so the renderer can pass its vectors straight in.
//
// Classic-script module: attaches Tacview.Trails (and module.exports for Node).

(function (global) {
    'use strict';

    const MU_EARTH = 3.986005e14;   // m^3/s^2
    const MU_MOON = 4.902800e12;    // m^3/s^2

    // ADR-0006: a celestial body trails 0.45 of its orbit, a craft 1/8 of it.
    const CELESTIAL_FRACTION = 0.45;
    const OBJECT_FRACTION = 0.125;
    const ARC_CAP_FRACTION = 0.35;  // presentation guard, not physics
    const FALLBACK_SECONDS = 300;   // no orbit (on the pad, or escaping)
    const TRANSFER_ECC = 0.9;       // eccentricity that means "coasting somewhere"
    const TRANSFER_WINDOW_S = 3600; // a transfer trail shows the last 60 minutes
    const MIN_LENGTH = 1e4;         // m
    const MAX_LENGTH = 1e10;        // m — ceiling for very distant bodies
    const ZERO = { x: 0, y: 0, z: 0 };

    const len = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const dist = (a, b) => len(sub(a, b));
    function cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x,
        };
    }
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // Ramanujan's approximation of an ellipse perimeter — accurate to ~1e-10
    // for e < 0.9 and within 0.02 % at e = 0.99. 2*pi*a is NOT usable here: it
    // overstates a e = 0.977 orbit by ~49 %.
    function perimeter(a, e) {
        if (!(a > 0)) return 0;
        if (!(e > 0)) return 2 * Math.PI * a;
        if (e >= 1) return 0;
        const b = a * Math.sqrt(1 - e * e);
        return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }

    // Osculating conic of a state about `mu`. `closed` is false for parabolic and
    // hyperbolic states (a <= 0), where a perimeter has no meaning.
    function orbit(r, v, mu) {
        const rn = len(r);
        const vn = len(v);
        if (!(rn > 0) || !(mu > 0)) return null;
        const energy = (vn * vn) / 2 - mu / rn;
        const a = energy < 0 ? -mu / (2 * energy) : Infinity;
        const h = cross(r, v);
        const hn = len(h);
        const e = hn > 0 ? Math.sqrt(Math.max(0, 1 + (2 * energy * hn * hn) / (mu * mu))) : 1;
        const closed = energy < 0 && isFinite(a) && a > 0 && e < 1;
        return { a, e, h, hn, energy, closed, perimeter: closed ? perimeter(a, e) : 0 };
    }

    // Which gravity dominates at this point: Earth's, or the Moon's? This is what
    // keeps the Apollo trail sane at lunar distance, where the state is
    // hyperbolic about Earth but a clean orbit about the Moon.
    function centralBody(position, moon) {
        const earth = { mu: MU_EARTH, pos: ZERO, vel: ZERO, name: 'earth' };
        if (!moon || !moon.position) return earth;
        const dEarth = len(position);
        const dMoon = dist(position, moon.position);
        if (!(dEarth > 0) || !(dMoon > 0)) return earth;
        const aEarth = MU_EARTH / (dEarth * dEarth);
        const aMoon = MU_MOON / (dMoon * dMoon);
        if (aMoon <= aEarth) return earth;
        return { mu: MU_MOON, pos: moon.position, vel: moon.velocity || ZERO, name: 'moon' };
    }

    // Trail length in metres for a track at this instant (ADR-0006 §2/§3).
    // opts: { kind, state: {position, velocity}, moon?: {position, velocity},
    //         arcLength?: number }
    function targetLength(opts) {
        const kind = opts && opts.kind === 'celestial' ? 'celestial' : 'object';
        const st = opts && opts.state;
        if (!st || !st.position || !st.velocity) return 0;
        const body = centralBody(st.position, opts.moon);
        const relPos = sub(st.position, body.pos);
        const relVel = sub(st.velocity, body.vel);
        const orb = orbit(relPos, relVel, body.mu);
        const fraction = kind === 'celestial' ? CELESTIAL_FRACTION : OBJECT_FRACTION;
        let length = orb && orb.closed && orb.perimeter > 0
            ? fraction * orb.perimeter
            : FALLBACK_SECONDS * len(relVel);
        // The arc cap is a guard on craft trails only: for a celestial body the
        // fraction above *is* the design intent, and capping it would silently
        // shorten the half-orbit arc whenever the track's own span is long.
        if (kind === 'object' && opts.arcLength > 0) {
            length = Math.min(length, ARC_CAP_FRACTION * opts.arcLength);
        }
        return Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, length));
    }

    // Total path length of a track's samples, in metres.
    function arcLength(samples) {
        let acc = 0;
        for (let i = 1; i < samples.length; i++) acc += dist(samples[i - 1].position, samples[i].position);
        return acc;
    }

    // Is this state coasting between bodies rather than orbiting one? A transfer
    // is an open or near-escape arc about the dominant body: Apollo's trans-lunar
    // coast is e = 0.977 about Earth. A parking orbit, a lunar orbit and a
    // heliocentric cruise are not transfers.
    function isTransfer(opts) {
        const st = opts && opts.state;
        if (!st || !st.position || !st.velocity) return false;
        const body = centralBody(st.position, opts.moon);
        if (body.name !== 'earth') return false;
        const orb = orbit(sub(st.position, body.pos), sub(st.velocity, body.vel), body.mu);
        if (!orb) return false;
        return !orb.closed || orb.e >= TRANSFER_ECC;
    }

    function indexAtOrBefore(samples, t) {
        const n = samples.length;
        if (!n) return -1;
        if (t <= samples[0].t) return 0;
        if (t >= samples[n - 1].t) return n - 1;
        let lo = 0, hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (samples[mid].t <= t) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    // Linearly interpolated position at time t (positions only — the ribbon's
    // arc-length walk does not need the Hermite curve).
    function pointAt(samples, t) {
        const i = indexAtOrBefore(samples, t);
        if (i < 0) return ZERO;
        const a = samples[i];
        const b = samples[Math.min(i + 1, samples.length - 1)];
        if (b === a || !(b.t > a.t)) return { x: a.position.x, y: a.position.y, z: a.position.z };
        const u = clamp01((t - a.t) / (b.t - a.t));
        return {
            x: a.position.x + (b.position.x - a.position.x) * u,
            y: a.position.y + (b.position.y - a.position.y) * u,
            z: a.position.z + (b.position.z - a.position.z) * u,
        };
    }

    // Start time of a window ending at `t` that covers `length` metres of path,
    // walking backwards through the samples. Clamped to the first sample, so a
    // track without enough history simply shows everything it has.
    //
    // Arc length comes from positions, never from velocities: the LEO scenario
    // compresses the Moon's motion for display, so its stored velocities are
    // real but its positions move ~200x faster — integrating v would be wrong.
    function windowStart(samples, t, length) {
        const n = samples.length;
        if (!n) return t;
        if (!(length > 0)) return t;
        let k = indexAtOrBefore(samples, t);
        let prev = pointAt(samples, t);
        let prevT = t;
        let acc = 0;
        while (k >= 0) {
            const s = samples[k];
            const d = dist(prev, s.position);
            if (acc + d >= length) {
                const need = length - acc;
                const f = d > 0 ? need / d : 1;         // 1 at the sample, 0 at prev
                return prevT + (s.t - prevT) * f;
            }
            acc += d;
            prev = s.position;
            prevT = s.t;
            k--;
        }
        return samples[0].t;
    }

    // Path length covered in the last `seconds` of track time — the transfer
    // trail's cap expressed as a *distance*, so it can go through the same
    // low-pass as the orbit-derived length and ease instead of snapping.
    function lengthOver(samples, t, seconds) {
        const n = samples.length;
        if (!n || !(seconds > 0)) return 0;
        const t0 = t - seconds;
        let prev = pointAt(samples, t0);
        let acc = 0;
        for (let i = Math.max(0, indexAtOrBefore(samples, t0)); i < n; i++) {
            const s = samples[i];
            if (s.t <= t0) continue;
            if (s.t > t) break;
            acc += dist(prev, s.position);
            prev = s.position;
        }
        const end = pointAt(samples, t);
        if (end !== prev) acc += dist(prev, end);
        return acc;
    }

    const Trails = {
        MU_EARTH, MU_MOON,
        CELESTIAL_FRACTION, OBJECT_FRACTION, ARC_CAP_FRACTION,
        FALLBACK_SECONDS, TRANSFER_ECC, TRANSFER_WINDOW_S, MIN_LENGTH, MAX_LENGTH,
        len, sub, dist, cross,
        perimeter, orbit, centralBody, isTransfer, targetLength,
        arcLength, lengthOver, indexAtOrBefore, pointAt, windowStart,
    };

    global.Tacview = global.Tacview || {};
    global.Tacview.Trails = Trails;
    if (typeof module !== 'undefined' && module.exports) module.exports = Trails;
})(typeof window !== 'undefined' ? window : globalThis);
