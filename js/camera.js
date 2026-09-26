// js/camera.js
// Camera mode controller: Free Orbit (default, OrbitControls-driven),
// Chase Cam (locked to Rocinante), Tactical Top-Down (auto-framing both ships).

const THREE = window.THREE;

const CHASE_OFFSET = new THREE.Vector3(0, 12, 40);

export function createCameraController(camera, controls, playbackEngine) {
    let mode = 'orbit';

    function setMode(m) {
        mode = m;
        controls.enabled = (m === 'orbit');
        const o = document.getElementById('modeOrbitBtn');
        const c = document.getElementById('modeChaseBtn');
        const tp = document.getElementById('modeTopBtn');
        if (o) o.classList.toggle('active', m === 'orbit');
        if (c) c.classList.toggle('active', m === 'chase');
        if (tp) tp.classList.toggle('active', m === 'top');
    }

    function getMode() { return mode; }

    function update(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        const roci = stateMap['roci'];
        const zmeya = stateMap['zmeya'];
        if (mode === 'chase' && roci && roci.active) {
            const offsetWorld = CHASE_OFFSET.clone().applyQuaternion(roci.orientation);
            camera.position.copy(roci.position).add(offsetWorld);
            camera.up.set(0, 1, 0);
            camera.lookAt(roci.position);
        } else if (mode === 'top' && roci && roci.active && zmeya && zmeya.active) {
            const mid = new THREE.Vector3().addVectors(roci.position, zmeya.position).multiplyScalar(0.5);
            camera.position.set(mid.x, mid.y + 150, mid.z + 1);
            camera.up.set(0, 0, -1);
            camera.lookAt(mid);
        }
    }

    return { setMode, getMode, update };
}
