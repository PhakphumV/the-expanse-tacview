#!/usr/bin/env node
// Unit checks for js/trails.js — the pure trail-geometry maths behind ADR-0006.
// Runs in Node (no browser, no THREE) because the module exports itself when
// `module` exists.
//
//   node scripts/test-trails.js
const Trails = require('../js/trails.js');

let passed = 0;
let failed = 0;

function check(name, fn) {
    let err = null;
    try {
        err = fn() || null;
    } catch (e) {
        err = e.message || String(e);
    }
    if (err) {
        failed++;
        console.log('✗ ' + name + ': ' + err);
    } else {
        passed++;
        console.log('✓ ' + name);
    }
}

const near = (got, want, relTol, what) => {
    const d = Math.abs(got - want);
    if (!(d <= Math.abs(want) * relTol)) {
        return `${what}: got ${got.toFixed(0)}, want ${want.toFixed(0)} (±${(relTol * 100).toFixed(1)} %)`;
    }
    return null;
};

const V = (x, y, z) => ({ x, y, z });
const MU = Trails.MU_EARTH;
const MU_MOON = Trails.MU_MOON;

// A circular equatorial orbit at 400 km, prograde in +y at the +x point.
function circularState(radius, mu, speedScale) {
    const v = Math.sqrt(mu / radius) * (speedScale === undefined ? 1 : speedScale);
    return { position: V(radius, 0, 0), velocity: V(0, v, 0) };
}

check('1. Perimeter of a circle is 2*pi*a', () => {
    const a = 6797000;
    return near(Trails.perimeter(a, 0), 2 * Math.PI * a, 1e-9, 'circle perimeter');
});

check('2. Perimeter of a high-eccentricity orbit matches the ellipse, not 2*pi*a', () => {
    // COLUMBIA's trans-lunar orbit: a = 286 540 km, e = 0.977.
    const a = 286540e3, e = 0.977;
    const p = Trails.perimeter(a, e);
    const circle = 2 * Math.PI * a;
    const err = near(p, 1210155e3, 0.005, 'perimeter');
    if (err) return err;
    if (p > circle * 0.8) return 'perimeter is suspiciously close to 2*pi*a (it should be ~33 % smaller)';
    return null;
});

check('3. Osculating orbit of a LEO state is the LEO orbit', () => {
    const st = circularState(6797000, MU);
    const orb = Trails.orbit(st.position, st.velocity, MU);
    if (!orb || !orb.closed) return 'expected a closed orbit';
    return near(orb.a, 6797000, 0.001, 'a') || near(orb.perimeter, 2 * Math.PI * 6797000, 0.001, 'perimeter');
});

check('4. A state at rest is not a closed orbit (pad case)', () => {
    const st = { position: V(6371000, 0, 0), velocity: V(0, 0, 0) };
    const orb = Trails.orbit(st.position, st.velocity, MU);
    if (orb && orb.closed) return 'a stationary state should not report a closed orbit';
    const len = Trails.targetLength({ kind: 'object', state: st, arcLength: 1e9 });
    return near(len, Trails.MIN_LENGTH, 1e-6, 'fallback length');
});

check('5. An escape state is not closed', () => {
    const st = circularState(7000000, MU, 1.6);   // > escape speed
    const orb = Trails.orbit(st.position, st.velocity, MU);
    if (!orb) return 'orbit() returned null';
    if (orb.closed) return 'hyperbolic state reported as closed';
    if (!(orb.e > 1)) return 'e should exceed 1, got ' + orb.e.toFixed(3);
    return null;
});

check('6. LEO craft trail is an eighth of its orbit (~5 339 km)', () => {
    const st = circularState(6797000, MU);
    const len = Trails.targetLength({ kind: 'object', state: st, arcLength: 2 * Math.PI * 6797000 });
    return near(len, 0.125 * 2 * Math.PI * 6797000, 0.001, 'craft trail');
});

check('7. Celestial trail is 0.45 of the orbit, and the craft cap does not apply', () => {
    const a = 384748e3;
    const st = { position: V(-289293636, 249228958, 131688020), velocity: V(-665.408, -624.567, -346.965) };
    const len = Trails.targetLength({
        kind: 'celestial', state: st, arcLength: 0.75 * Trails.perimeter(a, 0.0549),
    });
    // 0.45 of the real (eccentric) perimeter, not of 2*pi*a.
    return near(len, 0.45 * Trails.perimeter(a, 0.0549), 0.02, 'celestial trail');
});

check('8. The dominant body is the Moon when the craft is close to it', () => {
    const moonPos = V(-3.8e8, 1.2e8, 5.0e7);
    const st = {
        position: V(moonPos.x + 1.8e6, moonPos.y, moonPos.z),
        velocity: V(0, 2500, 0),
    };
    const body = Trails.centralBody(st.position, { position: moonPos, velocity: V(0, 0, 0) });
    if (body.name !== 'moon') return 'expected the Moon to dominate at 1 800 km, got ' + body.name;
    const len = Trails.targetLength({
        kind: 'object', state: st, moon: { position: moonPos, velocity: V(0, 0, 0) }, arcLength: 1e9,
    });
    // A ~1 800 km lunar orbit: an eighth of it is a few thousand km, not a fallback.
    if (!(len > 1e5 && len < 5e6)) return 'lunar trail length looks wrong: ' + len.toFixed(0) + ' m';
    return null;
});

check('9. The Earth still dominates at lunar distance from Earth’s side', () => {
    const moonPos = V(-3.8e8, 1.2e8, 5.0e7);
    const st = circularState(7000000, MU);
    const body = Trails.centralBody(st.position, { position: moonPos, velocity: V(0, 0, 0) });
    if (body.name !== 'earth') return 'expected Earth to dominate in LEO, got ' + body.name;
    return null;
});

check('10. The arc cap trims a craft trail but never a celestial one', () => {
    const st = { position: V(-289293636, 249228958, 131688020), velocity: V(-665.408, -624.567, -346.965) };
    const arc = 400e6;
    const craft = Trails.targetLength({ kind: 'object', state: st, arcLength: arc });
    const celestial = Trails.targetLength({ kind: 'celestial', state: st, arcLength: arc });
    if (!(craft <= Trails.ARC_CAP_FRACTION * arc + 1)) return 'cap did not apply to the craft trail';
    if (!(celestial > Trails.ARC_CAP_FRACTION * arc)) return 'cap should not apply to a celestial trail';
    return null;
});

// Straight-line synthetic track: 1 000 m between samples, 10 s apart.
function lineSamples(count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push({ t: i * 10, position: V(i * 1000, 0, 0) });
    return out;
}

check('11. windowStart walks back exactly the requested path length', () => {
    const samples = lineSamples(60);          // t = 0..590 s, x = 0..59 000 m
    const start = Trails.windowStart(samples, 550, 10000);   // 10 segments = 100 s
    return near(start, 450, 1e-6, 'window start');
});

check('12. windowStart clamps to the first sample when history is short', () => {
    const samples = lineSamples(10);
    const start = Trails.windowStart(samples, 90, 1e9);
    if (start !== samples[0].t) return 'expected ' + samples[0].t + ', got ' + start;
    return null;
});

check('13. A longer length never starts later', () => {
    const samples = lineSamples(60);
    let prev = Infinity;
    for (const L of [1000, 5000, 12000, 30000, 55000]) {
        const start = Trails.windowStart(samples, 590, L);
        if (start > prev) return 'length ' + L + ' started later than a shorter window';
        prev = start;
    }
    return null;
});

check('14. arcLength of the LEO scenario moon is one displayed orbit', () => {
    // The leo moon track is exactly periodic; its arc must match 2*pi*a closely.
    const a = 384400e3;
    const samples = [];
    for (let i = 0; i <= 223; i++) {
        const th = (2 * Math.PI * i) / 223;
        samples.push({ t: i * 50, position: V(a * Math.cos(th), a * Math.sin(th), 0) });
    }
    return near(Trails.arcLength(samples), 2 * Math.PI * a, 0.001, 'arc of one orbit');
});

// A transfer coast state: Apollo 11 TLI cutoff, r = 6 712 km, v = 10.834 km/s.
const COAST = { position: V(6712000, 0, 0), velocity: V(0, 8700000, 6500000) };
const MOON_FAR = V(-3.8e8, 1.2e8, 5.0e7);

check('15. A trans-lunar coast is a transfer, a parking orbit is not', () => {
    const onCoast = Trails.isTransfer({
        state: COAST,
        moon: { position: MOON_FAR, velocity: V(0, 0, 0) },
    });
    if (!onCoast) return 'the TLI coast state should read as a transfer';
    const inLeo = Trails.isTransfer({
        state: circularState(6797000, MU),
        moon: { position: MOON_FAR, velocity: V(0, 0, 0) },
    });
    if (inLeo) return 'a circular parking orbit is not a transfer';
    return null;
});

check('16. A lunar orbit is not a transfer, even though it is hyperbolic about Earth', () => {
    const st = { position: V(MOON_FAR.x + 1.8e6, MOON_FAR.y, MOON_FAR.z), velocity: V(0, 2500, 0) };
    const isT = Trails.isTransfer({ state: st, moon: { position: MOON_FAR, velocity: V(0, 0, 0) } });
    if (isT) return 'a closed orbit about the Moon must not read as a transfer';
    return null;
});

check('17. The transfer window is 60 minutes and matches the sampled path', () => {
    if (Trails.TRANSFER_WINDOW_S !== 3600) return 'TRANSFER_WINDOW_S should be 3600 s';
    // On the real COLUMBIA trans-lunar coast, a 60-minute window should walk back
    // exactly 3 600 s through the samples.
    const data = require('../data/scenarios.json');
    const col = data.scenarios.find((s) => s.id === 'apollo11').tracks.find((t) => t.id === 'COLUMBIA');
    const kfs = col.samples
        .filter((s) => s.t >= 120000 && s.t <= 140000)
        .map((s) => ({ t: s.t, position: V(s.position[0], s.position[1], s.position[2]) }));
    if (kfs.length < 20) return 'coast samples missing from the dataset';
    const t = kfs[kfs.length - 1].t;
    // Distance actually covered in the last 3 600 s of samples.
    let covered = 0;
    for (let i = 1; i < kfs.length; i++) {
        if (kfs[i].t > t - Trails.TRANSFER_WINDOW_S) covered += Trails.dist(kfs[i - 1].position, kfs[i].position);
    }
    // Trim the leading partial segment so `covered` is the arc inside the window.
    const t0 = Trails.windowStart(kfs, t, covered);
    const span = t - t0;
    if (!(span >= 3000 && span <= 4200)) return 'window came back as ' + span.toFixed(0) + ' s';
    return null;
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
