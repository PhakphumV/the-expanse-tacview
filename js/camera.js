// js/camera.js
// Camera mode controller. Two modes only:
//   center — frames both ships dynamically; falls back to one ship when the
//            other is inactive.
//   chase  — follows one ship at close range; cycles between active ships
//            via cycleChaseTarget() (the `C` key in main.js).
//
// Both modes compute their own transform each frame; the previous OrbitControls-
// driven Free Orbit and Tactical Top-Down modes from the pre-Phase-6 camera
// system are removed (Phase 6 roadmap, PR 2). The camera position and lookAt
// target are smoothed with a lerp toward the desired frame so engagement
// transitions and chase-target cycling produce a glide rather than a jump.

const THREE = window.THREE;

// Chase-cam offset, in the chase target's body frame (forward = -Z, up = +Y).
// Higher Y + further +Z than a true cockpit view so the chase target stays
// visible as the camera looks toward the ship.
const CHASE_OFFSET = new THREE.Vector3(0, 12, 40);

// Center-cam framing. The camera height grows with the inter-ship range so
// the ships stay legible as the engagement opens up; the floor prevents the
// camera from collapsing into a ship at zero separation.
const CENTER_BASE_HEIGHT = 80;     // height above midpoint at 1 km separation
const CENTER_RANGE_SCALE = 0.05;   // additional height per meter of separation
const CENTER_MIN_HEIGHT = 60;
const CENTER_BACK_OFFSET = 1;      // small +Z offset so the camera looks toward -Z

// Per-frame lerp factor for the smoothed camera transform. 0 = no smoothing
// (snap), 1 = no movement. 0.12 produces a noticeable glide over ~0.2 s.
const CAMERA_LERP_FACTOR = 0.12;

export function createCameraController(camera, playbackEngine) {
    // Mode state. Default is 'center' per the Phase 6 roadmap.
    let mode = 'center';
    // Chase target id. null = unselected (resolves to defaultChaseTarget
    // when the chase mode is entered or cycleChaseTarget() is called).
    let chaseTarget = null;

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

    // Compute the desired Center of Engagement camera frame. Midpoint of
    // both ships when both are active; one ship alone otherwise.
    function computeCenterFrame(stateMap) {
        const roci = stateMap['roci'];
        const zmeya = stateMap['zmeya'];
        let mid = null, range = 0;
        if (roci && roci.active && zmeya && zmeya.active) {
            mid = new THREE.Vector3().addVectors(roci.position, zmeya.position).multiplyScalar(0.5);
            range = roci.position.distanceTo(zmeya.position);
        } else if (roci && roci.active) {
            mid = roci.position.clone();
        } else if (zmeya && zmeya.active) {
            mid = zmeya.position.clone();
        } else {
            return null;
        }
        const height = Math.max(CENTER_MIN_HEIGHT, CENTER_BASE_HEIGHT + range * CENTER_RANGE_SCALE);
        const camPos = new THREE.Vector3(mid.x, mid.y + height, mid.z + CENTER_BACK_OFFSET);
        return { camPos, lookAt: mid };
    }

    function computeChaseFrame(stateMap) {
        const id = getChaseTarget();
        if (!id) return null;
        const target = stateMap[id];
        if (!target || !target.active) return null;
        const offsetWorld = CHASE_OFFSET.clone().applyQuaternion(target.orientation);
        const camPos = new THREE.Vector3().copy(target.position).add(offsetWorld);
        return { camPos, lookAt: target.position.clone() };
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

    return {
        setMode,
        getMode,
        getChaseTarget,
        setChaseTarget,
        cycleChaseTarget,
        onEngagementChanged,
        update,
    };
}
