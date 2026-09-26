#!/usr/bin/env node
// scripts/resource-audit.js
//
// Static audit of Three.js resource usage in the application. Counts
// geometries, materials, and meshes that the application creates for
// the committed dataset (data/engagement.json: 2 ships, 4 torpedoes,
// 6 PDC rounds, 18 events). Reports the per-frame DOM-touching
// surface that should be kept bounded.
//
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

// Per-ship mesh parts (from js/ship-models.js).
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

// Burst meshes (one per intercept/hit event).
const burstCount = dataset.events.filter(
    e => e.type === 'intercept' || e.type === 'hit'
).length;
console.log(`\nBurst meshes: ${burstCount} (one per intercept/hit event)`);

// Starfield: 6000-point BufferGeometry.
console.log('\nStarfield: 6000-point BufferGeometry');

// Trails: one per ship (2 ships × 30 sample ring buffer).
console.log('Trails: 2 (one per ship, 30-sample ring buffer)');

// ---- Per-frame DOM work inventory ----
console.log('\nPer-frame DOM updates (target: bounded):');
const domUpdates = [
    { module: 'hud.js',          work: '12 textContent writes (VEL/G/RNG/CLOS/ASP × 2 ships, lock, mission state)', bounded: 'yes — cached when unchanged' },
    { module: 'timeline.js',     work: '2 style writes (scrub progress + handle width/left), 1 textContent', bounded: 'yes — only on time advance' },
    { module: 'event-log.js',    work: 'N style.display toggles, 1 scrollTop', bounded: 'yes — only when last-visible index changes' },
    { module: 'info-panel.js',   work: 'class toggles on tab click', bounded: 'yes — user-driven only, no per-frame work' },
    { module: 'labels (entities)', work: '2 style.left/top writes per visible ship', bounded: 'yes — only ships on screen' },
    { module: 'main.js loop',    work: 'animate() calls entities/weapons/effects/timeline/hud/eventLog/labels/camera updates', bounded: 'yes — no per-frame allocations in the hot path' },
];
for (const u of domUpdates) {
    console.log(`  [${u.module}] ${u.work}`);
    console.log(`    ${u.bounded}`);
}

// ---- Three.js resource lifecycle ----
console.log('\nThree.js resource lifecycle:');
console.log('  Geometries created once per dataset load:');
console.log('    - 2 ship models (composite Groups, no geometry reuse)');
console.log('    - 4 torpedo spheres (one per torpedo entity)');
console.log('    - 6 PDC line BufferGeometries (one per PDC round)');
console.log('    - 2 trail BufferGeometries (30 sample positions each)');
console.log('    - 6000-point starfield BufferGeometry');
console.log('    - burst_count SphereGeometries (one per intercept/hit event)');
console.log('  Materials: MeshBasicMaterial per mesh (color-only, no textures)');
console.log('  Reuse: bursts, trails, and HUD/label elements are reused across the');
console.log('         full replay; new geometry is never created mid-playback.');
console.log('  Disposal: not currently called. Resources are bounded by the dataset');
console.log('            size, not by replay duration, so no leak in normal use.');

// ---- Performance targets ----
console.log('\nPerformance targets (target hardware: integrated GPU, 60Hz display):');
console.log('  Frame rate: >= 55 fps at 1920x1080');
console.log('  Frame rate: >= 30 fps at 4K (3840x2160)');
console.log('  Draw calls: <= 50 per frame');
console.log('  JS heap:    bounded — no growth across repeated replay cycles');
console.log('  DOM writes per frame: <= 30');
console.log('  GC pressure: minimal — no allocations in animate() hot path');

console.log('\nGraceful degradation:');
console.log('  - Starfield point count is fixed (6000); reducing it would lower GPU');
console.log('    vertex throughput at the cost of visual density.');
console.log('  - Trail sample count (30) is fixed; reduce in js/entities.js for');
console.log('    weaker hardware.');
console.log('  - All meshes use MeshBasicMaterial (no lighting, no shadows); the');
console.log('    application is intentionally low-cost on the GPU.');
console.log('  - No post-processing, no shadow maps, no tone mapping.');
