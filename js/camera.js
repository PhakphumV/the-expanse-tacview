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
    const WHEEL_STEP = 1.12;    // view-distance factor per wheel notch
    const ZOOM_STEP = 1.3;      // view-distance factor per +/- key press
    // The zoom slider is a bipolar, continuous control: centre = no zoom, either
    // side = continuous zoom whose speed grows with deflection. Expressed as a
    // factor per second, so the feel is scale-independent from 50 m to 9e8 m.
    const ZOOM_VEL_MAX = 2.2;
    const FOLLOW_R_MIN = 60;
    const FOLLOW_R_MAX = 2e5;
    const CHASE_BACK = 3500;    // m — seed offset behind a moving object
    const CHASE_UP   = 1400;    // m — seed offset above a moving object

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createCameraController(camera, controls, engine, bodies, getBodyWorldPosition) {
        let mode = 'orbit';
        let targetId = 'earth';
        let followSph = null;   // { theta, phi, radius } around the target
        let zoomVel = 0;        // -1 (zoom out) .. +1 (zoom in), 0 = off
        const targetPos = new THREE.Vector3();
        // Pan: the aim point is the target plus an offset, so you can orbit *and*
        // pan around the selected object instead of being locked to its centre.
        // Orbit mode keeps it on controls.target (which the user drags), follow mode
        // keeps a world-space offset applied to both the eye and the aim.
        const orbitPan = new THREE.Vector3();
        const followPan = new THREE.Vector3();
        const PAN_KEY_STEP = 0.06;   // fraction of the view distance per key press

        // Slider -1..1 -> continuous zoom velocity. Centre is exactly zero, so
        // the slider can sit untouched without the view creeping.
        function setZoomVelocity(n) {
            const v = clamp(n, -1, 1);
            zoomVel = Math.abs(v) < 0.02 ? 0 : v;   // small dead zone at centre
        }
        function getZoomVelocity() { return zoomVel; }
        // Apply the current velocity for dt seconds (called every frame).
        function applyZoomVelocity(dt) {
            if (!zoomVel || !(dt > 0)) return;
            const step = Math.min(dt, 0.1);          // ignore huge frame gaps
            const rate = Math.pow(ZOOM_VEL_MAX, Math.abs(zoomVel) * step);
            dolly(zoomVel > 0 ? 1 / rate : rate);
        }

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
            // Pan moves the whole rig, so the object slides across the frame while the
            // orbit keeps pivoting on the (offset) aim point.
            const aim = tp.clone().add(followPan);
            camera.position.copy(aim).add(off);
            camera.lookAt(aim);
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

        // Screen-space pan. dx > 0 moves the view left (the object slides right),
        // dy > 0 moves it up, in pixels, scaled by the current view distance so the
        // feel is the same from a 50 m close-up to the lunar orbit.
        function panBy(dxPx, dyPx) {
            const aim = new THREE.Vector3().copy(controls.target);
            const dist = camera.position.distanceTo(aim);
            if (!(dist > 0)) return;
            const k = dist * PAN_KEY_STEP / 100;
            const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
            const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
            const d = right.multiplyScalar(-dxPx * k).add(up.multiplyScalar(dyPx * k));
            if (mode === 'follow') {
                followPan.add(d);
                applyFollow(resolveTarget(engine.getTime(), new THREE.Vector3()) || aim);
            } else {
                orbitPan.add(d);
                camera.position.add(d);
                controls.target.add(d);
                controls.update();
            }
        }
        function panKey(which) {
            if (which === 'left') panBy(1, 0);
            else if (which === 'right') panBy(-1, 0);
            else if (which === 'up') panBy(0, 1);
            else if (which === 'down') panBy(0, -1);
        }
        function resetPan() {
            orbitPan.set(0, 0, 0);
            followPan.set(0, 0, 0);
        }
        function getPan() { return { orbit: orbitPan.clone(), follow: followPan.clone() }; }
        // Screen-space panning keeps the drag aligned with the screen, not the world.
        controls.screenSpacePanning = true;

        // Wheel zoom (both modes). Scroll up = zoom in.
        const dom = controls.domElement;
        dom.addEventListener('wheel', function (e) {
            e.preventDefault();
            dolly(e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
        }, { passive: false });
        controls.enableZoom = false;

        // Drag to orbit around the target in Follow mode; Shift-drag (or the right
        // button) pans instead, so Follow can pan as well as Orbit.
        let dragging = false, panning = false, lastX = 0, lastY = 0;
        dom.addEventListener('mousedown', function (e) {
            if (mode !== 'follow') return;
            dragging = true;
            panning = e.shiftKey || e.button === 2;
            lastX = e.clientX; lastY = e.clientY;
            e.preventDefault();
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging || mode !== 'follow') return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            if (panning) { panBy(dx / 25, dy / 25); return; }
            if (!followSph) return;
            followSph.theta -= dx * 0.006;
            followSph.phi = clamp(followSph.phi - dy * 0.006, 0.02, Math.PI - 0.02);
        });
        window.addEventListener('mouseup', function () { dragging = false; panning = false; });
        dom.addEventListener('contextmenu', function (e) { if (mode === 'follow') e.preventDefault(); });

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

        // Flip: roll the view 180 degrees about the view axis by inverting the
        // camera's up vector. OrbitControls re-derives its frame from camera.up on
        // every update, so orbiting still works — it just feels inverted, which is
        // what an upside-down map implies.
        let flipped = false;
        function setFlipped(on) {
            flipped = !!on;
            camera.up.set(0, flipped ? -1 : 1, 0);
            camera.lookAt(controls.target);
            controls.update();
        }
        function isFlipped() { return flipped; }
        function toggleFlip() { setFlipped(!flipped); return flipped; }

        function setTarget(id, distOverride) {
            targetId = id;
            resetPan();
            const tp = resolveTarget(engine.getTime(), targetPos);
            if (!tp) return;
            if (mode === 'follow') {
                seedFollow();
                applyFollow(tp);
            } else {
                // Frame the target at a sensible distance (callers may override,
                // e.g. a scenario that needs a cislunar-wide shot).
                let d = (typeof distOverride === 'number' && distOverride > 0)
                    ? distOverride
                    : viewDist(id);
                // A spacecraft hugging a body needs the body in frame: back off to
                // about three lunar radii when the target is within a few thousand km.
                const moonState = engine.getStateAtTimeFor('moon', engine.getTime());
                if (moonState && !isStaticTarget() && tp.distanceTo(moonState.position) < 3e6) {
                    d = Math.max(d, 1.1e7);
                }
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
                // Follow the moving track, but keep whatever pan the user has applied:
                // the aim is target + offset, and OrbitControls' own pan edits the aim.
                controls.target.copy(tp).add(orbitPan);
                controls.update();
                orbitPan.copy(controls.target).sub(tp);
            } else {
                applyFollow(tp);
            }
        }

        return {
            setMode, getMode, setTarget, getTarget, update,
            zoom, ZOOM_STEP,
            setZoomVelocity, getZoomVelocity, applyZoomVelocity,
            setFlipped, isFlipped, toggleFlip,
            panBy, panKey, resetPan, getPan,
        };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createCameraController = createCameraController;
})(window);
