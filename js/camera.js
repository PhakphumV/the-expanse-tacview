// js/camera.js
// Camera mode controller. Two modes only:
//   center — frames both ships dynamically; falls back to one ship when the
//            other is inactive.
//   chase  — follows one ship at close range; cycles between active ships
//            via cycleChaseTarget() (the `C` key in main.js).
//
// Both modes compute their own transform each frame. Camera position and
// lookAt target are smoothed with a lerp toward the desired frame so
// engagement transitions and chase-target cycling produce a glide.

import { clamp } from './utils/math.js';
import { createListenerScope } from './utils/listeners.js';
import { CONFIG } from './utils/config.js';

const THREE = window.THREE;
const CAMERA_CONFIG = CONFIG.camera;

// Center-cam framing. The camera height grows with the inter-ship range so
// the ships stay legible as the engagement opens up; the floor prevents the
// camera from collapsing into a ship at zero separation.
const CENTER_BASE_HEIGHT = CAMERA_CONFIG.centerBaseHeight;
const CENTER_RANGE_SCALE = CAMERA_CONFIG.centerRangeScale;
const CENTER_MIN_HEIGHT = CAMERA_CONFIG.centerMinHeight;
const CENTER_BACK_OFFSET = CAMERA_CONFIG.centerBackOffset;
const CHASE_OFFSET = CAMERA_CONFIG.chaseOffset;
const ORBIT_PITCH_LIMIT = CAMERA_CONFIG.orbitPitchLimit;
const MIN_ORBIT_DISTANCE_SCALE = CAMERA_CONFIG.minOrbitDistanceScale;
const MAX_ORBIT_DISTANCE_SCALE = CAMERA_CONFIG.maxOrbitDistanceScale;
const ORBIT_SENSITIVITY = CAMERA_CONFIG.rotationSensitivity;
const ZOOM_SENSITIVITY = CAMERA_CONFIG.zoomSensitivity;

// Per-frame lerp factor for the smoothed camera transform. 0 = no smoothing
// (snap), 1 = no movement. 0.12 produces a noticeable glide over ~0.2 s.
const CAMERA_LERP_FACTOR = CAMERA_CONFIG.damping;

export function createCameraController(camera, playbackEngine, canvas) {
    const listeners = createListenerScope();
    let cancelPointer = null;
    // Mode state. Default is 'center' per the Phase 6 roadmap.
    let mode = 'center';
    // Chase target id. null = unselected (resolves to defaultChaseTarget
    // when the chase mode is entered or cycleChaseTarget() is called).
    let chaseTarget = null;

    const orbitStates = {
        center: {
            yaw: 0,
            pitch: Math.atan2(CENTER_BASE_HEIGHT, CENTER_BACK_OFFSET),
            distanceScale: 1,
            pan: new THREE.Vector3(),
        },
        chase: {
            yaw: 0,
            pitch: Math.atan2(CHASE_OFFSET.y, CHASE_OFFSET.z),
            distanceScale: 1,
        },
    };

    // Smoothed camera position and look-at target. null until the first
    // frame after mode initialization, at which point they snap to the
    // first computed frame so the camera doesn't lerp in from (0,0,0).
    let smoothPos = null;
    let smoothLook = null;

    // Resolve the engagement's declared chase_target (string ship id), or
    // fall back to 'roci'. Returns null when neither roci nor zmeya exists
    // so callers can no-op gracefully.
    function defaultChaseTarget() {
        const entities = playbackEngine.getEntities();
        const dataset = playbackEngine.getDataset();
        const declared = dataset && dataset.chase_target;
        if (declared && entities[declared]) return declared;
        if (entities['roci']) return 'roci';
        // Last-resort: first ship entity in registration order.
        for (const id in entities) {
            if (entities[id] && entities[id].type === 'ship') return id;
        }
        return null;
    }

    function setMode(m) {
        if (m !== 'center' && m !== 'chase') return;
        mode = m;
        if (m === 'chase' && chaseTarget === null) {
            chaseTarget = defaultChaseTarget();
        }
        // Update button highlighting.
        const c = document.getElementById('modeCenterBtn');
        const ch = document.getElementById('modeChaseBtn');
        if (c) c.classList.toggle('active', m === 'center');
        if (ch) ch.classList.toggle('active', m === 'chase');
        // Reset smoothing on mode switch so the new view doesn't lerp in
        // from the old view's framing (one half-frame of stale camera).
        smoothPos = null;
        smoothLook = null;
    }

    function getMode() { return mode; }

    function getOrbitState() {
        const state = orbitStates[mode];
        return {
            yaw: state.yaw,
            pitch: state.pitch,
            distanceScale: state.distanceScale,
        };
    }

    function setOrbitState(next = {}) {
        const state = orbitStates[mode];
        if (Number.isFinite(next.yaw)) state.yaw = next.yaw;
        if (Number.isFinite(next.pitch)) {
            state.pitch = clamp(next.pitch, -ORBIT_PITCH_LIMIT, ORBIT_PITCH_LIMIT);
        }
        if (Number.isFinite(next.distanceScale) && next.distanceScale > 0) {
            state.distanceScale = clamp(next.distanceScale, MIN_ORBIT_DISTANCE_SCALE, MAX_ORBIT_DISTANCE_SCALE);
        }
    }

    function getChaseTarget() { return chaseTarget || defaultChaseTarget(); }

    function setChaseTarget(id) {
        const entities = playbackEngine.getEntities();
        if (entities[id] && entities[id].type === 'ship') {
            chaseTarget = id;
            // Don't reset smoothing — a user-initiated chase-target change
            // should glide rather than snap, matching the "smooth camera
            // transitions" AC.
        }
    }

    // Cycle to the next active ship in deterministic registration order.
    // With two ships this is effectively roci <-> zmeya. With more it walks
    // the active ship entities in the order they were registered.
    function cycleChaseTarget() {
        const entities = playbackEngine.getEntities();
        const ids = Object.keys(entities).filter((id) => {
            const e = entities[id];
            return e && e.type === 'ship';
        });
        if (ids.length === 0) return null;
        if (chaseTarget === null || ids.indexOf(chaseTarget) === -1) {
            chaseTarget = defaultChaseTarget();
            return chaseTarget;
        }
        const idx = ids.indexOf(chaseTarget);
        chaseTarget = ids[(idx + 1) % ids.length];
        return chaseTarget;
    }

    // Re-derive the chase target from the new engagement's chase_target
    // declaration (or the default) when the user switches engagement.
    function onEngagementChanged() {
        chaseTarget = null;
    }

    // Convert a target pose and orbit state into a camera frame. The target
    // can be any positioned/oriented object; entity lookup stays outside this
    // transform.
    function computeOrbitFrame(target, orbit) {
        const cosPitch = Math.cos(orbit.pitch);
        const offset = new THREE.Vector3(
            cosPitch * Math.sin(orbit.yaw),
            Math.sin(orbit.pitch),
            cosPitch * Math.cos(orbit.yaw)
        ).multiplyScalar(orbit.distance).applyQuaternion(target.orientation);
        return {
            camPos: target.position.clone().add(offset),
            lookAt: target.position.clone(),
        };
    }

    function computeCenterFrame(stateMap) {
        const entities = playbackEngine.getEntities();
        const activeShips = Object.keys(entities)
            .filter((id) => entities[id] && entities[id].type === 'ship')
            .map((id) => stateMap[id])
            .filter((state) => state && state.active);
        if (activeShips.length === 0) return null;

        const center = activeShips.reduce(
            (sum, state) => sum.add(state.position),
            new THREE.Vector3()
        ).multiplyScalar(1 / activeShips.length);
        const range = activeShips.reduce(
            (maxRange, state) => Math.max(maxRange, center.distanceTo(state.position) * 2),
            0
        );
        const height = Math.max(CENTER_MIN_HEIGHT, CENTER_BASE_HEIGHT + range * CENTER_RANGE_SCALE);
        const state = orbitStates.center;
        const orbit = {
            yaw: state.yaw,
            pitch: state.pitch,
            distance: Math.hypot(height, CENTER_BACK_OFFSET) * state.distanceScale,
        };
        return computeOrbitFrame({
            position: center.add(state.pan),
            orientation: new THREE.Quaternion(),
        }, orbit);
    }

    function computeChaseFrame(stateMap) {
        const id = getChaseTarget();
        if (!id) return null;
        const target = stateMap[id];
        if (!target || !target.active) return null;
        const state = orbitStates.chase;
        return computeOrbitFrame(target, {
            yaw: state.yaw,
            pitch: state.pitch,
            distance: Math.hypot(CHASE_OFFSET.y, CHASE_OFFSET.z) * state.distanceScale,
        });
    }

    function attachControls(element) {
        if (!element) return;
        let activePointer = null;
        let dragButton = -1;
        let lastX = 0;
        let lastY = 0;

        function cancelActivePointer() {
            if (activePointer !== null && typeof element.hasPointerCapture === 'function' &&
                element.hasPointerCapture(activePointer)) {
                element.releasePointerCapture(activePointer);
            }
            activePointer = null;
            dragButton = -1;
        }
        cancelPointer = cancelActivePointer;

        listeners.listen(element, 'pointerdown', (event) => {
            if (event.button !== 0 && event.button !== 1) return;
            if (event.button === 1 && mode !== 'center') return;
            activePointer = event.pointerId;
            dragButton = event.button;
            lastX = event.clientX;
            lastY = event.clientY;
            element.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        listeners.listen(element, 'pointermove', (event) => {
            if (event.pointerId !== activePointer) return;
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;

            const state = orbitStates[mode];
            if (dragButton === 0) {
                state.yaw -= dx * ORBIT_SENSITIVITY;
                state.pitch = clamp(
                    state.pitch + dy * ORBIT_SENSITIVITY,
                    -ORBIT_PITCH_LIMIT,
                    ORBIT_PITCH_LIMIT
                );
            } else if (dragButton === 1 && mode === 'center') {
                const distance = camera.position.distanceTo(smoothLook || camera.position);
                const panScale = distance * ORBIT_SENSITIVITY;
                state.pan.x -= Math.cos(state.yaw) * dx * panScale;
                state.pan.z += Math.sin(state.yaw) * dx * panScale;
                state.pan.y += dy * panScale;
            }
        });
        const finishPointer = (event) => {
            if (event.pointerId !== activePointer) return;
            activePointer = null;
            dragButton = -1;
        };
        listeners.listen(element, 'pointerup', finishPointer);
        listeners.listen(element, 'pointercancel', finishPointer);
        listeners.listen(element, 'wheel', (event) => {
            event.preventDefault();
            const state = orbitStates[mode];
            state.distanceScale *= Math.exp(event.deltaY * ZOOM_SENSITIVITY);
            state.distanceScale = clamp(state.distanceScale, MIN_ORBIT_DISTANCE_SCALE, MAX_ORBIT_DISTANCE_SCALE);
        }, { passive: false });
    }

    function reset() {
        orbitStates.center.yaw = 0;
        orbitStates.center.pitch = Math.atan2(CENTER_BASE_HEIGHT, CENTER_BACK_OFFSET);
        orbitStates.center.distanceScale = 1;
        orbitStates.center.pan.set(0, 0, 0);
        orbitStates.chase.yaw = 0;
        orbitStates.chase.pitch = Math.atan2(12, 40);
        orbitStates.chase.distanceScale = 1;
        chaseTarget = null;
        setMode('center');
    }

    function destroy() {
        listeners.destroy();
        if (cancelPointer) cancelPointer();
    }

    function update(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        let frame = null;
        if (mode === 'center') frame = computeCenterFrame(stateMap);
        else if (mode === 'chase') frame = computeChaseFrame(stateMap);
        if (!frame) return;

        // First frame: snap. Subsequent frames: lerp toward the desired
        // frame. The factor is applied per call (assumed once per
        // requestAnimationFrame tick), so this is a discrete-time first-
        // order lag; at 60 fps with 0.12 the camera reaches ~99% of the
        // target within ~0.4 s.
        if (smoothPos === null) {
            smoothPos = frame.camPos.clone();
            smoothLook = frame.lookAt.clone();
        } else {
            smoothPos.lerp(frame.camPos, CAMERA_LERP_FACTOR);
            smoothLook.lerp(frame.lookAt, CAMERA_LERP_FACTOR);
        }
        camera.position.copy(smoothPos);
        camera.up.set(0, 1, 0);
        camera.lookAt(smoothLook);
    }

    attachControls(canvas);

    return {
        setMode,
        getMode,
        getOrbitState,
        setOrbitState,
        getChaseTarget,
        setChaseTarget,
        cycleChaseTarget,
        onEngagementChanged,
        update,
        reset,
        destroy,
    };
}
