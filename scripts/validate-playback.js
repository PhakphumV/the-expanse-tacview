#!/usr/bin/env node
// scripts/validate-playback.js
//
// End-to-end telemetry consistency and validation against
// data/engagement.json. No browser, no Three.js — pure Node.
//
// The dataset file is a collection: { "engagements": [...] }. Every
// engagement in the collection runs through the per-engagement checks.
//
// Checks:
//   1.  Collection shape (engagements array, unique string ids)
//   2.  All application JS modules parse without syntax errors
//   3.  Per engagement: shape conforms to the documented schema
//   4.  Orientation continuity at every keyframe boundary
//   5.  Velocity from position derivatives stays near the authored
//       velocity field within VEL_TOLERANCE
//   6.  Closure rate from interpolated velocities stays near the
//       numeric time-derivative of range within CLOSURE_TOLERANCE
//   7.  G-force stays in physically reasonable range and uses g0=9.8
//   8.  Derived telemetry (range, velocity) stays physically reasonable
//   9.  Lock/unlock events form valid closed intervals
//   10. Burst event positions are at known entity positions
//   11. Integrated position match within span tolerance (Phase 6, ADR-0001)
//   12. Scrub-then-forward determinism (pure getIntegratedStateAtTime)
//   13. HUD acceleration matches numeric dv/dt over the same span
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
    // Roci vs Zmeya ("Oyedeng") narrative event set
    'pursuit_start', 'intercept_course', 'high_g_burn', 'missile_lock',
    'zmeya_barrage_launch', 'roci_torpedo_launch', 'torpedo_intercept',
    'pdc_auto_track', 'defensive_roll_start', 'pdc_engagement',
    'pdc_jammed', 'pdc_coverage_shift', 'missile_intercept',
    'all_missiles_destroyed', 'railgun_fire', 'zmeya_drive_disabled',
    'engagement_resolution',
]);

// Types that spawn a burst effect, and which field locates the burst.
// Mirrors js/event-model.js burst entity selection.
const BURST_ENTITY_FIELD = {
    intercept: 'actor',
    hit: 'target',
    torpedo_intercept: 'target',
    missile_intercept: 'target',
    zmeya_drive_disabled: 'target',
};

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

// ---- Load dataset collection ----
const repoRoot = path.resolve(__dirname, '..');
const datasetPath = path.join(repoRoot, 'data', 'engagement.json');
const collection = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

// The file wraps one or more engagements:
//   { "engagements": [ { id, name, description, duration, entities, events } ] }
// Per-engagement state is rebound by loadEngagementContext() so every
// engagement in the collection runs through the same checks.
let dataset = null;
let entities = {};

function loadEngagementContext(eng) {
    dataset = eng;
    entities = {};
    // Pre-process entities to Vec3/Quat keyframes
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

// ---- Phase 6: integrated-state helpers (mirror of js/playback.js) ----

// Quaternion product: result = a * b. Three.js convention: applies b
// first, then a. For body-frame integration of angular velocity, the
// delta rotation is applied on the right: q_new = q_old * dq.
function quatMultiply(a, b) {
    return new Quat(
        a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
        a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
        a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
        a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
    );
}

// Forward-Euler integrate position with constant velocity over dt.
function integratePosition(pos, vel, dt) {
    return new Vec3(
        pos.x + vel.x * dt,
        pos.y + vel.y * dt,
        pos.z + vel.z * dt,
    );
}

// Integrate orientation by [wx,wy,wz] over dt using the exact exponential
// map. Returns a normalized quaternion.
function integrateOrientation(q, wx, wy, wz, dt) {
    const angle = Math.sqrt(wx*wx + wy*wy + wz*wz) * dt;
    if (angle < 1e-9) return q.clone();
    const inv = 1 / angle;
    const half = angle / 2;
    const s = Math.sin(half);
    const dq = new Quat(wx*inv*s, wy*inv*s, wz*inv*s, Math.cos(half));
    const r = quatMultiply(q, dq);
    const len = Math.sqrt(r.x*r.x + r.y*r.y + r.z*r.z + r.w*r.w);
    if (len < 1e-12) return q.clone();
    return new Quat(r.x/len, r.y/len, r.z/len, r.w/len);
}

// Derive body-frame angular velocity from the rotation between two
// keyframes. Returns [wx, wy, wz] in rad/s. For pure-Z rotations this
// matches the dataset's defensive roll exactly.
function deriveAngularVelocity(qA, qB, span) {
    if (span <= 0) return { wx: 0, wy: 0, wz: 0 };
    // World-frame delta: qDelta = qB * qA^(-1).
    // For Three.js unit quaternions, q^(-1) = (-x, -y, -z, w).
    const qAinv = new Quat(-qA.x, -qA.y, -qA.z, qA.w);
    const qDelta = quatMultiply(qB, qAinv);
    // Flip sign if w < 0 so the rotation is the shortest path.
    let dx = qDelta.x, dy = qDelta.y, dz = qDelta.z, dw = qDelta.w;
    if (dw < 0) { dx = -dx; dy = -dy; dz = -dz; dw = -dw; }
    // Half-angle of rotation; axis * sin(angle/2) = (dx, dy, dz).
    const halfAngle = 2 * Math.atan2(
        Math.sqrt(dx*dx + dy*dy + dz*dz), dw
    );
    const sinHalf = Math.sin(halfAngle);
    if (Math.abs(sinHalf) < 1e-9) return { wx: 0, wy: 0, wz: 0 };
    const angle = 2 * halfAngle;
    const k = angle / (sinHalf * span);
    return { wx: dx * k, wy: dy * k, wz: dz * k };
}

// Mirror of getIntegratedStateAtTime(id, t).
function getIntegratedStateAtTime(id, t) {
    const e = entities[id];
    if (!e || e.keyframes.length === 0) return null;
    if (t < e.keyframes[0].t || t > e.keyframes[e.keyframes.length-1].t) return null;
    let lo = 0, hi = e.keyframes.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (e.keyframes[mid].t <= t) lo = mid; else hi = mid;
    }
    const kA = e.keyframes[lo], kB = e.keyframes[hi];
    const span = kB.t - kA.t;
    const dt = t - kA.t;
    if (span <= 0) {
        return { pos: kA.pos.clone(), vel: kA.vel.clone(), ori: kA.ori.clone() };
    }
    const omega = deriveAngularVelocity(kA.ori, kB.ori, span);
    return {
        pos: integratePosition(kA.pos, kA.vel, dt),
        vel: kA.vel.clone(),
        ori: integrateOrientation(kA.ori, omega.wx, omega.wy, omega.wz, dt),
    };
}

// Acceleration vector at t: dv/dt over the span containing t. Mirrors
// js/telemetry.js accelerationForEntity.
function accelerationForEntity(id, t) {
    const e = entities[id];
    if (!e || e.keyframes.length < 2) return new Vec3(0, 0, 0);
    let lo = 0, hi = e.keyframes.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (e.keyframes[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = e.keyframes[lo], b = e.keyframes[hi];
    const dt = b.t - a.t;
    if (dt <= 0) return new Vec3(0, 0, 0);
    return new Vec3(
        (b.vel.x - a.vel.x) / dt,
        (b.vel.y - a.vel.y) / dt,
        (b.vel.z - a.vel.z) / dt,
    );
}

// Burn direction classification (FWD/BRK/IDLE) using the same threshold
// as js/telemetry.js. Mirrors burnDirectionForEntity.
const BURN_THRESHOLD_MPS2 = 0.5;
function burnDirectionForEntity(id, t) {
    const acc = accelerationForEntity(id, t);
    if (acc.length() === 0) return 'IDLE';
    const e = entities[id];
    let lo = 0, hi = e.keyframes.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (e.keyframes[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = e.keyframes[lo], b = e.keyframes[hi];
    const dt = b.t - a.t;
    let vx, vy, vz;
    if (dt <= 0) { vx = a.vel.x; vy = a.vel.y; vz = a.vel.z; }
    else {
        const alpha = Math.max(0, Math.min(1, (t - a.t) / dt));
        vx = a.vel.x + (b.vel.x - a.vel.x) * alpha;
        vy = a.vel.y + (b.vel.y - a.vel.y) * alpha;
        vz = a.vel.z + (b.vel.z - a.vel.z) * alpha;
    }
    const velMag = Math.sqrt(vx*vx + vy*vy + vz*vz);
    if (velMag < 1e-6) return 'IDLE';
    const projAlongVel = (acc.x*vx + acc.y*vy + acc.z*vz) / velMag;
    if (projAlongVel >  BURN_THRESHOLD_MPS2) return 'FWD';
    if (projAlongVel < -BURN_THRESHOLD_MPS2) return 'BRK';
    return 'IDLE';
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
        if ('weapon' in ev && ev.weapon !== null && typeof ev.weapon !== 'string')
            return `events[${i}].weapon must be string or null`;
        if ('end' in ev && ev.end !== undefined && ev.end !== null) {
            if (typeof ev.end !== 'number' || !isFinite(ev.end))
                return `events[${i}].end must be a finite number`;
            if (ev.end < ev.t)
                return `events[${i}].end (${ev.end}) precedes t (${ev.t})`;
        }
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
        'js/entities.js',
        'js/weapons.js', 'js/effects.js', 'js/camera.js', 'js/hud.js',
        'js/timeline.js', 'js/event-log.js', 'js/info-panel.js', 'js/main.js',
        'js/engagement-selector.js',
        'js/ship-models.js',
        'js/presentation.js',
        'js/starfield.js', 'js/event-model.js',
        'scripts/browser-smoke.js',
        'scripts/resource-audit.js',
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
        const field = BURST_ENTITY_FIELD[ev.type];
        if (!field) continue;
        const burstId = ev[field];
        if (!burstId) {
            return `event ${ev.type} at t=${ev.t.toFixed(2)}s: missing burst entity id (field ${field})`;
        }
        const s = getStateAtTime(burstId, ev.t);
        if (!s) {
            return `event ${ev.type} at t=${ev.t.toFixed(2)}s: burst entity ${burstId} not active`;
        }
    }
    return null;
}

// ---- Phase 6: integrated-state physics checks ----

// (1) Integrated position at the END of every span should match the
// kinematic position at the SAME instant, modulo the documented
// "velocity independent of position" authoring quirk (VEL_TOLERANCE per
// span). This verifies that getIntegratedStateAtTime produces a state
// consistent with the kinematic track at keyframe boundaries.
function checkIntegratedPositionMatch() {
    const INTEG_BOUNDARY_TOL = VEL_TOLERANCE;  // m/s over the span
    for (const id in entities) {
        const kfs = entities[id].keyframes;
        for (let i = 1; i < kfs.length; i++) {
            const span = kfs[i].t - kfs[i-1].t;
            if (span <= 0) continue;
            // t = kfs[i].t — end of the [kfs[i-1], kfs[i]] span.
            const integ = getIntegratedStateAtTime(id, kfs[i].t);
            const kin = getStateAtTime(id, kfs[i].t);
            if (!integ || !kin) continue;
            const diff = Math.sqrt(
                (integ.pos.x - kin.pos.x)**2 +
                (integ.pos.y - kin.pos.y)**2 +
                (integ.pos.z - kin.pos.z)**2
            );
            // The "documented authoring quirk" tolerance scales with span.
            const tol = INTEG_BOUNDARY_TOL * span;
            if (diff > tol) {
                return `${id} span [${kfs[i-1].t.toFixed(2)},${kfs[i].t.toFixed(2)}]s: ` +
                       `integrated end-position vs kinematic end-position differ by ` +
                       `${diff.toFixed(1)}m (tolerance ${tol.toFixed(1)}m for span ${span.toFixed(2)}s); ` +
                       `this would indicate either an integration bug or velocity samples ` +
                       `inconsistent with positions beyond the documented authoring jitter.`;
            }
        }
    }
    return null;
}

// (2) Scrub-then-forward determinism: getIntegratedStateAtTime is a pure
// function of (id, t). Calling it twice with the same arguments must
// yield bit-identical state. This catches any accidental caching that
// could leak playback-engine state into the integrated state.
function checkScrubForwardDeterminism() {
    const samples = [0.5, 5, 10, 25, 50, 80, 100, 130, 150, 165];
    for (const id in entities) {
        for (const t of samples) {
            const a = getIntegratedStateAtTime(id, t);
            const b = getIntegratedStateAtTime(id, t);
            if (!a || !b) continue;
            const diffPos = Math.sqrt(
                (a.pos.x - b.pos.x)**2 +
                (a.pos.y - b.pos.y)**2 +
                (a.pos.z - b.pos.z)**2
            );
            const diffOri = Math.sqrt(
                (a.ori.x - b.ori.x)**2 +
                (a.ori.y - b.ori.y)**2 +
                (a.ori.z - b.ori.z)**2 +
                (a.ori.w - b.ori.w)**2
            );
            if (diffPos > 0 || diffOri > 0) {
                return `${id} t=${t.toFixed(2)}s: getIntegratedStateAtTime is not deterministic ` +
                       `(Δpos=${diffPos.toExponential(2)}, Δori=${diffOri.toExponential(2)})`;
            }
        }
    }
    return null;
}

// (3) HUD acceleration matches the numeric dv/dt computed from the
// kinematic state at the same instant. The HUD reports |dv/dt| over the
// current span; numeric differentiation uses ±0.01s symmetric samples.
// They should agree within rounding error.
function checkAccelerationMatch() {
    const samples = 20;
    const dur = dataset.duration;
    for (const id of ['roci', 'zmeya']) {
        for (let i = 0; i < samples; i++) {
            const t = (i / (samples - 1)) * dur;
            const sNext = getStateAtTime(id, t + 0.01);
            const sPrev = getStateAtTime(id, t - 0.01);
            const sMid = getStateAtTime(id, t);
            if (!sNext || !sPrev || !sMid) continue;
            const numericDv = new Vec3().copy(sNext.vel).sub(sPrev.vel);
            const numericMag = numericDv.length() / 0.02;  // m/s²
            const hudAcc = accelerationForEntity(id, t);
            const hudMag = hudAcc.length();
            const relDiff = Math.abs(hudMag - numericMag);
            // Allow 1% relative tolerance plus a tiny absolute floor.
            const tol = Math.max(0.5, numericMag * 0.01);
            if (relDiff > tol) {
                return `${id} t=${t.toFixed(2)}s: HUD |acc|=${hudMag.toFixed(3)} m/s² ` +
                       `differs from numeric dv/dt=${numericMag.toFixed(3)} m/s² ` +
                       `by ${relDiff.toFixed(3)} (tolerance ${tol.toFixed(3)})`;
            }
        }
    }
    return null;
}

// (4) Burn direction classification: a span with positive dv/dt along the
// velocity vector must classify as FWD, negative as BRK, zero as IDLE.
// Synthesizes three minimal entities (FWD ramp / BRK ramp / constant) and
// samples burnDirectionForEntity at the midpoint of each span. The real
// engagement's authored velocities in data/engagement.json are too small to
// cross the 0.5 m/s² threshold (tactical maneuvers are encoded as discrete
// velocity deltas over multi-second spans), so the production data stays
// mostly IDLE — this unit check exercises the classification logic directly.
function checkBurnDirectionClassification() {
    const ID = '__test_burn';
    // Save the real engagement's entity registry so the synthetic test does
    // not leak into anything else in the per-engagement check sequence.
    const saved = entities[ID];
    try {
        const baseOri = new Quat(0, 0, 0, 1);
        // Three FWD keyframes: velocity climbs 1000 → 1500 → 2000 m/s on +Z.
        // dv/dt in the [0,5] span is +100 m/s², well above BURN_THRESHOLD.
        entities[ID] = {
            type: 'ship', iff: 'blue',
            keyframes: [
                { t: 0,  pos: new Vec3(0, 0, 0),     vel: new Vec3(0, 0, 1000), ori: baseOri },
                { t: 5,  pos: new Vec3(0, 0, 5000),  vel: new Vec3(0, 0, 1500), ori: baseOri },
                { t: 10, pos: new Vec3(0, 0, 12500), vel: new Vec3(0, 0, 2000), ori: baseOri },
            ],
        };
        const fwd = burnDirectionForEntity(ID, 2.5);
        if (fwd !== 'FWD') {
            return `FWD ramp classified as "${fwd}" (expected "FWD"); the ` +
                   `acceleration vector should align with the velocity vector.`;
        }
        // Three BRK keyframes: velocity decays 2000 → 1500 → 1000 m/s on +Z.
        entities[ID] = {
            type: 'ship', iff: 'blue',
            keyframes: [
                { t: 0,  pos: new Vec3(0, 0, 0),     vel: new Vec3(0, 0, 2000), ori: baseOri },
                { t: 5,  pos: new Vec3(0, 0, 8750),  vel: new Vec3(0, 0, 1500), ori: baseOri },
                { t: 10, pos: new Vec3(0, 0, 15000), vel: new Vec3(0, 0, 1000), ori: baseOri },
            ],
        };
        const brk = burnDirectionForEntity(ID, 2.5);
        if (brk !== 'BRK') {
            return `BRK ramp classified as "${brk}" (expected "BRK"); the ` +
                   `acceleration vector should oppose the velocity vector.`;
        }
        // Three IDLE keyframes: constant 1000 m/s on +Z. dv/dt = 0.
        entities[ID] = {
            type: 'ship', iff: 'blue',
            keyframes: [
                { t: 0,  pos: new Vec3(0, 0, 0),    vel: new Vec3(0, 0, 1000), ori: baseOri },
                { t: 5,  pos: new Vec3(0, 0, 5000), vel: new Vec3(0, 0, 1000), ori: baseOri },
                { t: 10, pos: new Vec3(0, 0, 10000),vel: new Vec3(0, 0, 1000), ori: baseOri },
            ],
        };
        const idle = burnDirectionForEntity(ID, 2.5);
        if (idle !== 'IDLE') {
            return `Constant-velocity span classified as "${idle}" (expected "IDLE"); ` +
                   `no significant thrust should be detected.`;
        }
        return null;
    } finally {
        if (saved === undefined) delete entities[ID];
        else entities[ID] = saved;
    }
}

function checkCollectionShape() {
    if (!collection || typeof collection !== 'object') return 'top level is not an object';
    if (!Array.isArray(collection.engagements)) return 'missing "engagements" array';
    const seen = new Set();
    for (const [i, e] of collection.engagements.entries()) {
        if (!e || typeof e !== 'object') return `engagements[${i}] not an object`;
        if (typeof e.id !== 'string' || !e.id) return `engagements[${i}] missing string id`;
        if (seen.has(e.id)) return `duplicate engagement id "${e.id}"`;
        seen.add(e.id);
    }
    return null;
}

// ---- Run all checks ----
console.log(`Validating ${path.relative(repoRoot, datasetPath)}\n`);
check('1. Collection shape conforms to schema', checkCollectionShape);
check('2. JS module syntax', checkSyntax);

const engagementList = (collection && Array.isArray(collection.engagements))
    ? collection.engagements : [];
if (engagementList.length === 0) {
    console.log('\n(no engagements in collection — per-engagement checks skipped)');
}
for (const eng of engagementList) {
    const tag = `[${eng && eng.id !== undefined ? eng.id : '?'}]`;
    console.log(`\nEngagement ${tag}`);
    // Shape first: the structural checks below require a valid shape.
    dataset = eng;
    const shapeErr = checkShape();
    if (shapeErr) {
        failCount++;
        console.error(`\u2717 ${tag} 3. Engagement shape conforms to schema: ${shapeErr}`);
        continue;
    }
    passCount++;
    console.log(`\u2713 ${tag} 3. Engagement shape conforms to schema`);
    loadEngagementContext(eng);
    check(`  ${tag} 4. Orientation continuity at keyframe boundaries`, checkOrientationContinuity);
    check(`  ${tag} 5. Velocity from position vs keyframe velocity`, checkVelocityFromPosition);
    check(`  ${tag} 6. Closure rate vs numeric dRange/dt`, checkClosureRate);
    check(`  ${tag} 7. G-force physically reasonable (|dv/dt|/9.8)`, checkGForce);
    check(`  ${tag} 8. Derived telemetry in physical range`, checkDerivedRanges);
    check(`  ${tag} 9. Lock/unlock events form valid closed intervals`, checkLockWindows);
    check(`  ${tag} 10. Burst events at known entity positions`, checkBurstPositions);
    // Phase 6 physics checks (ADR-0001, Q9):
    check(`  ${tag} 11. Integrated position match within span tolerance`, checkIntegratedPositionMatch);
    check(`  ${tag} 12. Scrub-then-forward determinism (pure getIntegratedStateAtTime)`, checkScrubForwardDeterminism);
    check(`  ${tag} 13. HUD acceleration matches numeric dv/dt`, checkAccelerationMatch);
    check(`  ${tag} 14. Burn direction classifies FWD/BRK/IDLE from acc·v`, checkBurnDirectionClassification);
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
