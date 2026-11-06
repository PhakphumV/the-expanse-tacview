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
//
// Run:    npm test   (or)   node scripts/validate-telemetry.js
// Exits 0 on success, 1 on any failed check.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const datasetPath = path.join(repoRoot, 'data', 'scenarios.json');
const ORIENT_TOL = 1e-4;      // unit-quaternion tolerance
const FWD_DOT_MIN = 0.98;     // attitude.forward vs velocity unit direction

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
        'js/ephemeris.js', 'js/scene.js', 'js/entities.js', 'js/spacecraft-model.js',
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
            const fwd = t.attitude.forward;
            for (const s of t.samples) {
                const q = s.orientation;
                const p = [fwd[0], fwd[1], fwd[2], 0];
                const qc = [-q[0], -q[1], -q[2], q[3]];
                const t1 = qmul(q, p), t2 = qmul(t1, qc);
                const wf = [t2[0], t2[1], t2[2]];
                const wfl = Math.sqrt(wf.reduce((a, c) => a + c * c, 0));
                const v = s.velocity;
                const vl = Math.sqrt(v.reduce((a, c) => a + c * c, 0));
                if (wfl < 1e-9 || vl < 1e-9) return `${t.id} sample t=${s.t}: degenerate`;
                const dot = (wf[0] * v[0] + wf[1] * v[1] + wf[2] * v[2]) / (wfl * vl);
                if (dot < FWD_DOT_MIN) return `${t.id} sample t=${s.t}: forward/velocity dot=${dot.toFixed(4)}`;
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

console.log(`Validating ${path.relative(repoRoot, datasetPath)}\n`);
check('1. Dataset shape conforms to schema', checkShape);
check('2. JS module syntax', checkSyntax);
check('3. Samples strictly time-ordered', checkOrdering);
check('4. Orientation is a unit quaternion', checkUnitQuaternions);
check('5. Attitude forward maps onto velocity (heading)', checkHeading);
check('6. Scenario events well-formed and time-ordered', checkEvents);

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
