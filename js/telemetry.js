// js/telemetry.js
// Derived telemetry: G-force, aspect angle, range, closure rate.
// Pure computation; takes a playback engine and returns derived values per ship.

const THREE = window.THREE;
const G = 9.8;

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

function aspectAngleDeg(shipPos, shipQuat, otherPos) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(shipQuat).normalize();
    const dir = new THREE.Vector3().subVectors(otherPos, shipPos);
    const dist = dir.length();
    if (dist < 1e-6) return 0;
    dir.normalize();
    const dot = THREE.MathUtils.clamp(forward.dot(dir), -1, 1);
    return Math.acos(dot) * 180 / Math.PI;
}

export function createTelemetry(playbackEngine, shipA = 'roci', shipB = 'zmeya') {
    function computeForPair(stateMap, t) {
        const a = stateMap[shipA], b = stateMap[shipB];
        if (!a || !b || !a.active || !b.active) return null;
        const range = new THREE.Vector3().subVectors(b.position, a.position).length();
        const relVel = new THREE.Vector3().subVectors(b.velocity, a.velocity);
        const sep = new THREE.Vector3().subVectors(b.position, a.position);
        let closure = 0;
        if (range > 1e-6) closure = sep.dot(relVel) / range;
        const ents = playbackEngine.getEntities();
        return {
            range,
            closureRate: closure,
            gForceA: gForceForEntity(ents[shipA], t),
            gForceB: gForceForEntity(ents[shipB], t),
            aspectAngleA: aspectAngleDeg(a.position, a.orientation, b.position),
            aspectAngleB: aspectAngleDeg(b.position, b.orientation, a.position),
        };
    }

    function getDerived(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        const pair = computeForPair(stateMap, t);
        if (!pair) return null;
        return {
            [shipA]: {
                gForce: pair.gForceA,
                aspectAngle: pair.aspectAngleA,
                range: pair.range,
                closureRate: pair.closureRate,
            },
            [shipB]: {
                gForce: pair.gForceB,
                aspectAngle: pair.aspectAngleB,
                range: pair.range,
                closureRate: pair.closureRate,
            },
        };
    }

    return { getDerived };
}
