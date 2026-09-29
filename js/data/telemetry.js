// js/data/telemetry.js
// Derived telemetry: G-force, aspect angle, range, closure rate,
// Acceleration (G), Burn Direction (FWD/BRK/IDLE), Roll (°).
// Pure computation; takes a playback engine and returns derived values per ship.

import {
    clamp,
    lerp,
    quaternionToEulerXYZ,
    radiansToDegrees,
    rotateVectorByQuaternion,
} from '../utils/math.js';
import { CONFIG } from '../utils/config.js';

const TELEMETRY_CONFIG = CONFIG.telemetry;

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
    const dx = b.vel.x - a.vel.x;
    const dy = b.vel.y - a.vel.y;
    const dz = b.vel.z - a.vel.z;
    const aMag = Math.hypot(dx, dy, dz) / dt;
    return aMag / TELEMETRY_CONFIG.gravity;
}

// Acceleration vector in m/s², computed from adjacent keyframes' velocities.
function accelerationForEntity(ent, t, out) {
    const kfs = ent.keyframes;
    if (!out) out = { x: 0, y: 0, z: 0 };
    if (kfs.length < 2) { out.x = 0; out.y = 0; out.z = 0; return out; }
    const bracket = findBracket(kfs, t);
    if (!bracket) { out.x = 0; out.y = 0; out.z = 0; return out; }
    const a = bracket.a, b = bracket.b;
    const dt = b.t - a.t;
    if (dt <= 0) { out.x = 0; out.y = 0; out.z = 0; return out; }
    out.x = (b.vel.x - a.vel.x) / dt;
    out.y = (b.vel.y - a.vel.y) / dt;
    out.z = (b.vel.z - a.vel.z) / dt;
    return out;
}

function burnDirectionForEntity(ent, t) {
    const acc = accelerationForEntity(ent, t);
    if (Math.hypot(acc.x, acc.y, acc.z) === 0) return 'IDLE';
    // Need the velocity at the same instant. Find the bracket and lerp the velocity.
    const kfs = ent.keyframes;
    const bracket = findBracket(kfs, t);
    if (!bracket) return 'IDLE';
    const a = bracket.a, b = bracket.b;
    const dt = b.t - a.t;
    let velX, velY, velZ;
    if (dt <= 0) {
        velX = a.vel.x;
        velY = a.vel.y;
        velZ = a.vel.z;
    } else {
        const alpha = clamp((t - a.t) / dt, 0, 1);
        velX = lerp(a.vel.x, b.vel.x, alpha);
        velY = lerp(a.vel.y, b.vel.y, alpha);
        velZ = lerp(a.vel.z, b.vel.z, alpha);
    }
    const velMag = Math.hypot(velX, velY, velZ);
    if (velMag < 1e-6) return 'IDLE';
    const dot = acc.x * velX + acc.y * velY + acc.z * velZ;
    const projAlongVel = dot / velMag;  // m/s² along velocity direction
    if (projAlongVel > TELEMETRY_CONFIG.burnThresholdMps2) return 'FWD';
    if (projAlongVel < -TELEMETRY_CONFIG.burnThresholdMps2) return 'BRK';
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
    const euler = quaternionToEulerXYZ(integratedOrientation.orientation);
    return {
        heading: radiansToDegrees(euler.y),
        pitch:  radiansToDegrees(euler.x),
        roll:   radiansToDegrees(euler.z),
    };
}

function aspectAngleDeg(shipPos, shipQuat, otherPos) {
    const forward = rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, shipQuat);
    const dx = otherPos.x - shipPos.x;
    const dy = otherPos.y - shipPos.y;
    const dz = otherPos.z - shipPos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-6) return 0;
    const dot = clamp((forward.x * dx + forward.y * dy + forward.z * dz) / dist, -1, 1);
    return radiansToDegrees(Math.acos(dot));
}

export function createTelemetry(playbackEngine, shipA = 'roci', shipB = 'zmeya') {
    function computeForPair(stateMap, integratedMap, t) {
        const a = stateMap[shipA], b = stateMap[shipB];
        const iA = integratedMap[shipA], iB = integratedMap[shipB];
        if (!a || !b || !a.active || !b.active) return null;
        const sepX = b.position.x - a.position.x;
        const sepY = b.position.y - a.position.y;
        const sepZ = b.position.z - a.position.z;
        const range = Math.hypot(sepX, sepY, sepZ);
        const relVelX = b.velocity.x - a.velocity.x;
        const relVelY = b.velocity.y - a.velocity.y;
        const relVelZ = b.velocity.z - a.velocity.z;
        let closure = 0;
        if (range > 1e-6) {
            closure = (sepX * relVelX + sepY * relVelY + sepZ * relVelZ) / range;
        }
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
