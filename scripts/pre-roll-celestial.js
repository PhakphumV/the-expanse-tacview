#!/usr/bin/env node
// Pre-roll the Moon tracks so ADR-0006's half-orbit trail has real history.
//
//   leo       — the track is exactly periodic (display period 11 150 s), so the
//               pre-roll is the tail of the same track shifted back one period.
//               No new numbers, no model drift.
//   apollo11  — fetch JPL Horizons (target 301, DE441, geocentric ICRF) for the
//               12.3 days before launch at the same 900 s grid as the track.
//
// Usage: node scripts/pre-roll-celestial.js
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'scenarios.json');

function quatFromMinusZ(v) {
    const n = Math.hypot(v[0], v[1], v[2]);
    const u = [v[0] / n, v[1] / n, v[2] / n];
    const a = [0, 0, -1];
    const r = a[0] * u[0] + a[1] * u[1] + a[2] * u[2] + 1;
    if (r < 1e-8) return [1, 0, 0, 0];
    const c = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const nn = Math.hypot(c[0], c[1], c[2], r);
    return [c[0] / nn, c[1] / nn, c[2] / nn, r / nn].map((x) => Math.round(x * 1e8) / 1e8);
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// --- leo: copy the periodic tail backwards one display period --------------
function preRollLeo(track) {
    if (track.samples[0].t < 0) return { count: 0, span: 0, period: 0, skipped: true };
    const first = track.samples[0];
    const last = track.samples[track.samples.length - 1];
    const period = last.t - first.t;
    // Same test as the periodicity check: the model must close on itself.
    const d = Math.hypot(
        last.position[0] - first.position[0],
        last.position[1] - first.position[1],
        last.position[2] - first.position[2]);
    if (d > 1) throw new Error('leo moon track is not periodic (' + d.toFixed(1) + ' m gap)');
    const want = 0.45 * period;                       // ADR-0006 celestial fraction
    const dt = track.samples[1].t - track.samples[0].t;
    const count = Math.ceil(want / dt);
    const pre = [];
    for (let k = count; k >= 1; k--) {
        const src = track.samples[track.samples.length - 1 - k];
        if (!src) throw new Error('leo moon track is too short for a ' + count + '-sample pre-roll');
        pre.push({
            t: src.t - period,
            position: src.position.slice(),
            velocity: src.velocity.slice(),
            orientation: src.orientation.slice(),
        });
    }
    track.samples = pre.concat(track.samples);
    return { count: pre.length, span: -pre[0].t, period };
}

// --- apollo11: Horizons, same grid, same conventions ----------------------
async function fetchHorizons(epochIso, spanSeconds, stepSeconds) {
    const epochMs = Date.parse(epochIso);
    const start = new Date(epochMs - spanSeconds * 1000);
    const fmt = (d) => d.toISOString().slice(0, 16).replace('T', ' ');
    const url = 'https://ssd.jpl.nasa.gov/api/horizons.api?format=text'
        + "&COMMAND='301'&EPHEM_TYPE=VECTORS&CENTER='500@399'"
        + '&START_TIME=' + encodeURIComponent("'" + fmt(start) + "'")
        + '&STOP_TIME=' + encodeURIComponent("'" + fmt(new Date(epochMs)) + "'")
        + '&STEP_SIZE=' + encodeURIComponent("'" + (stepSeconds / 60) + "m'")
        + "&VEC_TABLE='2'&REF_PLANE=FRAME&OUT_UNITS=KM-S&VEC_CORR=NONE&CSV_FORMAT=YES";
    const res = await fetch(url);
    if (!res.ok) throw new Error('Horizons HTTP ' + res.status);
    const text = await res.text();
    const soe = text.indexOf('$$SOE');
    const eoe = text.indexOf('$$EOE');
    if (soe < 0 || eoe < 0) throw new Error('Horizons response has no $$SOE block');
    const rows = [];
    for (const line of text.slice(soe + 5, eoe).split('\n')) {
        const f = line.split(',').map((s) => s.trim());
        if (f.length < 8 || !f[0]) continue;
        const jd = parseFloat(f[0]);
        if (!isFinite(jd)) continue;
        rows.push({
            jd,
            p: [parseFloat(f[2]) * 1000, parseFloat(f[3]) * 1000, parseFloat(f[4]) * 1000],
            v: [parseFloat(f[5]) * 1000, parseFloat(f[6]) * 1000, parseFloat(f[7]) * 1000],
        });
    }
    return rows;
}

async function preRollApollo(track, epochIso) {
    if (track.samples[0].t < 0) return { count: 0, span: 0, period: 0, want: 0, skipped: true };
    const dt = track.samples[1].t - track.samples[0].t;                 // 900 s
    const period = 2360591.5;                                          // mean lunar period
    const want = 0.45 * period;
    const count = Math.ceil(want / dt);
    const span = count * dt;
    const rows = await fetchHorizons(epochIso, span, dt);
    if (!rows.length) throw new Error('Horizons returned no vectors');

    // The API's epoch rows are TDB; the existing track was built the same way, so
    // anchoring on the last row (t = 0) reproduces the original offsets.
    const jd0 = rows[rows.length - 1].jd;
    const samples = [];
    for (const row of rows) {
        const t = Math.round((row.jd - jd0) * 86400);
        if (t >= 0) continue;
        if (t % dt !== 0) continue;                                     // grid guard
        samples.push({
            t,
            position: row.p.map(r3),
            velocity: row.v.map(r3),
            orientation: quatFromMinusZ(row.v),
        });
    }
    if (!samples.length) throw new Error('no pre-roll rows after grid filtering');
    track.samples = samples.concat(track.samples);
    return { count: samples.length, span: -samples[0].t, period, want };
}

(async function main() {
    const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));

    const leo = data.scenarios.find((s) => s.id === 'leo');
    const leoMoon = leo.tracks.find((t) => t.id === 'moon');
    const a = preRollLeo(leoMoon);
    console.log('leo/moon      pre-roll', a.count, 'samples, span', a.span, 's of', a.period.toFixed(0));

    const ap = data.scenarios.find((s) => s.id === 'apollo11');
    const apMoon = ap.tracks.find((t) => t.id === 'moon');
    const epoch = apMoon.samples[0].t === 0 ? ap.epoch || '1969-07-16T13:32:00Z' : null;
    const b = await preRollApollo(apMoon, epoch);
    console.log('apollo11/moon pre-roll', b.count, 'samples, span', b.span, 's (want', b.want.toFixed(0) + ')');

    fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
    for (const [sc, tr] of [['leo', leoMoon], ['apollo11', apMoon]]) {
        console.log('  ' + sc + '/' + tr.id + ' now t0=' + tr.samples[0].t
            + ' t1=' + tr.samples[tr.samples.length - 1].t + ' n=' + tr.samples.length);
    }
})().catch((e) => { console.error(e); process.exit(1); });
