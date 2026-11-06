// js/camera.js
// Camera mode controller focused on space-object viewing:
//   orbit    – free OrbitControls (mouse rotate/pan around target)
//   follow   – camera orbits the tracked object (drag to orbit, zoom to pull in)
//   inertial – ECI framing of the whole orbit + Earth (no rotation)
//
// Zoom works in ALL modes (wheel, +/-, slider). Follow mode keeps the camera
// at a spherical offset around the tracked object; dragging rotates it around
// the object, and zoom scales the offset.
//
// The controller owns controls.update() so Follow/Inertial never fight the
// OrbitControls lookAt.
//
// Classic-script module: attaches Tacview.createCameraController.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const MIN_DIST = 50;        // m — close enough to see the spacecraft
    const MAX_DIST = 9e8;       // m — far enough to frame the Moon orbit
    const WHEEL_STEP = 1.12;    // zoom factor per wheel notch
    const ZOOM_BUTTON_STEP = 1.3;

    const FOLLOW_R_MIN = 60;
    const FOLLOW_R_MAX = 2e5;
    const CHASE_BACK = 3500;    // m — seed offset behind the object
    const CHASE_UP   = 1400;    // m — seed offset above the object

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createCameraController(camera, controls, engine) {
        let mode = 'orbit';
        let followSph = null;   // { theta, phi, radius } around the followed object

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

        // Seed the follow orbit offset behind/above the object's heading.
        function seedFollow() {
            const st = engine.getStateAtTime(engine.getTime());
            if (!st) { followSph = { theta: 0, phi: 1.2, radius: CHASE_BACK }; return; }
            const fwd = new THREE.Vector3().copy(st.velocity).normalize();
            const up0 = new THREE.Vector3(0, 1, 0);
            const off = new THREE.Vector3().copy(fwd).multiplyScalar(-CHASE_BACK).addScaledVector(up0, CHASE_UP);
            off.y = Math.max(off.y, 1);
            const r = clamp(off.length(), FOLLOW_R_MIN, FOLLOW_R_MAX);
            followSph = {
                radius: r,
                theta: Math.atan2(off.x, off.z),
                phi: Math.acos(clamp(off.y / r, -1, 1)),
            };
        }

        function applyFollow(st) {
            const s = followSph;
            if (!s) return;
            const sp = Math.sin(s.phi);
            const off = new THREE.Vector3(
                s.radius * sp * Math.sin(s.theta),
                s.radius * Math.cos(s.phi),
                s.radius * sp * Math.cos(s.theta)
            );
            camera.position.copy(st.position).add(off);
            camera.lookAt(st.position);
        }

        function dolly(factor) {
            if (mode === 'follow') {
                if (followSph) followSph.radius = clamp(followSph.radius * factor, FOLLOW_R_MIN, FOLLOW_R_MAX);
                return;
            }
            const target = controls.target;
            const dir = new THREE.Vector3().copy(camera.position).sub(target);
            const d = clamp(dir.length() * factor, MIN_DIST, MAX_DIST);
            if (d <= 0) return;
            dir.normalize().multiplyScalar(d);
            camera.position.copy(target).add(dir);
            camera.lookAt(target);
            if (mode === 'orbit') controls.update();
        }

        function zoom(factor) { dolly(factor); }

        // Normalized zoom level for the slider: 0 = zoomed out (far), 1 = in.
        function normToDist(n) { return MIN_DIST * Math.pow(MAX_DIST / MIN_DIST, 1 - n); }
        function setZoomNorm(n) {
            n = clamp(n, 0, 1);
            if (mode === 'follow') {
                if (followSph) followSph.radius = FOLLOW_R_MIN * Math.pow(FOLLOW_R_MAX / FOLLOW_R_MIN, 1 - n);
                return;
            }
            const target = controls.target;
            const dir = new THREE.Vector3().copy(camera.position).sub(target);
            if (dir.lengthSq() < 1e-9) return;
            const nd = normToDist(n);
            dir.normalize().multiplyScalar(nd);
            camera.position.copy(target).add(dir);
            camera.lookAt(target);
            if (mode === 'orbit') controls.update();
        }

        // Wheel zoom on the renderer canvas (all modes). Scroll up = zoom in.
        const dom = controls.domElement;
        function onWheel(e) {
            e.preventDefault();
            dolly(e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
        }
        dom.addEventListener('wheel', onWheel, { passive: false });

        // Drag to orbit around the followed object (Follow mode only).
        controls.enableZoom = false;
        let dragging = false, lastX = 0, lastY = 0;
        dom.addEventListener('mousedown', function (e) {
            if (mode !== 'follow') return;
            dragging = true;
            lastX = e.clientX; lastY = e.clientY;
            e.preventDefault();
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging || mode !== 'follow' || !followSph) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            followSph.theta -= dx * 0.006;
            followSph.phi = clamp(followSph.phi - dy * 0.006, 0.02, Math.PI - 0.02);
        });
        window.addEventListener('mouseup', function () { dragging = false; });

        function setMode(m) {
            mode = m;
            controls.enabled = (m === 'orbit');
            setActiveButtons(m);
            if (m === 'inertial') frameScene();
            if (m === 'follow') seedFollow();
            if (m === 'orbit') controls.update();
        }

        function getMode() { return mode; }

        function update(t) {
            if (mode === 'orbit') { controls.update(); return; }
            const st = engine.getStateAtTime(t);
            if (mode === 'follow' && st) applyFollow(st);
            // inertial: static framing set in setMode(); dolly/zoom moves directly.
        }

        return { setMode, getMode, update, zoom, setZoomNorm, ZOOM_BUTTON_STEP };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createCameraController = createCameraController;
})(window);
