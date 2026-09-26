// js/main.js
// Entry point. Wires the modules together: loads the dataset, builds the
// scene and entity managers, hooks the timeline and event log, and runs
// the per-frame update/render loop.

import { createScene } from './scene.js';
import { createPlaybackEngine } from './playback.js';
import { createTelemetry } from './telemetry.js';
import { createLockState } from './lock-state.js';
import { createEntitiesManager, createLabels } from './entities.js';
import { createWeaponsManager } from './weapons.js';
import { createEffectsManager } from './effects.js';
import { createCameraController } from './camera.js';
import { createHUD } from './hud.js';
import { createTimeline } from './timeline.js';
import { createEventLog } from './event-log.js';
import { createMinimap } from './minimap.js';

const container = document.getElementById('container');
const { scene, camera, controls, tickStars, render } = createScene(container);

const playback = createPlaybackEngine();
const telemetry = createTelemetry(playback);
const lockState = createLockState(playback);
const cameraCtl = createCameraController(camera, controls, playback);
const timeline = createTimeline(playback);
const eventLog = createEventLog(playback, timeline.formatTime);
const minimap = createMinimap(playback);
const hud = createHUD(playback, telemetry, lockState);
const entities = createEntitiesManager(scene, playback);
const weapons = createWeaponsManager(scene, playback, entities);
const effects = createEffectsManager(scene, playback);
const labels = createLabels(playback, camera);

entities.createShips();

// Camera mode buttons
document.getElementById('modeOrbitBtn').addEventListener('click', () => cameraCtl.setMode('orbit'));
document.getElementById('modeChaseBtn').addEventListener('click', () => cameraCtl.setMode('chase'));
document.getElementById('modeTopBtn').addEventListener('click', () => cameraCtl.setMode('top'));

// Trails toggle (button + 'T' key)
const trailsBtn = document.getElementById('trailsBtn');
function setTrailsVisible(v) {
    entities.setTrailsVisible(v);
    trailsBtn.textContent = v ? 'Trails: ON' : 'Trails: OFF';
}
trailsBtn.addEventListener('click', () => setTrailsVisible(!entities.getTrailsVisible()));
window.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') setTrailsVisible(!entities.getTrailsVisible());
});

// Load dataset, build per-entity meshes, populate UI
fetch('data/engagement.json')
    .then((r) => r.json())
    .then((json) => {
        playback.load(json);
        lockState.build();
        entities.loadEntities();
        weapons.loadWeapons();
        effects.loadBursts();
        minimap.computeBounds();
        labels.createShipLabels();
        timeline.populateMarkers();
        eventLog.populate();
        const t0 = playback.getTime();
        entities.update(t0);
        weapons.update(t0, playback.getStateAtTime(t0));
        effects.update(t0);
        timeline.updateUI();
        hud.update();
        eventLog.update();
        labels.update();
        minimap.draw(t0);
    })
    .catch((err) => console.error('Failed to load dataset:', err));

// Main loop
let lastT = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;

    if (!timeline.isScrubbing() && playback.isPlaying() && playback.getDuration() > 0) {
        let t = playback.getTime() + dt * playback.getSpeed();
        if (t > playback.getDuration()) t = playback.getDuration();
        playback.setTime(t);
    }

    const t = playback.getTime();
    const stateMap = entities.update(t);
    weapons.update(t, stateMap);
    effects.update(t);
    timeline.updateUI();
    hud.update();
    eventLog.update();
    labels.update();
    minimap.draw(t);
    cameraCtl.update(t);

    tickStars();
    render();
}
animate();
