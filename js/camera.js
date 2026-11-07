// js/camera.js
// Camera controller pivoting on a selectable target (Earth, Moon, or a space
// track). Two modes:
//   orbit  – free OrbitControls around the target (target follows moving tracks)
//   follow – spherical chase offset behind a moving track (drag to orbit, zoom)
//
// Zoom works in both modes (wheel, +/-, slider). The controller owns
// controls.update() and only enables it in Orbit mode.
//
// Classic-script module: attaches Tacview.createCameraController.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const MIN_DIST = 50;        // m — close enough to see a spacecraft
    const MAX_DIST = 9e8;       // m — far enough to frame the Moon orbit
    const WHEEL_STEP = 1.12;    // zoom factor per wheel notch
    const ZOOM_BUTTON_STEP = 1.3;
    const FOLLOW_R_MIN = 60;
    const FOLLOW_R_MAX = 2e5;
    const CHASE_BACK = 3500;    // m — seed offset behind a moving object
    const CHASE_UP   = 1400;    // m — seed offset above a moving object

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createCameraController(camera, controls, engine, bodies, getBodyWorldPosition) {
        let mode = 'orbit';
        let targetId = 'earth';
        let followSph = null;   // { theta, phi, radius } around the target
        const targetPos = new THREE.Vector3();

        function isStaticTarget() { return targetId === 'earth'; }
        function isCelestialTarget() {
            const tr = engine.getTrack(targetId);
            return !!(tr && tr.meta && tr.meta.kind === 'celestial');
        }
        // Bodies (static Earth, or a celestial track like the Moon) are framed
        // from far away and followed at body scale, not spacecraft scale.
        function isBodyLike() { return isStaticTarget() || isCelestialTarget(); }

        // Resolve the target's world point at time t into targetPos.
        function resolveTarget(t, out) {
            if (isStaticTarget()) {
                return getBodyWorldPosition(targetId, out);   // static
            }
            const st = engine.getStateAtTimeFor(targetId, t);
            if (st) { out.copy(st.position); return out; }
            return null;
        }

        function setActiveButtons() {
            const ids = { orbit: 'modeOrbitBtn', follow: 'modeFollowBtn' };
            for (const key in ids) {
                const btn = document.getElementById(ids[key]);
                if (btn) btn.classList.toggle('active', key === mode);
            }
        }

        // Seed the follow offset behind/above a moving target's heading (or a
        // generic side offset for bodies).
        function seedFollow() {
            const t = engine.getTime();
            const tp = resolveTarget(t, new THREE.Vector3());
            if (!tp) { followSph = { theta: 0, phi: 1.2, radius: CHASE_BACK }; return; }
            if (isBodyLike()) {
                followSph = { theta: 0.6, phi: Math.PI / 3, radius: viewDist(targetId) };
                return;
            }
            const st = engine.getStateAtTimeFor(targetId, t);
            const fwd = st && st.velocity.lengthSq() > 1e-12 ? st.velocity.clone().normalize() : new THREE.Vector3(0, 0, -1);
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

        function applyFollow(tp) {
            const s = followSph;
            if (!s) return;
            const sp = Math.sin(s.phi);
            const off = new THREE.Vector3(
                s.radius * sp * Math.sin(s.theta),
                s.radius * Math.cos(s.phi),
                s.radius * sp * Math.cos(s.theta)
            );
            camera.position.copy(tp).add(off);
            camera.lookAt(tp);
        }

        function dolly(factor) {
            if (mode === 'follow' && followSph) {
                const r = followRange();
                followSph.radius = clamp(followSph.radius * factor, r.min, r.max);
                return;
            }
            const dir = new THREE.Vector3().copy(camera.position).sub(controls.target);
            const d = clamp(dir.length() * factor, MIN_DIST, MAX_DIST);
            if (d <= 0) return;
            dir.normalize().multiplyScalar(d);
            camera.position.copy(controls.target).add(dir);
            camera.lookAt(controls.target);
            if (mode === 'orbit') controls.update();
        }

        function zoom(factor) { dolly(factor); }

        function normToDist(n) { return MIN_DIST * Math.pow(MAX_DIST / MIN_DIST, 1 - n); }
        function setZoomNorm(n) {
            n = clamp(n, 0, 1);
            if (mode === 'follow' && followSph) {
                const r = followRange();
                followSph.radius = r.min * Math.pow(r.max / r.min, 1 - n);
                return;
            }
            const dir = new THREE.Vector3().copy(camera.position).sub(controls.target);
            if (dir.lengthSq() < 1e-9) return;
            const nd = normToDist(n);
            dir.normalize().multiplyScalar(nd);
            camera.position.copy(controls.target).add(dir);
            camera.lookAt(controls.target);
            if (mode === 'orbit') controls.update();
        }

        // Wheel zoom (both modes). Scroll up = zoom in.
        const dom = controls.domElement;
        dom.addEventListener('wheel', function (e) {
            e.preventDefault();
            dolly(e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
        }, { passive: false });
        controls.enableZoom = false;

        // Drag to orbit around the target in Follow mode.
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

        const VIEW_DIST = { earth: 3.5e7, moon: 6e7 };
        function viewDist(id) { return VIEW_DIST[id] || 2e6; }   // tracks default

        // Follow-radius clamp: body scale for planets/moons, spacecraft scale
        // otherwise.
        function followRange() {
            return isBodyLike()
                ? { min: 20, max: 1e9 }
                : { min: FOLLOW_R_MIN, max: FOLLOW_R_MAX };
        }

        function setMode(m) {
            if (m !== 'orbit' && m !== 'follow') return;
            mode = m;
            controls.enabled = (m === 'orbit');
            setActiveButtons();
            if (m === 'follow') seedFollow();
            else controls.update();
        }

        function getMode() { return mode; }

        function setTarget(id) {
            targetId = id;
            const tp = resolveTarget(engine.getTime(), targetPos);
            if (!tp) return;
            if (mode === 'follow') {
                seedFollow();
                applyFollow(tp);
            } else {
                // Frame the target at a sensible distance.
                const d = viewDist(id);
                controls.target.copy(tp);
                camera.position.set(tp.x + d * 0.8, tp.y + d * 0.6, tp.z + d);
                camera.lookAt(tp);
                controls.update();
            }
        }
        function getTarget() { return targetId; }

        function update(t) {
            const tp = resolveTarget(t, targetPos);
            if (!tp) return;
            if (mode === 'orbit') {
                controls.target.copy(tp);   // follow moving tracks while orbiting
                controls.update();
            } else {
                applyFollow(tp);
            }
        }

        return { setMode, getMode, setTarget, getTarget, update, zoom, setZoomNorm, ZOOM_BUTTON_STEP };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createCameraController = createCameraController;
})(window);
