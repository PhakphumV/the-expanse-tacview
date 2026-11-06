// js/main.js
// Entry point (classic script, loaded last). Boots the viewer from the
// embedded dataset (window.TacviewData), wires camera/HUD/timeline/labels,
// and runs the per-frame loop. No fetch, no server: open index.html directly.

(function (global) {
    'use strict';
    const T = global.Tacview;

    const container = document.getElementById('container');
    const { scene, camera, renderer, controls, bodies, getBodyWorldPosition, render } = T.createScene(container);

    const engine = T.createEphemerisEngine();
    const timeline = T.createTimeline(engine);
    const cameraCtl = T.createCameraController(camera, controls, engine, bodies, getBodyWorldPosition);

    let entities = [];
    let hud = null;
    let labels = null;

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

    // Camera mode buttons (Orbit / Follow).
    for (const [id, m] of [['modeOrbitBtn', 'orbit'], ['modeFollowBtn', 'follow']]) {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cameraCtl.setMode(m));
    }

    // Zoom slider (0 = zoomed out, 100 = zoomed in); keyboard zoom stays +/-, PageUp/PageDown.
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) zoomSlider.addEventListener('input', () => cameraCtl.setZoomNorm(+zoomSlider.value / 100));

    // Camera + trail keyboard shortcuts (1=Orbit, 2=Follow, T=trails).
    const trailsBtn = document.getElementById('trailsBtn');
    function setTrailsVisible(v) {
        if (entities.length) entities.forEach((e) => e.setTrailsVisible(v));
        if (trailsBtn) trailsBtn.textContent = v ? 'Trail: ON' : 'Trail: OFF';
    }
    window.addEventListener('keydown', function (e) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === '1') cameraCtl.setMode('orbit');
        else if (e.key === '2') cameraCtl.setMode('follow');
        else if (e.key === 't' || e.key === 'T') setTrailsVisible(!(entities[0] && entities[0].getTrailsVisible()));
        else if (e.key === 'PageUp' || e.key === '+' || e.key === '=') cameraCtl.zoom(1 / cameraCtl.ZOOM_BUTTON_STEP);
        else if (e.key === 'PageDown' || e.key === '-') cameraCtl.zoom(cameraCtl.ZOOM_BUTTON_STEP);
    });

    // Boot from the embedded dataset.
    engine.load(global.TacviewData);
    entities = engine.getTracks().map((tr) => T.createTrackEntity(scene, engine, camera, tr.id));
    labels = T.createLabels(engine, camera);

    // Selectable HUD: celestial bodies first, then tracks. Selecting retargets
    // the camera.
    const targets = [
        { id: 'earth', label: 'Earth' },
        { id: 'moon', label: 'Moon' },
    ].concat(engine.getTracks().map((tr) => ({ id: tr.id, label: tr.meta.OBJECT_NAME || tr.id })));
    hud = T.createHUD(engine, targets, (id) => cameraCtl.setTarget(id));

    const t0 = engine.getTime();
    entities.forEach((e) => e.update(t0));
    trailBtnWiring();
    timeline.updateUI();
    hud.setTarget('earth');
    cameraCtl.setTarget('earth');
    cameraCtl.setMode('orbit');
    labels.update();

    function trailBtnWiring() {
        trailsBtn.addEventListener('click', () => setTrailsVisible(!(entities[0] && entities[0].getTrailsVisible())));
    }

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
        hud.update();
        updateHeader();
        labels.update();
        render();
    }
    animate();
})(window);
