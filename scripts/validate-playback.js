#!/usr/bin/env node
// scripts/validate-playback.js
//
// End-to-end telemetry consistency and validation against
// data/engagement.json. No browser, no Three.js — pure Node.
//
// Checks:
//   1. Dataset shape conforms to the documented schema
//   2. All application JS modules parse without syntax errors
//   3. Orientation continuity at every keyframe boundary
//   4. Velocity from position derivatives stays near the authored
//      velocity field within VEL_TOLERANCE
//   5. Closure rate from interpolated velocities stays near the
//      numeric time-derivative of range within CLOSURE_TOLERANCE
//   6. G-force stays in physically reasonable range and uses g0=9.8
//   7. Derived telemetry (range, velocity) stays physically reasonable
//   8. Lock/unlock events form valid closed intervals
//   9. Burst event positions are at known entity positions
//
// Units:
//   - distance: meters
//   - time:     seconds
//   - velocity: m/s
//   - accel:    m/s²
//   - G-force:  multiples of g0 = 9.8 m/s²
//   - angles:   radians (orientation quaternions)
//
// Tolerances:
//   - VEL_TOLERANCE       = 200 m/s    (dataset velocities are authored
//                                        independently of position
//                                        derivatives; this captures
//                                        authoring jitter)
//   - CLOSURE_TOLERANCE   = 50 m/s     (same reason)
//   - ORIENT_DOT_MIN      = 0.9        (no quaternion flips)
//
// Usage:  node scripts/validate-playback.js
// Exits 0 on success, 1 on any failed check.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const G0 = 9.8;
const VEL_TOLERANCE = 200;     // m/s
const CLOSURE_TOLERANCE = 50;  // m/s
const ORIENT_DOT_MIN = 0.9;

const VALID_EVENT_TYPES = new Set([
    'launch', 'pdc_engage', 'maneuver_start', 'maneuver_end',
    'lock', 'unlock', 'intercept', 'hit', 'miss',
]);

// ---- Minimal Vec3 / Quat substitutes ----
class Vec3 {
    constructor(x=0, y=0, z=0) { this.x=x; this.y=y; this.z=z; }
    copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
    clone() { return new Vec3(this.x, this.y, this.z); }
    sub(v) { this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
    multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
    length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
    distanceTo(v) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); }
    lerp(v, alpha) {
        this.x = this.x + (v.x - this.x) * alpha;
        this.y = this.y + (v.y - this.y) * alpha;
        this.z = this.z + (v.z - this.z) * alpha;
        return this;
    }
}
class Quat {
    constructor(x=0, y=0, z=0, w=1) { this.x=x; this.y=y; this.z=z; this.w=w; }
    copy(q) { this.x=q.x; this.y=q.y; this.z=q.z; this.w=q.w; return this; }
    clone() { return new Quat(this.x, this.y, this.z, this.w); }
    dot(q) { return this.x*q.x + this.y*q.y + this.z*q.z + this.w*q.w; }
    slerp(qb, t) {
        let dot = this.dot(qb);
        let qbUse = qb;
        if (dot < 0) { qbUse = new Quat(-qb.x, -qb.y, -qb.z, -qb.w); dot = -dot; }
        if (dot > 0.9995) {
            this.x += (qbUse.x - this.x) * t;
            this.y += (qbUse.y - this.y) * t;
            this.z += (qbUse.z - this.z) * t;
            this.w += (qbUse.w - this.w) * t;
        } else {
            const theta = Math.acos(dot);
            const sinTheta = Math.sin(theta);
            const a = Math.sin((1 - t) * theta) / sinTheta;
            const b = Math.sin(t * theta) / sinTheta;
            this.x = this.x * a + qbUse.x * b;
            this.y = this.y * a + qbUse.y * b;
            this.z = this.z * a + qbUse.z * b;
            this.w = this.w * a + qbUse.w * b;
        }
        const len = Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z + this.w*this.w);
        this.x /= len; this.y /= len; this.z /= len; this.w /= len;
        return this;
    }
}

// ---- Load dataset ----
const repoRoot = path.resolve(__dirname, '..');
const datasetPath = path.join(repoRoot, 'data', 'engagement.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

// Pre-process entities to Vec3/Quat keyframes
const entities = {};
for (const e of dataset.entities) {
    entities[e.id] = {
        type: e.type,
        iff: e.iff,
        keyframes: e.keyframes.map(k => ({
            t: k.t,
            pos: new Vec3(k.position[0], k.position[1], k.position[2]),
            vel: new Vec3(k.velocity[0], k.velocity[1], k.velocity[2]),
            ori: new Quat(k.orientation[0], k.orientation[1], k.orientation[2], k.orientation[3]),
        }))
    };
}

// Mirror of PlaybackEngine.getStateAtTime
function getStateAtTime(id, t) {
    const e = entities[id];
    if (!e || e.keyframes.length === 0) return null;
    if (t < e.keyframes[0].t || t > e.keyframes[e.keyframes.length-1].t) return null;
    let lo = 0, hi = e.keyframes.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (e.keyframes[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = e.keyframes[lo], b = e.keyframes[hi];
    const span = b.t - a.t;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    return {
        pos: a.pos.clone().lerp(b.pos.clone(), alpha),
        vel: a.vel.clone().lerp(b.vel.clone(), alpha),
        ori: a.ori.clone().slerp(b.ori, alpha),
    };
}

// Closure from interpolated velocities (analytic).
function closureAnalytic(sA, sB) {
    const toA = new Vec3().copy(sA.pos).sub(sB.pos);
    const dist = toA.length();
    if (dist < 1) return 0;
    toA.x /= dist; toA.y /= dist; toA.z /= dist;
    const relV = new Vec3().copy(sA.vel).sub(sB.vel);
    return -(relV.x * toA.x + relV.y * toA.y + relV.z * toA.z);
}

// Closure as numeric dRange/dt via symmetric differences.
function closureNumeric(idA, idB, t, dt = 0.01) {
    const aFwd = getStateAtTime(idA, t + dt);
    const bFwd = getStateAtTime(idB, t + dt);
    const aBack = getStateAtTime(idA, t - dt);
    const bBack = getStateAtTime(idB, t - dt);
    if (!aFwd || !bFwd || !aBack || !bBack) return null;
    const rangeFwd = aFwd.pos.distanceTo(bFwd.pos);
    const rangeBack = aBack.pos.distanceTo(bBack.pos);
    return -(rangeFwd - rangeBack) / (2 * dt);
}

// G-force from velocity derivative: |dv/dt| / g0.
function gForceAt(id, t, dt = 0.01) {
    const sNext = getStateAtTime(id, t + dt);
    const sPrev = getStateAtTime(id, t - dt);
    if (!sNext || !sPrev) return null;
    const dv = new Vec3().copy(sNext.vel).sub(sPrev.vel);
    return (dv.length() / (2 * dt)) / G0;
}

// ---- Validation framework ----
let passCount = 0, failCount = 0;
function check(name, fn) {
    try {
        const err = fn();
        if (err) {
            failCount++;
            console.error(`\u2717 ${name}: ${err}`);
        } else {
            passCount++;
            console.log(`\u2713 ${name}`);
        }
    } catch (e) {
        failCount++;
        console.error(`\u2717 ${name}: ${e.message}`);
    }
}

// ---- Check functions ----

function checkShape() {
    if (!dataset.duration || typeof dataset.duration !== 'number')
        return 'missing duration';
    if (!Array.isArray(dataset.entities)) return 'missing entities array';
    for (const e of dataset.entities) {
        if (!e.id || !e.type)
            return `entity missing id/type: ${JSON.stringify(e).slice(0, 80)}`;
        if (!Array.isArray(e.keyframes))
            return `entity ${e.id} missing keyframes`;
        for (const [i, k] of e.keyframes.entries()) {
            if (typeof k.t !== 'number')
                return `${e.id}.keyframes[${i}].t not a number`;
            if (!Array.isArray(k.position) || k.position.length !== 3)
                return `${e.id}.keyframes[${i}].position not [x,y,z]`;
            if (!Array.isArray(k.velocity) || k.velocity.length !== 3)
                return `${e.id}.keyframes[${i}].velocity not [x,y,z]`;
            if (!Array.isArray(k.orientation) || k.orientation.length !== 4)
                return `${e.id}.keyframes[${i}].orientation not [x,y,z,w]`;
        }
    }
    if (!Array.isArray(dataset.events)) return 'missing events array';
    // Validate the structured event schema (TAC-021).
    for (const [i, ev] of dataset.events.entries()) {
        if (!ev || typeof ev !== 'object') return `events[${i}] not an object`;
        if (typeof ev.t !== 'number' || !isFinite(ev.t))
            return `events[${i}].t not a finite number`;
        if (typeof ev.type !== 'string' || !VALID_EVENT_TYPES.has(ev.type))
            return `events[${i}].type "${ev.type}" not in VALID_EVENT_TYPES`;
        if ('actor' in ev && ev.actor !== null && typeof ev.actor !== 'string')
            return `events[${i}].actor must be string or null`;
        if ('target' in ev && ev.target !== null && typeof ev.target !== 'string')
            return `events[${i}].target must be string or null`;
        if ('result' in ev && ev.result !== null && typeof ev.result !== 'string')
            return `events[${i}].result must be string or null`;
        if ('description' in ev && typeof ev.description !== 'string')
            return `events[${i}].description must be a string`;
    }
    // Events should be sorted by t for deterministic prev/next navigation.
    for (let i = 1; i < dataset.events.length; i++) {
        if (dataset.events[i].t < dataset.events[i-1].t - 1e-6)
            return `events[${i}].t (${dataset.events[i].t}) < events[${i-1}].t (${dataset.events[i-1].t}): events must be time-ordered`;
    }
    return null;
}

function checkSyntax() {
    const modules = [
        'js/playback.js', 'js/telemetry.js', 'js/scene.js', 'js/lock-state.js',
        'js/mission-state.js', 'js/event-model.js', 'js/entities.js',
        'js/weapons.js', 'js/effects.js', 'js/camera.js', 'js/hud.js',
        'js/timeline.js', 'js/event-log.js', 'js/minimap.js', 'js/main.js',
        'js/ship-models.js',
        'js/presentation.js',
        'scripts/browser-smoke.js',
        'scripts/resource-audit.js',
        'vendor/OrbitControls.js',
    ];
    for (const m of modules) {
        try {
            execSync(`node --check "${path.join(repoRoot, m)}"`, { stdio: 'pipe' });
        } catch (e) {
            const msg = e.stderr ? e.stderr.toString() : e.message;
            return `module ${m} failed: ${msg.slice(0, 200)}`;
        }
    }
    return null;
}

function checkOrientationContinuity() {
    for (const id in entities) {
        const kfs = entities[id].keyframes;
        for (let i = 1; i < kfs.length; i++) {
            const dot = Math.abs(kfs[i-1].ori.dot(kfs[i].ori));
            if (dot < ORIENT_DOT_MIN) {
                return `${id} keyframe ${i} (t=${kfs[i].t.toFixed(2)}s): ` +
                       `|q_i . q_{i+1}| = ${dot.toFixed(3)} < ${ORIENT_DOT_MIN} ` +
                       `(possible quaternion flip or discontinuity)`;
            }
        }
    }
    return null;
}

function checkVelocityFromPosition() {
    for (const id in entities) {
        const kfs = entities[id].keyframes;
        for (let i = 1; i < kfs.length; i++) {
            const dt = kfs[i].t - kfs[i-1].t;
            if (dt <= 0) continue;
            const dx = (kfs[i].pos.x - kfs[i-1].pos.x) / dt;
            const dy = (kfs[i].pos.y - kfs[i-1].pos.y) / dt;
            const dz = (kfs[i].pos.z - kfs[i-1].pos.z) / dt;
            // Compare to the average of the two endpoint velocities,
            // which is what the playback engine interpolates at the
            // midpoint between these keyframes.
            const refVx = (kfs[i-1].vel.x + kfs[i].vel.x) / 2;
            const refVy = (kfs[i-1].vel.y + kfs[i].vel.y) / 2;
            const refVz = (kfs[i-1].vel.z + kfs[i].vel.z) / 2;
            const diff = Math.sqrt(
                (dx - refVx)**2 + (dy - refVy)**2 + (dz - refVz)**2
            );
            if (diff > VEL_TOLERANCE) {
                return `${id} keyframe ${i} (t=${kfs[i].t.toFixed(2)}s): ` +
                       `velocity-from-position (${dx.toFixed(1)},${dy.toFixed(1)},${dz.toFixed(1)}) ` +
                       `differs from avg endpoint velocity ` +
                       `(${[refVx, refVy, refVz].map(v=>v.toFixed(1)).join(',')}) ` +
                       `by ${diff.toFixed(1)} m/s (tolerance ${VEL_TOLERANCE} m/s)`;
            }
        }
    }
    return null;
}

function checkClosureRate() {
    const samples = 20;
    const dur = dataset.duration;
    let maxDiff = 0;
    let maxDiffAt = 0;
    for (let i = 0; i < samples; i++) {
        const t = (i / (samples - 1)) * dur;
        const sA = getStateAtTime('roci', t);
        const sB = getStateAtTime('zmeya', t);
        if (!sA || !sB) continue;
        const analytic = closureAnalytic(sA, sB);
        const numeric = closureNumeric('roci', 'zmeya', t);
        if (numeric === null) continue;
        const diff = Math.abs(analytic - numeric);
        if (diff > maxDiff) { maxDiff = diff; maxDiffAt = t; }
        if (diff > CLOSURE_TOLERANCE) {
            return `t=${t.toFixed(2)}s: analytic closure ${analytic.toFixed(1)} m/s ` +
                   `differs from numeric dRange/dt ${numeric.toFixed(1)} m/s ` +
                   `by ${diff.toFixed(1)} m/s (tolerance ${CLOSURE_TOLERANCE} m/s; ` +
                   `max over run = ${maxDiff.toFixed(1)} m/s at t=${maxDiffAt.toFixed(2)}s)`;
        }
    }
    return null;
}

function checkGForce() {
    // G-force uses |dv/dt|/g0; verify it stays physically reasonable
    // (0..100 G for a tactical vessel).
    const samples = 15;
    const dur = dataset.duration;
    for (const id of ['roci', 'zmeya']) {
        for (let i = 0; i < samples; i++) {
            const t = (i / (samples - 1)) * dur;
            const g = gForceAt(id, t);
            if (g === null) continue;
            if (g < 0) {
                return `${id} t=${t.toFixed(2)}s: G-force negative (${g.toFixed(2)}G)`;
            }
            if (g > 100) {
                return `${id} t=${t.toFixed(2)}s: G-force ${g.toFixed(2)}G exceeds 100G ` +
                       `(physically unreasonable for a tactical vessel)`;
            }
        }
    }
    return null;
}

function checkDerivedRanges() {
    const samples = 10;
    const dur = dataset.duration;
    for (let i = 0; i < samples; i++) {
        const t = (i / (samples - 1)) * dur;
        const sA = getStateAtTime('roci', t);
        const sB = getStateAtTime('zmeya', t);
        if (!sA || !sB) continue;
        const range = sA.pos.distanceTo(sB.pos);
        if (range < 0 || range > 1e9) {
            return `t=${t.toFixed(2)}s: range ${range.toFixed(0)}m outside [0, 1e9]m`;
        }
        const velA = sA.vel.length();
        const velB = sB.vel.length();
        if (velA > 1e6 || velB > 1e6) {
            return `t=${t.toFixed(2)}s: velocity ${Math.max(velA, velB).toFixed(0)} m/s exceeds 1e6 m/s`;
        }
    }
    return null;
}

function checkLockWindows() {
    const opens = {};
    for (const ev of dataset.events) {
        if (ev.type === 'lock') {
            if (opens[ev.actor]) {
                return `re-entrant lock for ${ev.actor} at t=${ev.t.toFixed(2)}s without prior unlock`;
            }
            opens[ev.actor] = ev.t;
        } else if (ev.type === 'unlock') {
            if (!opens[ev.actor]) {
                return `unlock for ${ev.actor} at t=${ev.t.toFixed(2)}s without prior lock`;
            }
            if (ev.t <= opens[ev.actor]) {
                return `unlock at t=${ev.t.toFixed(2)}s precedes lock at t=${opens[ev.actor].toFixed(2)}s for ${ev.actor}`;
            }
            delete opens[ev.actor];
        }
    }
    return null;
}

function checkBurstPositions() {
    for (const ev of dataset.events) {
        if (ev.type !== 'intercept' && ev.type !== 'hit') continue;
        // Burst entity: target for `hit`, actor for `intercept`
        const burstId = ev.type === 'hit' ? ev.target : ev.actor;
        if (!burstId) {
            return `event ${ev.type} at t=${ev.t.toFixed(2)}s: missing burst entity id (need target for hit or actor for intercept)`;
        }
        const s = getStateAtTime(burstId, ev.t);
        if (!s) {
            return `event ${ev.type} at t=${ev.t.toFixed(2)}s: burst entity ${burstId} not active`;
        }
    }
    return null;
}

// ---- Run all checks ----
console.log(`Validating ${path.relative(repoRoot, datasetPath)}\n`);
check('1. Dataset shape conforms to schema', checkShape);
check('2. JS module syntax', checkSyntax);
check('3. Orientation continuity at keyframe boundaries', checkOrientationContinuity);
check('4. Velocity from position vs keyframe velocity', checkVelocityFromPosition);
check('5. Closure rate vs numeric dRange/dt', checkClosureRate);
check('6. G-force physically reasonable (|dv/dt|/9.8)', checkGForce);
check('7. Derived telemetry in physical range', checkDerivedRanges);
check('8. Lock/unlock events form valid closed intervals', checkLockWindows);
check('9. Burst events at known entity positions', checkBurstPositions);

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
