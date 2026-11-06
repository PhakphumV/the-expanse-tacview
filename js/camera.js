// js/camera.js
// Camera mode controller focused on space-object viewing:
//   orbit    – free OrbitControls (mouse rotate/pan/zoom around target)
//   follow   – locked to the active track (chase cam behind its velocity)
//   inertial – fixed ECI framing of the whole orbit + Earth (no rotation)
//
// The controller owns controls.update() so Follow/Inertial never fight the
// OrbitControls lookAt (the vendored controls orbit the target in those modes).
//
// Classic-script module: attaches Tacview.createCameraController.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const CHASE_BACK = 3500;   // m behind the object (against velocity)
    const CHASE_UP   = 1400;   // m above the object

    function createCameraController(camera, controls, engine) {
        let mode = 'orbit';

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
                camera.position.copy(st.position).addScaledVector(v, -CHASE_BACK);
                camera.position.y += CHASE_UP;
                camera.lookAt(st.position);
            }
            // inertial: static framing set in setMode(); nothing per-frame.
        }

        return { setMode, getMode, update };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createCameraController = createCameraController;
})(window);
