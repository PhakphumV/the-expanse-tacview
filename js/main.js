// js/main.js
// Entry point. Wires the modules together: loads the dataset, builds the
// scene and entity managers, hooks the timeline and event log, and runs
// the per-frame update/render loop.

import { createScene } from './scene.js';
import { createPlaybackEngine } from './playback.js';
import { createTelemetry } from './telemetry.js';
import { createLockState } from './lock-state.js';
import { createMissionState } from './mission-state.js';
import { createEntitiesManager, createLabels } from './entities.js';
import { createWeaponsManager } from './weapons.js';
import { createEffectsManager } from './effects.js';
import { createCameraController } from './camera.js';
import { createHUD } from './hud.js';
import { createTimeline } from './timeline.js';
import { createEventLog } from './event-log.js';
import { createMinimap } from './minimap.js';
import { createPresentation, createRangeRings } from './presentation.js';

const container = document.getElementById('container');
const { scene, camera, controls, tickStars, render } = createScene(container);

const playback = createPlaybackEngine();
const telemetry = createTelemetry(playback);
const lockState = createLockState(playback);
const missionState = createMissionState(playback);
const cameraCtl = createCameraController(camera, controls, playback);
const timeline = createTimeline(playback);
const eventLog = createEventLog(playback, timeline.formatTime);
const minimap = createMinimap(playback);
const hud = createHUD(playback, telemetry, lockState, missionState);
const entities = createEntitiesManager(scene, playback);
const weapons = createWeaponsManager(scene, playback, entities);
const effects = createEffectsManager(scene, playback);
const labels = createLabels(playback, camera);
const presentation = createPresentation(playback);
const rangeRings = createRangeRings(scene, playback);

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

// Camera mode keyboard shortcuts (1/2/3).
window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === '1') cameraCtl.setMode('orbit');
    else if (e.key === '2') cameraCtl.setMode('chase');
    else if (e.key === '3') cameraCtl.setMode('top');
});

// Load dataset, build per-entity meshes, populate UI
fetch('data/engagement.json')
    .then((r) => r.json())
    .then((json) => {
        playback.load(json);
        lockState.build();
        missionState.build();
        entities.loadEntities();
        weapons.loadWeapons();
        effects.loadBursts();
        minimap.computeBounds();
        labels.createShipLabels();
        timeline.populateMarkers();
        eventLog.populate();
        rangeRings.build();
        const t0 = playback.getTime();
        entities.update(t0);
        weapons.update(t0, playback.getStateAtTime(t0));
        effects.update(t0);
        rangeRings.update(t0);
        timeline.updateUI();
        hud.update();
        eventLog.update();
        labels.update();
        minimap.draw(t0);
        presentation.update();
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
    rangeRings.update(t);
    timeline.updateUI();
    hud.update();
    eventLog.update();
    labels.update();
    minimap.draw(t);
    cameraCtl.update(t);
    presentation.update();

    tickStars();
    render();
}
animate();
