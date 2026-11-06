// js/main.js
// Entry point (classic script, loaded last). Boots the viewers from the
// embedded dataset (window.TacviewData), wires camera/HUD/timeline/labels,
// and runs the per-frame loop. No fetch, no server: open index.html directly.

(function (global) {
    'use strict';
    const T = global.Tacview;

    const container = document.getElementById('container');
    const { scene, camera, controls, tickStars, render } = T.createScene(container);

    const engine = T.createEphemerisEngine();
    const timeline = T.createTimeline(engine);
    const entity = T.createTrackEntity(scene, engine);
    const labels = T.createLabels(engine, camera);
    const hud = T.createHUD(engine);
    const cameraCtl = T.createCameraController(camera, controls, engine);

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

    // Camera mode buttons.
    const modeBtns = {
        'modeOrbitBtn': 'orbit',
        'modeFollowBtn': 'follow',
        'modeInertialBtn': 'inertial',
    };
    for (const id in modeBtns) {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cameraCtl.setMode(modeBtns[id]));
    }

    // Trails toggle.
    const trailsBtn = document.getElementById('trailsBtn');
    function setTrailsVisible(v) {
        entity.setTrailsVisible(v);
        if (trailsBtn) trailsBtn.textContent = v ? 'Trail: ON' : 'Trail: OFF';
    }
    trailsBtn.addEventListener('click', () => setTrailsVisible(!entity.getTrailsVisible()));

    // Zoom slider (0 = zoomed out, 100 = zoomed in). Keyboard zoom stays mapped to +/-, PageUp/PageDown in the handler below.
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) zoomSlider.addEventListener('input', () => cameraCtl.setZoomNorm(+zoomSlider.value / 100));

    // Camera + trail keyboard shortcuts (1/2/3, T).
    window.addEventListener('keydown', function (e) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === '1') cameraCtl.setMode('orbit');
        else if (e.key === '2') cameraCtl.setMode('follow');
        else if (e.key === '3') cameraCtl.setMode('inertial');
        else if (e.key === 't' || e.key === 'T') setTrailsVisible(!entity.getTrailsVisible());
        else if (e.key === 'PageUp' || e.key === '+' || e.key === '=') cameraCtl.zoom(1 / cameraCtl.ZOOM_BUTTON_STEP);
        else if (e.key === 'PageDown' || e.key === '-') cameraCtl.zoom(cameraCtl.ZOOM_BUTTON_STEP);
    });

    // Boot from the embedded dataset.
    engine.load(global.TacviewData);
    const t0 = engine.getTime();
    entity.update(t0);
    timeline.updateUI();
    hud.update();
    updateHeader();
    labels.update();
    cameraCtl.setMode('inertial'); // start framed to the whole orbit

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
        entity.update(t);
        cameraCtl.update(t);
        timeline.updateUI();
        hud.update();
        updateHeader();
        labels.update();
        tickStars();
        render();
    }
    animate();
})(window);
