// js/camera.js
// Camera mode controller focused on space-object viewing:
//   orbit    – free OrbitControls (mouse rotate/pan around target)
//   follow   – locked to the active track (chase cam behind its velocity)
//   inertial – ECI framing of the whole orbit + Earth (no rotation)
//
// Zoom works in ALL modes. The controller owns zoom: it listens to the
// wheel on the renderer canvas and dollies the camera toward/away from its
// look target (Orbit/Inertial) or scales the chase offset (Follow). The
// vendored OrbitControls wheel-dolly is disabled so there is no double
// handling; rotate/pan still come from OrbitControls in orbit mode.
//
// The controller owns controls.update() so Follow/Inertial never fight the
// OrbitControls lookAt.
//
// Classic-script module: attaches Tacview.createCameraController.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const CHASE_BACK = 3500;   // m behind the object (against velocity)
    const CHASE_UP   = 1400;   // m above the object
    const MIN_DIST = 50;       // m — close enough to see the spacecraft
    const MAX_DIST = 5e8;      // m — past the whole orbit + starfield shell
    const WHEEL_STEP = 1.12;   // zoom factor per wheel notch
    const ZOOM_BUTTON_STEP = 1.3;

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createCameraController(camera, controls, engine) {
        let mode = 'orbit';
        let followScale = 1;   // multiplies chase offsets in Follow mode

        function setActiveButtons(m) {
            const ids = { orbit: 'modeOrbitBtn', follow: 'modeFollowBtn', inertial: 'modeInertialBtn' };
            for (const key in ids) {
                const btn = document.getElementById(ids[key]);
                if (btn) btn.classList.toggle('active', key === m);
            }
        }

        function frameScene() {
            controls.target.set(0, 0, 0);
            camera.position.set(1.2e7, 1.1e7, 2.2e7);
            camera.lookAt(0, 0, 0);
        }

        // Dolly the camera toward/away from its current look target.
        function dolly(factor) {
            if (mode === 'follow') {
                followScale = clamp(followScale * factor, 0.05, 500);
                return; // applied per-frame in update()
            }
            const target = controls.target;
            const dir = new THREE.Vector3().copy(camera.position).sub(target);
            const d = clamp(dir.length() * factor, MIN_DIST, MAX_DIST);
            if (d <= 0) return;
            dir.normalize().multiplyScalar(d);
            camera.position.copy(target).add(dir);
            camera.lookAt(target);
            if (mode === 'orbit') controls.update(); // let OrbitControls adopt it
        }

        function zoom(factor) { dolly(factor); }

        // Wheel zoom on the renderer canvas (all modes).
        // Scroll up (deltaY < 0) zooms in (closer); scroll down zooms out.
        const dom = controls.domElement;
        function onWheel(e) {
            e.preventDefault();
            dolly(e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
        }
        dom.addEventListener('wheel', onWheel, { passive: false });

        // Disable the vendored controls' built-in wheel dolly (we own zoom).
        controls.enableZoom = false;

        function setMode(m) {
            mode = m;
            controls.enabled = (m === 'orbit');
            setActiveButtons(m);
            if (m === 'inertial') frameScene();
            if (m === 'orbit') controls.update();
        }

        function getMode() { return mode; }

        function update(t) {
            if (mode === 'orbit') { controls.update(); return; }
            const st = engine.getStateAtTime(t);
            if (mode === 'follow' && st) {
                const v = st.velocity.clone().normalize();
                camera.position.copy(st.position).addScaledVector(v, -CHASE_BACK * followScale);
                camera.position.y += CHASE_UP * followScale;
                camera.lookAt(st.position);
            }
            // inertial: static framing set in setMode(); zoom moves camera directly.
        }

        return { setMode, getMode, update, zoom, ZOOM_BUTTON_STEP };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createCameraController = createCameraController;
})(window);
