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
import { createInfoPanel } from './info-panel.js';
import { createEngagementSelector } from './engagement-selector.js';
import { createPresentation, createRangeRings } from './presentation.js';
import { createStarfield } from './starfield.js';

const container = document.getElementById('container');
const { scene, camera, render } = createScene(container);

const playback = createPlaybackEngine();
const telemetry = createTelemetry(playback);
const lockState = createLockState(playback);
const cameraCtl = createCameraController(camera, playback);
const timeline = createTimeline(playback);
const eventLog = createEventLog(playback, timeline.formatTime);
createInfoPanel(eventLog);
const hud = createHUD(playback, telemetry, lockState);
const entities = createEntitiesManager(scene, playback);
const weapons = createWeaponsManager(scene, playback, entities);
const effects = createEffectsManager(scene, playback);
const labels = createLabels(playback, camera);
const presentation = createPresentation(playback);
const rangeRings = createRangeRings(scene, playback);
const starfield = createStarfield(scene, playback);

entities.createShips();

// Camera mode buttons (Phase 6 #32: only Center and Chase remain).
document.getElementById('modeCenterBtn').addEventListener('click', () => cameraCtl.setMode('center'));
document.getElementById('modeChaseBtn').addEventListener('click', () => cameraCtl.setMode('chase'));

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

// Camera mode keyboard shortcuts (1 = Center, 2 = Chase) and chase-target
// cycling via `C` when in Chase mode.
window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === '1') cameraCtl.setMode('center');
    else if (e.key === '2') cameraCtl.setMode('chase');
    else if (e.key === 'c' || e.key === 'C') {
        // Cycle is a no-op when not in Chase mode (no chase target to
        // advance). This keeps the keyboard binding responsive but inert
        // outside the relevant mode.
        if (cameraCtl.getMode() === 'chase') cameraCtl.cycleChaseTarget();
    }
});

// Rebuild every per-engagement structure after the active engagement
// changes: lock state, trails, weapon and effect meshes, range rings,
// labels, timeline markers, event log, and the summary panel.
// loadEntities/loadWeapons/loadBursts/build dispose their previous
// meshes internally, so nothing from the prior engagement remains.
function rebuildForEngagement() {
    lockState.build();
    // Reset the chase target so the new engagement's chase_target
    // declaration (or the roci fallback) takes effect on the next chase
    // mode entry or C-key cycle.
    cameraCtl.onEngagementChanged();
    entities.loadEntities();
    weapons.loadWeapons();
    effects.loadBursts();
    labels.createShipLabels();
    timeline.populateMarkers();
    eventLog.populate();
    rangeRings.build();
    presentation.buildSummary();
    const t0 = playback.getTime();
    entities.update(t0);
    weapons.update(t0, playback.getStateAtTime(t0));
    effects.update(t0);
    rangeRings.update(t0);
    timeline.updateUI();
    hud.update();
    eventLog.update();
    labels.update();
    presentation.update();
}

// Engagement dropdown. Switching pauses the replay, resets time to
// T+00:00, and rebuilds all engagement-scoped state. Camera mode,
// playback speed, and trail visibility are user preferences and are
// preserved across a switch.
function onEngagementSelected(id) {
    try {
        playback.selectEngagement(id);
        rebuildForEngagement();
        selector.clearError();
    } catch (err) {
        selector.showError('Failed to load engagement "' + id + '": ' + err.message);
        selector.syncToActive();
    }
}
const selector = createEngagementSelector(playback, onEngagementSelected);

// Load dataset, build per-entity meshes, populate UI
fetch('data/engagement.json')
    .then((r) => r.json())
    .then((json) => {
        playback.loadCollection(json);
        selector.populate();
        // With an empty collection there is nothing to build; the
        // selector has already shown its empty state.
        if (playback.getActiveEngagementId()) rebuildForEngagement();
    })
    .catch((err) => {
        console.error('Failed to load dataset:', err);
        selector.populate();
        selector.showError('Failed to load dataset: ' + err.message);
    });

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
    cameraCtl.update(t);
    presentation.update();
    // Drift each starfield layer opposite to the ships' mean velocity
    // (Phase 6 #33). dt comes from the per-frame wall clock so the
    // parallax displacement matches the rendered frame rate.
    starfield.update(t, dt);

    render();
}
animate();
