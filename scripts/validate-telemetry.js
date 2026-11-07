#!/usr/bin/env node
// scripts/validate-telemetry.js
//
// End-to-end telemetry validation against data/scenarios.json. No browser, no
// Three.js — pure Node.
//
// Checks:
//   1. Dataset shape conforms to SCHEMA.md (scenarios -> tracks -> samples,
//      and scenario events).
//   2. Every JS module parses without syntax errors.
//   3. Samples are strictly time-ordered.
//   4. Every orientation is a unit quaternion (|q| ~= 1).
//   5. Attitude forward axis maps onto velocity direction (heading sanity).
//   6. Scenario events have finite t and a non-empty label.
//   7. Celestial tracks carry a radius and stay on their declared orbit.
//   8. Scenario presentation fields (epoch, duration_s, speeds, framing) are sane.
//   9. The generated per-scenario payloads match data/scenarios.json.
//  10. Maneuver records are ordered, inside the track window, and match the
//      velocity change / acceleration the samples actually show.
//
// Run:    npm test   (or)   node scripts/validate-telemetry.js
// Exits 0 on success, 1 on any failed check.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const datasetPath = path.join(repoRoot, 'data', 'scenarios.json');
const ORIENT_TOL = 1e-4;      // unit-quaternion tolerance
const FWD_DOT_MIN = 0.98;     // attitude.forward vs velocity unit direction
const IDLE_SPEED = 1.0;       // m/s — below this the vehicle is parked/landed
const DV_VS_SAMPLES_TOL = 0.10;   // maneuver dv vs the samples' velocity change
const ACCEL_TOL = 0.15;           // thrust acceleration vs dv/duration
const TSIOLKOVSKY_TOL = 0.10;     // rocket-equation consistency

let passCount = 0, failCount = 0;
function check(name, fn) {
    try {
        const err = fn();
        if (err) { failCount++; console.error(`\u2717 ${name}: ${err}`); }
        else { passCount++; console.log(`\u2713 ${name}`); }
    } catch (e) { failCount++; console.error(`\u2717 ${name}: ${e.message}`); }
}

const qnorm = (q) => Math.sqrt(q.reduce((a, c) => a + c * c, 0));
const finite = (a) => a.every(Number.isFinite);

function scenarios() {
    const raw = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
    if (!raw || typeof raw !== 'object') throw new Error('dataset must be an object');
    if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0)
        throw new Error('scenarios must be a non-empty array');
    return raw.scenarios;
}

function checkShape() {
    const list = scenarios();
    for (const [si, sc] of list.entries()) {
        if (!sc || typeof sc !== 'object') return `scenarios[${si}] not an object`;
        if (typeof sc.id !== 'string' || !sc.id) return `scenarios[${si}] missing id`;
        if (!Array.isArray(sc.tracks) || sc.tracks.length === 0) return `scenarios[${si}] (${sc.id}) missing tracks`;
        for (const [ti, t] of sc.tracks.entries()) {
            if (!t || typeof t !== 'object') return `${sc.id}.tracks[${ti}] not an object`;
            if (typeof t.id !== 'string' || !t.id) return `${sc.id}.tracks[${ti}] missing id`;
            if (!t.REF_FRAME) return `${sc.id}.tracks[${ti}] (${t.id}) missing REF_FRAME`;
            if (!t.TIME_SYSTEM) return `${sc.id}.tracks[${ti}] (${t.id}) missing TIME_SYSTEM`;
            if (!t.attitude || !Array.isArray(t.attitude.forward)) return `${sc.id}.tracks[${ti}] (${t.id}) missing attitude.forward`;
            if (!Array.isArray(t.samples) || t.samples.length === 0) return `${sc.id}.tracks[${ti}] (${t.id}) missing samples`;
            for (const [i, s] of t.samples.entries()) {
                if (!s || typeof s !== 'object') return `${t.id}.samples[${i}] not an object`;
                if (typeof s.t !== 'number' || !isFinite(s.t)) return `${t.id}.samples[${i}].t not finite`;
                for (const f of ['position', 'velocity'])
                    if (!Array.isArray(s[f]) || s[f].length !== 3 || !finite(s[f]))
                        return `${t.id}.samples[${i}].${f} not finite [x,y,z]`;
                if (!Array.isArray(s.orientation) || s.orientation.length !== 4 || !finite(s.orientation))
                    return `${t.id}.samples[${i}].orientation not finite [x,y,z,w]`;
            }
        }
        if (!Array.isArray(sc.events)) return `${sc.id}: events must be an array`;
    }
    return null;
}

function checkSyntax() {
    const modules = [
        'js/ephemeris.js', 'js/scene.js', 'js/orbit-ring.js', 'js/scenario-loader.js',
        'js/entities.js', 'js/spacecraft-model.js',
        'js/camera.js', 'js/hud.js', 'js/timeline.js', 'js/labels.js', 'js/main.js',
        'js/scenarios-data.js',
    ];
    for (const m of modules) {
        const fp = path.join(repoRoot, m);
        if (!fs.existsSync(fp)) continue;
        try { execSync(`node --check "${fp}"`, { stdio: 'pipe' }); }
        catch (e) { const msg = e.stderr ? e.stderr.toString() : e.message; return `module ${m}: ${msg.slice(0, 160)}`; }
    }
    return null;
}

function checkOrdering() {
    for (const sc of scenarios())
        for (const t of sc.tracks)
            for (let i = 1; i < t.samples.length; i++)
                if (t.samples[i].t <= t.samples[i - 1].t)
                    return `${t.id}: samples[${i}].t (${t.samples[i].t}) not strictly after samples[${i - 1}].t`;
    return null;
}

function checkUnitQuaternions() {
    for (const sc of scenarios())
        for (const t of sc.tracks)
            for (const s of t.samples) {
                const n = qnorm(s.orientation);
                if (Math.abs(n - 1) > ORIENT_TOL)
                    return `${t.id} sample t=${s.t}: |q|=${n.toFixed(6)} off unit by ${(n - 1).toFixed(6)}`;
            }
    return null;
}

function checkHeading() {
    for (const sc of scenarios())
        for (const t of sc.tracks) {
            const fwd = (t.attitude && t.attitude.forward) || [0, 0, -1];
            const mode = (t.attitude && t.attitude.mode) || 'velocity';
            if (['velocity', 'antivelocity', 'fixed'].indexOf(mode) === -1)
                return `${t.id}: attitude.mode "${mode}" is not velocity|antivelocity|fixed`;
            for (const s of t.samples) {
                const q = s.orientation;
                const p = [fwd[0], fwd[1], fwd[2], 0];
                const qc = [-q[0], -q[1], -q[2], q[3]];
                const t1 = qmul(q, p), t2 = qmul(t1, qc);
                const wf = [t2[0], t2[1], t2[2]];
                const wfl = Math.sqrt(wf.reduce((a, c) => a + c * c, 0));
                const v = s.velocity;
                const vl = Math.sqrt(v.reduce((a, c) => a + c * c, 0));
                // A landed or parked vehicle has no heading to check; its
                // orientation is still required to be a unit quaternion.
                if (vl < IDLE_SPEED) continue;
                if (wfl < 1e-9) return `${t.id} sample t=${s.t}: degenerate`;
                const dot = (wf[0] * v[0] + wf[1] * v[1] + wf[2] * v[2]) / (wfl * vl);
                // A "fixed" attitude is unrelated to the velocity direction.
                if (mode === 'fixed') continue;
                const signed = mode === 'antivelocity' ? -dot : dot;
                if (signed < FWD_DOT_MIN)
                    return `${t.id} sample t=${s.t}: ${mode} heading dot=${dot.toFixed(4)}`;
            }
        }
    return null;
}

function checkEvents() {
    for (const sc of scenarios()) {
        if (!Array.isArray(sc.events)) continue;
        for (const [i, e] of sc.events.entries()) {
            if (!e || typeof e !== 'object') return `${sc.id}.events[${i}] not an object`;
            if (typeof e.t !== 'number' || !isFinite(e.t)) return `${sc.id}.events[${i}].t not finite`;
            if (!e.label || typeof e.label !== 'string') return `${sc.id}.events[${i}] missing string label`;
        }
        // events should be time-ordered
        for (let i = 1; i < sc.events.length; i++)
            if (sc.events[i].t < sc.events[i - 1].t) return `${sc.id}: events not time-ordered`;
    }
    return null;
}

function qmul(a, b) {
    const [x1, y1, z1, w1] = a, [x2, y2, z2, w2] = b;
    return [
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    ];
}

function checkCelestial() {
    for (const sc of scenarios())
        for (const t of sc.tracks) {
            if (t.kind !== 'celestial') continue;
            if (typeof t.radius_m !== 'number' || !(t.radius_m > 0))
                return `${t.id}: celestial track missing positive radius_m`;
            const me = t.mean_elements || {};
            const a = me.SEMI_MAJOR_AXIS;
            if (typeof a !== 'number' || !(a > 0))
                return `${t.id}: celestial track missing mean_elements.SEMI_MAJOR_AXIS`;
            // A real orbit is not a circle: allow the ellipse's own radial swing
            // (a·e) plus a small margin, so an eccentric body such as the Moon
            // (e = 0.055, perigee 363 000 km / apogee 406 000 km) is not flagged
            // for being where its elements say it should be.
            const e = typeof me.ECCENTRICITY === 'number' && me.ECCENTRICITY >= 0 ? me.ECCENTRICITY : 0;
            const tol = Math.max(0.05, Math.min(0.5, e) * 1.1) + 0.005;
            for (const s of t.samples) {
                const r = Math.hypot(s.position[0], s.position[1], s.position[2]);
                if (Math.abs(r - a) / a > tol)
                    return `${t.id} sample t=${s.t}: radius ${(r / 1000).toFixed(0)} km off SEMI_MAJOR_AXIS ${(a / 1000).toFixed(0)} km (tolerance ${(tol * 100).toFixed(1)}% for e=${e})`;
            }
        }
    return null;
}

function checkScenarioFields() {
    for (const sc of scenarios()) {
        if (sc.epoch !== undefined && !Number.isFinite(Date.parse(sc.epoch)))
            return `${sc.id}: epoch "${sc.epoch}" is not an ISO 8601 date`;
        for (const f of ['duration_s', 'default_speed', 'view_distance_m']) {
            if (sc[f] === undefined) continue;
            if (typeof sc[f] !== 'number' || !isFinite(sc[f]) || sc[f] <= 0)
                return `${sc.id}: ${f} must be a positive number`;
        }
        if (sc.default_target !== undefined && (typeof sc.default_target !== 'string' || !sc.default_target))
            return `${sc.id}: default_target must be a non-empty string`;
        if (typeof sc.duration_s === 'number') {
            const lastEvent = (sc.events || []).reduce((m, e) => Math.max(m, e.t), 0);
            if (sc.duration_s < lastEvent)
                return `${sc.id}: duration_s (${sc.duration_s}) ends before its last event (${lastEvent})`;
        }
    }
    return null;
}

function checkEmbeddedData() {
    const manPath = path.join(repoRoot, 'js', 'scenarios-data.js');
    if (!fs.existsSync(manPath)) return 'js/scenarios-data.js missing (run npm run embed)';
    const manCtx = { window: {} };
    try { vm.runInNewContext(fs.readFileSync(manPath, 'utf8'), manCtx, { filename: manPath }); }
    catch (e) { return `js/scenarios-data.js: ${e.message}`; }
    const manifest = manCtx.window.TacviewManifest;
    if (!manifest || !Array.isArray(manifest.scenarios)) return 'js/scenarios-data.js: missing TacviewManifest.scenarios';

    const list = scenarios();
    const ids = list.map((s) => s.id);
    const manIds = manifest.scenarios.map((s) => s.id);
    if (ids.join(',') !== manIds.join(','))
        return `manifest ids [${manIds.join(', ')}] do not match dataset ids [${ids.join(', ')}] (run npm run embed)`;

    for (const sc of list) {
        const file = path.join(repoRoot, 'js', `scenario-${sc.id}.js`);
        if (!fs.existsSync(file)) return `js/scenario-${sc.id}.js missing (run npm run embed)`;
        const ctx = { window: {} };
        try { vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }); }
        catch (e) { return `js/scenario-${sc.id}.js: ${e.message}`; }
        const emb = ctx.window.TacviewScenarios && ctx.window.TacviewScenarios[sc.id];
        if (!emb) return `js/scenario-${sc.id}.js did not register "${sc.id}"`;
        if (emb.tracks.length !== sc.tracks.length)
            return `${sc.id}: embedded track count ${emb.tracks.length} != ${sc.tracks.length} (run npm run embed)`;
        if ((emb.events || []).length !== (sc.events || []).length)
            return `${sc.id}: embedded event count differs (run npm run embed)`;
        for (let i = 0; i < sc.tracks.length; i++) {
            const a = sc.tracks[i].samples, b = emb.tracks[i].samples;
            if (a.length !== b.length)
                return `${sc.id}/${sc.tracks[i].id}: embedded sample count ${b.length} != ${a.length} (run npm run embed)`;
            if (a[a.length - 1].t !== b[b.length - 1].t)
                return `${sc.id}/${sc.tracks[i].id}: embedded window differs (run npm run embed)`;
        }
    }
    return null;
}

function checkManeuvers() {
    for (const sc of scenarios())
        for (const t of sc.tracks) {
            if (t.maneuvers === undefined) continue;
            if (!Array.isArray(t.maneuvers)) return `${t.id}: maneuvers must be an array`;
            const t0 = t.samples[0].t, t1 = t.samples[t.samples.length - 1].t;
            const seen = new Set();
            let prevStart = -Infinity;

            for (const [i, m] of t.maneuvers.entries()) {
                const where = `${t.id}.maneuvers[${i}]`;
                if (!m || typeof m !== 'object') return `${where} not an object`;
                if (typeof m.id !== 'string' || !m.id) return `${where} missing string id`;
                if (seen.has(m.id)) return `${t.id}: duplicate maneuver id "${m.id}"`;
                seen.add(m.id);
                if (['impulsive', 'finite', 'constant'].indexOf(m.kind) === -1)
                    return `${where} kind must be impulsive|finite|constant`;
                if (typeof m.t_start !== 'number' || !isFinite(m.t_start)) return `${where} t_start not finite`;
                if (m.t_start < t0 || m.t_start > t1) return `${where} t_start outside the track window`;
                if (m.t_start < prevStart) return `${where} maneuvers are not time-ordered`;
                prevStart = m.t_start;

                if (m.kind !== 'impulsive') {
                    if (typeof m.t_end !== 'number' || !isFinite(m.t_end))
                        return `${where} t_end is required for a ${m.kind} burn`;
                    if (m.t_end <= m.t_start) return `${where} t_end must be after t_start`;
                    if (m.t_end > t1) return `${where} t_end outside the track window`;
                }
                if (m.dv_mps !== undefined && !(typeof m.dv_mps === 'number' && m.dv_mps > 0))
                    return `${where} dv_mps must be a positive number`;
                if (m.dv_direction !== undefined && BURN_DIRECTIONS.indexOf(m.dv_direction) === -1)
                    return `${where} dv_direction "${m.dv_direction}" is not one of ${BURN_DIRECTIONS.join('|')}`;
                if (m.dv_rtn !== undefined && !(Array.isArray(m.dv_rtn) && m.dv_rtn.length === 3 && m.dv_rtn.every(Number.isFinite)))
                    return `${where} dv_rtn must be a finite [radial, transverse, normal] triplet`;
                if (m.gravity_loss_mps !== undefined) {
                    if (!(typeof m.gravity_loss_mps === 'number' && m.gravity_loss_mps >= 0))
                        return `${where} gravity_loss_mps must be a non-negative number`;
                    if (typeof m.dv_mps === 'number' && m.gravity_loss_mps >= m.dv_mps)
                        return `${where} gravity_loss_mps must be below dv_mps`;
                }
                if (m.dv_vector !== undefined && !(Array.isArray(m.dv_vector) && m.dv_vector.length === 3 && m.dv_vector.every(Number.isFinite)))
                    return `${where} dv_vector must be a finite [x, y, z] triplet`;

                // The samples are the ground truth: the declared burn has to show
                // up as a matching velocity change. An impulsive burn is a step in
                // the vector; a finite prograde/retrograde burn shows up as a speed
                // change (the vector turns under gravity during the burn, so its
                // magnitude difference is not the dv).
                {
                    const before = sampleAtOrBefore(t.samples, m.t_start);
                    // An impulsive burn is a step between two consecutive samples, so
                    // the "after" sample must be strictly later; a finite burn ends
                    // at t_end and that sample is the end state.
                    const after = m.kind === 'impulsive'
                        ? sampleStrictlyAfter(t.samples, m.t_start)
                        : sampleAtOrAfter(t.samples, m.t_end);
                    if (!before || !after) return `${where} needs samples bracketing the burn`;

                    if (typeof m.dv_mps === 'number') {
                        // A burn that points along the track changes speed; only an
                        // off-axis burn (fixed attitude, plane change) shows up as a
                        // vector difference. Retrograde counts as along-track.
                        const onAxis = ['prograde', 'retrograde', 'antivelocity'].indexOf(m.attitude || 'prograde') !== -1;
                        let observed;
                        const vb = centralVelocity(sc, before.t, before.position, before.velocity);
                        const va = centralVelocity(sc, after.t, after.position, after.velocity);
                        if (m.kind === 'impulsive' || !onAxis) {
                            observed = dist3(vb, va);
                        } else {
                            observed = Math.abs(norm3(va) - norm3(vb));
                        }
                        // A finite burn near a body also gains/loses speed to gravity
                        // (Apollo's LOI-1 shows 770 m/s across a 862 m/s burn), so it
                        // gets a wider band than an impulsive step. A launch burn loses
                        // more again: part of its dv goes into lifting the vehicle, so
                        // the speed it gains is dv minus the declared gravity loss.
                        const expected = m.dv_mps - (m.gravity_loss_mps || 0);
                        const dvTol = m.kind === 'impulsive' ? DV_VS_SAMPLES_TOL : Math.max(DV_VS_SAMPLES_TOL, 0.15);
                        if (Math.abs(observed - expected) > dvTol * expected)
                            return `${where} (${m.id}): samples show ${observed.toFixed(0)} m/s, dv_mps says ${m.dv_mps}`
                                + (m.gravity_loss_mps ? ` (expected ${expected.toFixed(0)} after ${m.gravity_loss_mps} m/s of gravity loss)` : '');
                        if (m.kind !== 'impulsive') {
                            const rate = m.dv_mps / (m.t_end - m.t_start);
                            let declaredAccel = null;
                            if (typeof m.accel_mps2 === 'number') declaredAccel = m.accel_mps2;
                            else if (typeof m.thrust_n === 'number' && m.mass_kg && m.mass_kg.start)
                                declaredAccel = m.thrust_n / m.mass_kg.start;
                            if (declaredAccel && Math.abs(rate - declaredAccel) / declaredAccel > ACCEL_TOL)
                                return `${where} (${m.id}): ${rate.toFixed(2)} m/s2 implied, declared ${declaredAccel.toFixed(2)}`;
                        }
                    }

                    // Direction. An impulsive burn's step *is* the burn, so the
                    // vector is compared directly. A finite burn is dominated by
                    // the rotation of the velocity vector under gravity (Apollo's
                    // TLI shows a 4 421 m/s step for a 3 037 m/s prograde burn),
                    // so only its sense — does speed rise or fall — is checked;
                    // normal/radial burns are left to the magnitude checks.
                    const cb = centralState(sc, before.t, before.position, before.velocity);
                    const dir = declaredDirection(m, rtnBasis(cb.r, cb.v));
                    if (dir) {
                        const step = [0, 1, 2].map((i) => after.velocity[i] - before.velocity[i]);
                        const stepLen = norm3(step);
                        if (!(stepLen > 1e-6))
                            return `${where} (${m.id}) declares a direction but the samples show no velocity step`;
                        if (m.kind === 'impulsive') {
                            const dot = (step[0] * dir[0] + step[1] * dir[1] + step[2] * dir[2]) / stepLen;
                            if (dot < DIR_DOT_IMPULSIVE)
                                return `${where} (${m.id}): declared ${m.dv_direction || 'rtn/vector'} burn, `
                                    + `but the velocity step disagrees (dot ${dot.toFixed(3)})`;
                        } else {
                            const sense = burnSense(m);
                            const dSpeed = norm3(after.velocity) - norm3(before.velocity);
                            if (sense === 'prograde' && dSpeed < 0)
                                return `${where} (${m.id}): declared prograde, but the speed fell ${dSpeed.toFixed(0)} m/s`;
                            if (sense === 'retrograde' && dSpeed > 0)
                                return `${where} (${m.id}): declared retrograde, but the speed rose ${dSpeed.toFixed(0)} m/s`;
                        }
                    }
                }
                if (typeof m.isp_s === 'number' && m.mass_kg && m.mass_kg.start && m.mass_kg.end) {
                    const m0 = m.mass_kg.start, m1 = m.mass_kg.end;
                    if (!(m1 < m0)) return `${where} mass_kg.end must be below mass_kg.start`;
                    const rocket = m.isp_s * 9.80665 * Math.log(m0 / m1);
                    if (typeof m.dv_mps === 'number' && Math.abs(rocket - m.dv_mps) / m.dv_mps > TSIOLKOVSKY_TOL)
                        return `${where} (${m.id}): dv ${m.dv_mps} m/s vs rocket equation ${rocket.toFixed(0)} m/s`;
                }
            }
        }
    return null;
}

function dist3(a, b) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
const BURN_DIRECTIONS = ['prograde', 'retrograde', 'normal', 'anti-normal', 'radial-out', 'radial-in', 'vector'];
const DIR_DOT_IMPULSIVE = 0.98;

// Which way a burn is meant to push, from the declaration (used for the
// speed-sense check on finite burns).
function burnSense(m) {
    if (m.dv_direction) return m.dv_direction;
    if (Array.isArray(m.dv_rtn)) {
        const [, transverse] = m.dv_rtn;
        return transverse > 0 ? 'prograde' : transverse < 0 ? 'retrograde' : null;
    }
    return m.attitude === 'retrograde' ? 'retrograde' : m.attitude === 'prograde' ? 'prograde' : null;
}

function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit3(v) {
    const n = norm3(v);
    return n > 0 ? v.map((c) => c / n) : null;
}
// Local RTN basis at a state: R radial-out, T along-track (prograde), N normal.
function rtnBasis(r, v) {
    const R = unit3(r);
    const h = cross3(r, v);
    const N = unit3(h);
    if (!R || !N) return null;
    const T = unit3(cross3(N, R));
    return T ? { R, T, N } : null;
}
// Declared burn direction as a unit vector, or null when the record says only a
// magnitude (legacy records fall back to attitude prograde/retrograde).
function declaredDirection(m, basis) {
    if (Array.isArray(m.dv_vector)) return unit3(m.dv_vector);
    if (Array.isArray(m.dv_rtn) && basis) {
        const [radial, transverse, normal] = m.dv_rtn;
        return unit3([0, 1, 2].map((i) =>
            basis.R[i] * radial + basis.T[i] * transverse + basis.N[i] * normal));
    }
    const dir = m.dv_direction || (m.attitude === 'retrograde' ? 'retrograde'
        : m.attitude === 'prograde' ? 'prograde' : null);
    if (!dir || !basis) return null;
    const axis = {
        prograde: basis.T,
        retrograde: basis.T.map((c) => -c),
        normal: basis.N,
        'anti-normal': basis.N.map((c) => -c),
        'radial-out': basis.R,
        'radial-in': basis.R.map((c) => -c),
    }[dir];
    return axis ? axis.slice() : null;
}
function norm3(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
const MU_EARTH = 3.986005e14;
const MU_MOON = 4.902800e12;

// Velocity of a state in the frame of whichever body dominates there (Earth or
// the Moon). A lunar-orbit burn measured in the Earth frame picks up the Moon's
// own 1 km/s motion, so the speed change reads wrong by tens of m/s.
// State in the frame of whichever body dominates there (Earth or the Moon). Both
// the velocity change and the RTN directions of a burn mean nothing in the wrong
// frame: a radial-out nudge away from the Moon points almost perpendicular to
// Earth's radial direction.
function centralState(sc, t, pos, vel) {
    const moon = (sc.tracks || []).find((tr) => tr.kind === 'celestial' && /moon/i.test(tr.OBJECT_NAME || tr.id));
    if (!moon) return { r: pos, v: vel };
    // The Moon's grid is coarse (15 min), so a nearest-sample lookup leaves the
    // relative frame stale by up to 900 km — enough to rotate a burn direction by
    // ~20 degrees and fail a correct burn. Interpolate instead.
    const ms = interpSample(moon.samples, t);
    if (!ms) return { r: pos, v: vel };
    const rel = [pos[0] - ms.position[0], pos[1] - ms.position[1], pos[2] - ms.position[2]];
    const dMoon = norm3(rel);
    const dEarth = norm3(pos);
    if (!(dMoon > 0) || !(dEarth > 0)) return { r: pos, v: vel };
    if (MU_MOON / (dMoon * dMoon) <= MU_EARTH / (dEarth * dEarth)) return { r: pos, v: vel };
    return { r: rel, v: [vel[0] - ms.velocity[0], vel[1] - ms.velocity[1], vel[2] - ms.velocity[2]] };
}
function centralVelocity(sc, t, pos, vel) {
    return centralState(sc, t, pos, vel).v;
}
// Linear interpolation of a sample track (positions and velocities), used where a
// coarse grid would otherwise be read as a stale state.
function interpSample(samples, t) {
    const a = sampleAtOrBefore(samples, t);
    const b = sampleAtOrAfter(samples, t);
    if (!a) return b;
    if (!b || a.t === b.t) return a;
    const u = (t - a.t) / (b.t - a.t);
    const mix = (p, q, i) => p[i] + (q[i] - p[i]) * u;
    return {
        position: [mix(a.position, b.position, 0), mix(a.position, b.position, 1), mix(a.position, b.position, 2)],
        velocity: [mix(a.velocity, b.velocity, 0), mix(a.velocity, b.velocity, 1), mix(a.velocity, b.velocity, 2)],
    };
}
function sampleAtOrBefore(samples, t) {
    let out = null;
    for (const s of samples) { if (s.t <= t + 1e-9) out = s; else break; }
    return out;
}
function sampleAtOrAfter(samples, t) {
    for (const s of samples) if (s.t >= t - 1e-9) return s;
    return null;
}
function sampleStrictlyAfter(samples, t) {
    for (const s of samples) if (s.t > t + 1e-9) return s;
    return null;
}

console.log(`Validating ${path.relative(repoRoot, datasetPath)}\n`);
check('1. Dataset shape conforms to schema', checkShape);
check('2. JS module syntax', checkSyntax);
check('3. Samples strictly time-ordered', checkOrdering);
check('4. Orientation is a unit quaternion', checkUnitQuaternions);
check('5. Attitude forward maps onto velocity (heading)', checkHeading);
check('6. Scenario events well-formed and time-ordered', checkEvents);
check('7. Celestial tracks carry radius and match their orbit', checkCelestial);
check('8. Scenario presentation fields are well-formed', checkScenarioFields);
check('9. Embedded scenario files match the canonical dataset', checkEmbeddedData);
check('10. Maneuvers are consistent with the ephemeris', checkManeuvers);

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
