#!/usr/bin/env node
// scripts/embed-scenarios.js
//
// Splits the scenario store (data/scenarios/<id>.json) into per-scenario
// embedded payloads plus a small manifest:
//
//   js/scenarios-data.js     — window.TacviewManifest (id, name, presentation
//                              hints, counts — no samples)
//   js/scenario-<id>.js      — window.TacviewScenarios["<id>"] (the full
//                              scenario: tracks + events)
//
// Why: the viewer decodes telemetry into THREE.Vector3/Quaternion objects at
// load time, so keeping every scenario resident costs real memory. With the
// split, index.html loads the manifest only, and the scenario loader pulls the
// one scenario being watched (js/scenario-loader.js) — a plain <script>
// injection, so this still works from a file:// origin with no server.
//
// Run: node scripts/embed-scenarios.js   (or)   npm run embed

const fs = require('fs');
const path = require('path');
const store = require('./scenario-store');

const repoRoot = path.resolve(__dirname, '..');
const jsDir = path.join(repoRoot, 'js');
const HEADER = '// Generated from the scenario store (data/scenarios/*.json). Do not edit by hand.';
const PRESENTATION = ['epoch', 'duration_s', 'default_speed', 'default_target', 'view_distance_m', 'menu_order'];

// One file per scenario. The selector order comes from menu_order, not from the
// filenames, so renaming a file cannot reorder the menus.
const data = store.dataset();
if (!Array.isArray(data.scenarios) || data.scenarios.length === 0) {
    console.error('data/scenarios/ has no scenario files');
    process.exit(1);
}

const manifest = { scenarios: [] };
const written = [];

for (const sc of data.scenarios) {
    const payload = `${HEADER}\nwindow.TacviewScenarios = window.TacviewScenarios || {};\n`
        + `window.TacviewScenarios[${JSON.stringify(sc.id)}] = ${JSON.stringify(sc)};\n`;
    const file = `scenario-${sc.id}.js`;
    fs.writeFileSync(path.join(jsDir, file), payload);
    written.push(file);

    const entry = { id: sc.id, name: sc.name, description: sc.description || '' };
    for (const f of PRESENTATION) if (sc[f] !== undefined) entry[f] = sc[f];
    entry.tracks = sc.tracks.length;
    entry.events = (sc.events || []).length;
    entry.samples = sc.tracks.reduce((n, t) => n + t.samples.length, 0);
    entry.bytes = Buffer.byteLength(payload);
    manifest.scenarios.push(entry);
}

fs.writeFileSync(
    path.join(jsDir, 'scenarios-data.js'),
    `${HEADER}\n// Scenario manifest only — the payloads live in js/scenario-<id>.js\n`
    + `window.TacviewManifest = ${JSON.stringify(manifest, null, 2)};\n`
);

// Drop payloads for scenarios that no longer exist. Only files this script
// generated are touched — the header check keeps modules such as
// js/scenario-loader.js safe from the pattern match.
for (const f of fs.readdirSync(jsDir)) {
    if (!/^scenario-.+\.js$/.test(f)) continue;
    const fp = path.join(jsDir, f);
    const head = fs.readFileSync(fp, 'utf8').slice(0, 200);
    if (!head.startsWith(HEADER)) continue;
    if (!written.includes(f)) {
        fs.unlinkSync(fp);
        console.log(`removed stale ${f}`);
    }
}

const totalBytes = manifest.scenarios.reduce((n, s) => n + s.bytes, 0);
for (const s of manifest.scenarios) {
    console.log(`${s.id.padEnd(10)} ${String(s.samples).padStart(6)} samples  ${String(s.bytes).padStart(9)} B  ${s.name}`);
}
console.log(`manifest ${fs.statSync(path.join(jsDir, 'scenarios-data.js')).size} B, payloads ${totalBytes} B total`);
