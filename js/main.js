// js/main.js
// Entry point (classic script, loaded last). Boots from the embedded dataset
// (window.TacviewData), wires the scenario selector, camera/HUD/timeline/
// labels, and runs the per-frame loop. No fetch, no server.

(function (global) {
    'use strict';
    const T = global.Tacview;
    const THREE = global.THREE;

    const container = document.getElementById('container');
    const { scene, camera, controls, bodies, getBodyWorldPosition, render } = T.createScene(container);

    const engine = T.createEphemerisEngine();
    const timeline = T.createTimeline(engine);
    const cameraCtl = T.createCameraController(camera, controls, engine, bodies, getBodyWorldPosition);

    // All rendered track objects live under one group so a scenario switch can
    // clear and rebuild them in place.
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    let entities = [];
    let hud = null;
    let labels = null;

    function setTrails(v) {
        entities.forEach((e) => e.setTrailsVisible(v));
        const btn = document.getElementById('trailsBtn');
        if (btn) btn.textContent = v ? 'Trail: ON' : 'Trail: OFF';
    }

    function isCelestialTrack(track) {
        return !!(track && track.meta && track.meta.kind === 'celestial');
    }

    // Bodies first (Earth, then any celestial track such as the Moon), then the
    // artificial space objects — never a duplicate for a body that also has a
    // telemetry track.
    function buildTargets() {
        const tracks = engine.getTracks();
        const row = (tr) => ({ id: tr.id, label: tr.meta.OBJECT_NAME || tr.id });
        return [{ id: 'earth', label: 'Earth' }]
            .concat(tracks.filter(isCelestialTrack).map(row))
            .concat(tracks.filter((tr) => !isCelestialTrack(tr)).map(row));
    }

    // Populate the active scenario's render layer + UI.
    function buildScenario() {
        trackGroup.clear();
        if (labels) labels.reset();
        entities = engine.getTracks().map((tr) => T.createTrackEntity(trackGroup, engine, camera, tr.id));

        if (!labels) labels = T.createLabels(engine, camera);
        if (!hud) hud = T.createHUD(engine, buildTargets(), (id) => cameraCtl.setTarget(id));
        else hud.setTargets(buildTargets());

        timeline.populateEvents();
        cameraCtl.setTarget('earth');
        hud.setTarget('earth');
        const t = engine.getTime();
        entities.forEach((e) => e.update(t));
        if (labels) labels.update();
        updateHeader();
        timeline.updateUI();
    }

    // Header readouts (replay status, elapsed, remaining).
    const liveDotEl = document.getElementById('liveDot');
    const statusEl = document.getElementById('replayStatus');
    const elapsedEl = document.getElementById('elapsedReadout');
    const remainEl = document.getElementById('remainingReadout');
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function fmt(d) {
        const m = Math.floor(d / 60);
        const s = d - m * 60;
        return pad2(m) + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    }
    function updateHeader() {
        const t = engine.getTime();
        const dur = engine.getDuration();
        const remaining = Math.max(0, dur - t);
        if (elapsedEl) elapsedEl.textContent = fmt(t);
        if (remainEl) remainEl.textContent = '-' + fmt(remaining);
        if (statusEl) {
            const label = engine.isPlaying() ? 'REPLAYING' : 'PAUSED';
            if (statusEl.textContent !== label) statusEl.textContent = label;
        }
        if (liveDotEl) liveDotEl.classList.toggle('paused', !engine.isPlaying());
    }

    // Scenario selector.
    const scenarioSelect = document.getElementById('scenarioSelect');
    function populateScenarios() {
        if (!scenarioSelect) return;
        scenarioSelect.innerHTML = '';
        for (const sc of engine.getScenarios()) {
            const o = document.createElement('option');
            o.value = sc.id;
            o.textContent = sc.name;
            scenarioSelect.appendChild(o);
        }
        const active = engine.getActiveScenario();
        if (active) scenarioSelect.value = active.id;
    }
    if (scenarioSelect) {
        scenarioSelect.addEventListener('change', function () {
            if (engine.selectScenario(scenarioSelect.value)) buildScenario();
        });
    }

    // Camera mode buttons (Orbit / Follow).
    for (const [id, m] of [['modeOrbitBtn', 'orbit'], ['modeFollowBtn', 'follow']]) {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cameraCtl.setMode(m));
    }

    // Zoom slider + keyboard (1=Orbit, 2=Follow, T=trails, zoom keys).
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) zoomSlider.addEventListener('input', () => cameraCtl.setZoomNorm(+zoomSlider.value / 100));
    const trailsBtn = document.getElementById('trailsBtn');
    window.addEventListener('keydown', function (e) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === '1') cameraCtl.setMode('orbit');
        else if (e.key === '2') cameraCtl.setMode('follow');
        else if (e.key === 't' || e.key === 'T') setTrails(!(entities[0] && entities[0].getTrailsVisible()));
        else if (e.key === 'PageUp' || e.key === '+' || e.key === '=') cameraCtl.zoom(1 / cameraCtl.ZOOM_BUTTON_STEP);
        else if (e.key === 'PageDown' || e.key === '-') cameraCtl.zoom(cameraCtl.ZOOM_BUTTON_STEP);
    });
    if (trailsBtn) trailsBtn.addEventListener('click', () => setTrails(!(entities[0] && entities[0].getTrailsVisible())));

    // Boot from the embedded dataset.
    engine.load(global.TacviewData);
    populateScenarios();
    buildScenario();
    cameraCtl.setMode('orbit');

    // Main loop.
    let lastT = performance.now();
    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = (now - lastT) / 1000;
        lastT = now;

        if (!timeline.isScrubbing() && engine.isPlaying() && engine.getDuration() > 0) {
            let t = engine.getTime() + dt * engine.getSpeed();
            if (t > engine.getDuration()) t = engine.getDuration();
            engine.setTime(t);
        }

        const t = engine.getTime();
        entities.forEach((e) => e.update(t));
        cameraCtl.update(t);
        timeline.updateUI();
        if (hud) hud.update();
        updateHeader();
        if (labels) labels.update();
        render();
    }
    animate();
})(window);
