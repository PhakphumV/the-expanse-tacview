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

    // Faint orbit guide rings for celestial tracks (built from their own data).
    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

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

    // Rebuild the render layer. Geometries and materials of the previous
    // scenario are disposed rather than orphaned, so switching scenarios does
    // not accumulate GPU memory alongside the released payload.
    function disposeGroup(group) {
        group.traverse(function (obj) {
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            const mat = obj.material;
            if (Array.isArray(mat)) mat.forEach((m) => m && m.dispose && m.dispose());
            else if (mat && mat.dispose) mat.dispose();
        });
        group.clear();
    }

    // Populate the active scenario's render layer + UI.
    function buildScenario() {
        disposeGroup(trackGroup);
        disposeGroup(ringGroup);
        if (labels) labels.reset();
        entities = engine.getTracks().map((tr) => T.createTrackEntity(trackGroup, engine, camera, tr.id));
        engine.getTracks().filter(isCelestialTrack).forEach((tr) => {
            const ring = T.createOrbitRing(tr.samples);
            if (ring) ringGroup.add(ring);
        });

        if (!labels) labels = T.createLabels(engine, camera);
        if (!hud) hud = T.createHUD(engine, buildTargets(), (id) => cameraCtl.setTarget(id));
        else hud.setTargets(buildTargets());

        timeline.populateEvents();
        applyScenarioDefaults();
        const t = engine.getTime();
        entities.forEach((e) => e.update(t));
        if (labels) labels.update();
        updateHeader();
        timeline.updateUI();
        // Developer hook: the console can inspect live entities, the camera and
        // the trail lengths without every module exporting them.
        window.TacviewDebug = { engine, entities, camera, scene, cameraCtl, trackGroup };
    }

    // Per-scenario presentation hints: playback speed and the framing distance of
    // the initial Earth view (a cislunar scenario needs a far wider shot than a
    // low-Earth-orbit one).
    function applyScenarioDefaults() {
        const meta = (engine.getActiveScenario() || {}).meta || {};
        const speed = typeof meta.default_speed === 'number' ? meta.default_speed : 1;
        engine.setSpeed(speed);
        const sel = document.getElementById('speedSelect');
        if (sel) {
            const want = String(speed);
            const has = Array.from(sel.options).some((o) => o.value === want);
            sel.value = has ? want : sel.value;
            if (!has) engine.setSpeed(parseFloat(sel.value));
        }
        const target = typeof meta.default_target === 'string' ? meta.default_target : 'earth';
        hud.setTarget(target);
        cameraCtl.setTarget(target, meta.view_distance_m);
    }

    // Header readouts (replay status, elapsed, remaining).
    const liveDotEl = document.getElementById('liveDot');
    const statusEl = document.getElementById('replayStatus');
    const elapsedEl = document.getElementById('elapsedReadout');
    const remainEl = document.getElementById('remainingReadout');
    const phaseEl = document.getElementById('phaseReadout');

    // Current mission phase = the last event typed "phase" at or before t.
    function currentPhase(t) {
        let label = null;
        for (const ev of engine.getEvents()) {
            if (ev.type === 'phase' && ev.t <= t) label = ev.label;
        }
        return label;
    }
    function fmt(d) { return T.formatMissionTime(d, engine.getDuration() >= 86400); }
    function updateHeader() {
        const t = engine.getTime();
        const dur = engine.getDuration();
        const remaining = Math.max(0, dur - t);
        if (elapsedEl) elapsedEl.textContent = fmt(t);
        if (remainEl) remainEl.textContent = '-' + fmt(remaining);
        if (statusEl && !loading) {
            const label = engine.isPlaying() ? 'REPLAYING' : 'PAUSED';
            if (statusEl.textContent !== label) statusEl.textContent = label;
        }
        if (liveDotEl) liveDotEl.classList.toggle('paused', !engine.isPlaying());
        if (phaseEl) {
            const label = currentPhase(t) || '\u2014';
            if (phaseEl.textContent !== label) phaseEl.textContent = label;
        }
    }

    // Scenario selector. Payloads live one-per-file; the loader pulls the
    // scenario being watched and releases the previous one so memory stays flat
    // as scenarios are added.
    const scenarioSelect = document.getElementById('scenarioSelect');
    const loader = T.createScenarioLoader();
    let activeScenarioId = null;
    let loading = false;

    function populateScenarios() {
        if (!scenarioSelect) return;
        scenarioSelect.innerHTML = '';
        for (const sc of loader.list()) {
            const o = document.createElement('option');
            o.value = sc.id;
            o.textContent = sc.name;
            scenarioSelect.appendChild(o);
        }
        if (activeScenarioId) scenarioSelect.value = activeScenarioId;
    }

    function activateScenario(id) {
        if (!id || (id === activeScenarioId && !loading)) return;
        const previous = activeScenarioId;
        loading = true;
        if (statusEl) statusEl.textContent = 'LOADING';
        loader.load(id, function (err, raw) {
            loading = false;
            if (err || !raw) {
                console.error(err || new Error('scenario "' + id + '" unavailable'));
                if (statusEl) statusEl.textContent = 'LOAD FAILED';
                return;
            }
            engine.loadScenario(raw);
            activeScenarioId = id;
            if (scenarioSelect) scenarioSelect.value = id;
            buildScenario();
            // Release the previous payload: only the active scenario stays hot.
            if (previous && previous !== id) loader.unload(previous);
        });
    }

    if (scenarioSelect) {
        scenarioSelect.addEventListener('change', function () {
            activateScenario(scenarioSelect.value);
        });
    }

    // Camera mode buttons (Orbit / Follow).
    for (const [id, m] of [['modeOrbitBtn', 'orbit'], ['modeFollowBtn', 'follow']]) {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cameraCtl.setMode(m));
    }

    // Bipolar zoom slider: centre (50) = no zoom, left = continuous zoom out,
    // right = continuous zoom in, and the further from centre the faster the
    // view distance changes.
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomLabel = document.getElementById('zoomSliderLabel');
    function applyZoomSlider() {
        if (!zoomSlider) return;
        const n = (+zoomSlider.value - 50) / 50;
        cameraCtl.setZoomVelocity(n);
        if (zoomLabel) {
            const pct = Math.round(Math.abs(n) * 100);
            zoomLabel.textContent = pct === 0 ? 'ZOOM' : (n < 0 ? 'OUT ' : 'IN ') + pct + '%';
        }
    }
    // Momentary control: releasing the drag (or leaving the control) snaps the
    // slider back to centre, so zoom stops the moment the drag ends.
    function snapZoomToCentre() {
        if (!zoomSlider || +zoomSlider.value === 50) return;
        zoomSlider.value = 50;
        applyZoomSlider();
    }
    if (zoomSlider) {
        zoomSlider.addEventListener('input', applyZoomSlider);
        zoomSlider.addEventListener('change', snapZoomToCentre);
        // Pointer capture during a thumb drag can deliver pointerup to the
        // element, elsewhere, or not at all depending on the browser, so watch
        // the document as well.
        window.addEventListener('pointerup', snapZoomToCentre);
        window.addEventListener('pointercancel', snapZoomToCentre);
        zoomSlider.addEventListener('blur', snapZoomToCentre);
    }
    applyZoomSlider();
    const trailsBtn = document.getElementById('trailsBtn');
    window.addEventListener('keydown', function (e) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === '1') cameraCtl.setMode('orbit');
        else if (e.key === '2') cameraCtl.setMode('follow');
        else if (e.key === 't' || e.key === 'T') setTrails(!(entities[0] && entities[0].getTrailsVisible()));
        else if (e.key === 'PageUp' || e.key === '+' || e.key === '=') cameraCtl.zoom(1 / cameraCtl.ZOOM_STEP);
        else if (e.key === 'PageDown' || e.key === '-') cameraCtl.zoom(cameraCtl.ZOOM_STEP);
    });
    if (trailsBtn) trailsBtn.addEventListener('click', () => setTrails(!(entities[0] && entities[0].getTrailsVisible())));

    // Boot: the manifest names the scenarios; the loader fetches the first one.
    populateScenarios();
    const firstScenario = loader.list()[0];
    if (firstScenario) activateScenario(firstScenario.id);
    cameraCtl.setMode('orbit');

    // Main loop.
    let lastT = performance.now();
    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = (now - lastT) / 1000;
        lastT = now;
        cameraCtl.applyZoomVelocity(dt);

        if (!timeline.isScrubbing() && engine.isPlaying() && engine.getDuration() > 0) {
            let t = engine.getTime() + dt * engine.getSpeed();
            if (t > engine.getDuration()) t = engine.getDuration();
            engine.setTime(t);
        }

        const t = engine.getTime();
        entities.forEach((e) => e.update(t));
        // Dashed guide rings rescale with the camera distance.
        const camDist = camera.position.length();
        ringGroup.children.forEach((ring) => T.updateDashScale(ring, camDist));
        cameraCtl.update(t);
        timeline.updateUI();
        if (hud) hud.update();
        updateHeader();
        if (labels) labels.update();
        render();
    }
    animate();
})(window);
