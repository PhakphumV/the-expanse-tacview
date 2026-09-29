#!/usr/bin/env node
// scripts/resource-audit.js
//
// Static audit of Three.js resource usage in the application. Counts
// geometries, materials, and meshes that the application creates for
// the committed dataset (data/engagement.json). Reports the per-frame
// DOM-touching surface that should be kept bounded.
// No browser required — uses a minimal THREE substitute to walk the
// resource counts.
//
// Usage:  node scripts/resource-audit.js
// Exits 0 on success (audit only — does not fail on threshold breach).

const fs = require('fs');
const path = require('path');

const collection = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'engagement.json'), 'utf8'
));
const engagementList = (collection && Array.isArray(collection.engagements))
    ? collection.engagements : [];
console.log(`Engagements in collection: ${engagementList.length}`);
// Audit the first engagement (the deterministic default the app loads).
const dataset = engagementList[0] || { entities: [], events: [] };

// Count entities by type.
const counts = {};
for (const e of dataset.entities) {
    counts[e.type] = (counts[e.type] || 0) + 1;
}
console.log('Entity counts:');
for (const k of Object.keys(counts).sort()) {
    console.log(`  ${k.padEnd(12)} ${counts[k]}`);
}

const pdcRoundCount = counts.pdc_round || 0;
const pdcEngagementCount = dataset.events.filter(e => e.type === 'pdc_engagement').length;
const tracerCount = pdcEngagementCount * 5;

// Per-ship mesh parts (from js/render/ship-models.js).
const shipParts = {
    roci:  ['hull', 'bow', 'leftNacelle', 'rightNacelle', 'mast', 'dish',
            'turretFwd', 'turretAft', 'glow1', 'glow2'],
    zmeya: ['hull', 'bowWedge', 'bowPoint', 'engineBlock', 'fin',
            'noseWeapon', 'leftWeapon', 'rightWeapon', 'glow'],
};
console.log('\nShip mesh parts (procedural, original):');
for (const id of Object.keys(shipParts)) {
    console.log(`  ${id.toUpperCase().padEnd(8)} ${shipParts[id].length} parts`);
}

// Mirror js/data/event-model.js burst targets and count active entities.
const BURST_ENTITY_FIELD = {
    intercept: 'actor',
    hit: 'target',
    torpedo_intercept: 'target',
    missile_intercept: 'target',
    zmeya_drive_disabled: 'target',
};
const entitiesById = new Map(dataset.entities.map(entity => [entity.id, entity]));
const burstCount = dataset.events.filter(event => {
    const field = BURST_ENTITY_FIELD[event.type];
    const entity = field && entitiesById.get(event[field]);
    return entity && event.t >= entity.keyframes[0].t &&
        event.t <= entity.keyframes[entity.keyframes.length - 1].t;
}).length;
console.log(`\nBurst meshes: ${burstCount} (supported events with active targets)`);

// Starfield: 6000-point BufferGeometry.
console.log('\nStarfield: 6000-point BufferGeometry');

// Trails: one per ship (2 ships × 30 sample ring buffer).
console.log('Trails: 2 (one per ship, 30-sample ring buffer)');

// ---- Per-frame DOM work inventory ----
console.log('\nPer-frame DOM updates (target: bounded):');
const domUpdates = [
    { module: 'ui/hud.js',       work: '20 ship-value text updates plus lock text/class updates', bounded: 'fixed for two ships; text is assigned each frame' },
    { module: 'ui/timeline.js',  work: '2 scrub style updates and 1 time-readout text update', bounded: 'fixed while an engagement is loaded' },
    { module: 'ui/event-log.js', work: 'event visibility toggles and scroll position', bounded: 'only when the last-visible event index changes' },
    { module: 'ui/info-panel.js', work: 'class toggles on tab click', bounded: 'user-driven only; no per-frame work' },
    { module: 'render/entities.js labels', work: 'left/top/display updates for each ship label', bounded: 'at most two labels in the current UI' },
    { module: 'main.js loop',    work: 'animate() calls entities/weapons/effects/timeline/hud/eventLog/labels/camera updates', bounded: 'call fan-out is fixed; query allocations are not measured by this audit' },
];
for (const u of domUpdates) {
    console.log(`  [${u.module}] ${u.work}`);
    console.log(`    ${u.bounded}`);
}

// ---- Three.js resource lifecycle ----
console.log('\nThree.js resource lifecycle:');
console.log('  Geometries created once per dataset load:');
console.log('    - 2 ship models (19 original procedural mesh parts)');
console.log(`    - ${counts.torpedo || 0} torpedo spheres`);
console.log(`    - ${pdcRoundCount} PDC-round BufferGeometries`);
console.log(`    - ${tracerCount} tracer segments (${pdcEngagementCount} windows x 5)`);
console.log('    - 2 trail BufferGeometries (30 sample positions each)');
console.log('    - 6000-point starfield BufferGeometry');
console.log(`    - ${burstCount} burst SphereGeometries (active supported event targets)`);
console.log('  Materials: MeshBasicMaterial per mesh (color-only, no textures)');
console.log('  Reuse: trails and HUD/label elements are reused across playback.');
console.log('         Bursts and tracers are built when the engagement is loaded.');
console.log('  Disposal: engagement-scoped managers dispose replaced resources;');
console.log('            this static audit does not verify runtime GPU memory.');

// ---- Performance targets ----
console.log('\nPerformance targets (target hardware: integrated GPU, 60Hz display):');
console.log('  Frame rate: >= 55 fps at 1920x1080');
console.log('  Frame rate: >= 30 fps at 4K (3840x2160)');
console.log('  Draw calls: <= 50 per frame');
console.log('  JS heap:    bounded — no growth across repeated replay cycles');
console.log('  DOM writes per frame: <= 30');
console.log('  GC pressure: low-allocation goal; runtime allocation profiling required');

console.log('\nGraceful degradation:');
console.log('  - Starfield count is 6000 in js/utils/config.js; reducing it lowers GPU');
console.log('    vertex throughput at the cost of visual density.');
console.log('  - Trail sample count (30) is fixed; reduce in js/render/entities.js for');
console.log('    weaker hardware.');
console.log('  - All meshes use MeshBasicMaterial (no lighting, no shadows); the');
console.log('    application is intentionally low-cost on the GPU.');
console.log('  - No post-processing, no shadow maps, no tone mapping.');
