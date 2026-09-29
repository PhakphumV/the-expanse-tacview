// js/telemetry.js
// Derived telemetry: G-force, aspect angle, range, closure rate,
// Acceleration (G), Burn Direction (FWD/BRK/IDLE), Roll (°).
// Pure computation; takes a playback engine and returns derived values per ship.

import { clamp, radiansToDegrees } from './utils/math.js';

const THREE = window.THREE;
const G = 9.8;

// Threshold for the FWD/BRK/IDLE classification: |acc·v|/|v| > THRESHOLD
// means a thrust component along velocity exceeds this many m/s². At 0.5
// m/s² (about 0.05 G), it filters out drift / numerical noise without
// hiding genuine burns (sustained 8 G pursuit burns will obviously clear
// this bar by orders of magnitude).
const BURN_THRESHOLD_MPS2 = 0.5;

// Three.js Euler instance for extracting the body's longitudinal (z) rotation.
const _euler = new THREE.Euler();

function findBracket(kfs, t) {
    if (kfs.length === 0) return null;
    if (t <= kfs[0].t) return { a: kfs[0], b: kfs[0] };
    if (t >= kfs[kfs.length - 1].t) {
        const last = kfs.length - 1;
        return { a: kfs[last - 1] || kfs[last], b: kfs[last] };
    }
    let i = 0;
    while (i < kfs.length - 1 && kfs[i + 1].t < t) i++;
    return { a: kfs[i], b: kfs[i + 1] };
}

function gForceForEntity(ent, t) {
    const kfs = ent.keyframes;
    if (kfs.length < 2) return 0;
    const bracket = findBracket(kfs, t);
    if (!bracket) return 0;
    const a = bracket.a, b = bracket.b;
    const dt = b.t - a.t;
    if (dt <= 0) return 0;
    const dv = new THREE.Vector3().subVectors(b.vel, a.vel);
    const aMag = dv.length() / dt;
    return aMag / G;
}

// Acceleration vector in m/s², computed from adjacent keyframes' velocities.
function accelerationForEntity(ent, t, out) {
    const kfs = ent.keyframes;
    if (!out) out = new THREE.Vector3();
    if (kfs.length < 2) { out.set(0, 0, 0); return out; }
    const bracket = findBracket(kfs, t);
    if (!bracket) { out.set(0, 0, 0); return out; }
    const a = bracket.a, b = bracket.b;
    const dt = b.t - a.t;
    if (dt <= 0) { out.set(0, 0, 0); return out; }
    out.subVectors(b.vel, a.vel).divideScalar(dt);
    return out;
}

function burnDirectionForEntity(ent, t) {
    const acc = accelerationForEntity(ent, t);
    if (acc.length() === 0) return 'IDLE';
    // Need the velocity at the same instant. Find the bracket and lerp the velocity.
    const kfs = ent.keyframes;
    const bracket = findBracket(kfs, t);
    if (!bracket) return 'IDLE';
    const a = bracket.a, b = bracket.b;
    const dt = b.t - a.t;
    let vel;
    if (dt <= 0) {
        vel = a.vel.clone();
    } else {
        const alpha = clamp((t - a.t) / dt, 0, 1);
        vel = new THREE.Vector3().copy(a.vel).lerp(b.vel, alpha);
    }
    const velMag = vel.length();
    if (velMag < 1e-6) return 'IDLE';
    const dot = acc.x * vel.x + acc.y * vel.y + acc.z * vel.z;
    const projAlongVel = dot / velMag;  // m/s² along velocity direction
    if (projAlongVel > BURN_THRESHOLD_MPS2) return 'FWD';
    if (projAlongVel < -BURN_THRESHOLD_MPS2) return 'BRK';
    return 'IDLE';
}

// Body-frame Euler decomposition of the integrated orientation, in degrees.
// Order is XYZ (aerospace convention): X = pitch, Y = heading/yaw, Z = roll.
// Uses the integrated orientation (synthetic ω from ADR-0002) so heading,
// pitch, and roll read as continuous rotations rather than whatever slerp
// the kinematic state happens to produce.
function eulerDegForEntity(integratedOrientation) {
    if (!integratedOrientation || !integratedOrientation.active) {
        return { heading: 0, pitch: 0, roll: 0 };
    }
    _euler.setFromQuaternion(integratedOrientation.orientation, 'XYZ');
    return {
        heading: radiansToDegrees(_euler.y),
        pitch:  radiansToDegrees(_euler.x),
        roll:   radiansToDegrees(_euler.z),
    };
}

function aspectAngleDeg(shipPos, shipQuat, otherPos) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(shipQuat).normalize();
    const dir = new THREE.Vector3().subVectors(otherPos, shipPos);
    const dist = dir.length();
    if (dist < 1e-6) return 0;
    dir.normalize();
    const dot = clamp(forward.dot(dir), -1, 1);
    return radiansToDegrees(Math.acos(dot));
}

export function createTelemetry(playbackEngine, shipA = 'roci', shipB = 'zmeya') {
    function computeForPair(stateMap, integratedMap, t) {
        const a = stateMap[shipA], b = stateMap[shipB];
        const iA = integratedMap[shipA], iB = integratedMap[shipB];
        if (!a || !b || !a.active || !b.active) return null;
        const range = new THREE.Vector3().subVectors(b.position, a.position).length();
        const relVel = new THREE.Vector3().subVectors(b.velocity, a.velocity);
        const sep = new THREE.Vector3().subVectors(b.position, a.position);
        let closure = 0;
        if (range > 1e-6) closure = sep.dot(relVel) / range;
        const ents = playbackEngine.getEntities();
        // Heading (yaw) / pitch / roll decomposition of the integrated
        // orientation. The shared module-level _euler is overwritten on
        // each call, so decompose once per ship and reuse the result.
        const eulA = eulerDegForEntity(iA);
        const eulB = eulerDegForEntity(iB);
        return {
            range,
            closureRate: closure,
            gForceA: gForceForEntity(ents[shipA], t),
            gForceB: gForceForEntity(ents[shipB], t),
            aspectAngleA: aspectAngleDeg(a.position, a.orientation, b.position),
            aspectAngleB: aspectAngleDeg(b.position, b.orientation, a.position),
            // New Phase 6 fields (Q7, Q10):
            accelerationA: accelerationForEntity(ents[shipA], t),
            accelerationB: accelerationForEntity(ents[shipB], t),
            burnDirectionA: burnDirectionForEntity(ents[shipA], t),
            burnDirectionB: burnDirectionForEntity(ents[shipB], t),
            // Heading (yaw) / pitch / roll angles in degrees, extracted from
            // the integrated orientation via XYZ-Euler decomposition.
            headingA: eulA.heading,
            pitchA:  eulA.pitch,
            rollA:   eulA.roll,
            headingB: eulB.heading,
            pitchB:  eulB.pitch,
            rollB:   eulB.roll,
        };
    }

    function getDerived(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        const integratedMap = playbackEngine.getIntegratedStateAtTime(t);
        const pair = computeForPair(stateMap, integratedMap, t);
        if (!pair) return null;
        return {
            [shipA]: {
                gForce: pair.gForceA,
                aspectAngle: pair.aspectAngleA,
                range: pair.range,
                closureRate: pair.closureRate,
                acceleration: pair.accelerationA,
                burnDirection: pair.burnDirectionA,
                heading: pair.headingA,
                pitch: pair.pitchA,
                roll: pair.rollA,
            },
            [shipB]: {
                gForce: pair.gForceB,
                aspectAngle: pair.aspectAngleB,
                range: pair.range,
                closureRate: pair.closureRate,
                acceleration: pair.accelerationB,
                burnDirection: pair.burnDirectionB,
                heading: pair.headingB,
                pitch: pair.pitchB,
                roll: pair.rollB,
            },
        };
    }

    return { getDerived };
}
