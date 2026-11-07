// js/scene.js
// ECI scene, camera, renderer, orbit controls, and Earth plus the Moon's mean
// orbital path ring. The Moon body itself is a celestial track in the scenario
// telemetry and is rendered by entities.js. Pure setup; no gameplay logic.
// No background starfield (removed as distracting).
//
// Note: createScene() does NOT call controls.update() — the camera
// controller owns that.
//
// Classic-script module: attaches Tacview.createScene, Tacview.EARTH_RADIUS.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const EARTH_RADIUS = 6371000;   // m

    function createScene(container) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            1,
            1e9
        );

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        // Earth: wireframe sphere so orbits read as orbits.
        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(EARTH_RADIUS, 48, 24),
            new THREE.MeshBasicMaterial({ color: 0x1c2f54, wireframe: true, transparent: true, opacity: 0.4 })
        );
        scene.add(earth);
        earth.userData.targetId = 'earth';

        // Moon's mean orbital path ring is built per scenario from the celestial
        // track's own data (see js/orbit-ring.js and main.js buildScenario).

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', onResize);

        function render() {
            renderer.render(scene, camera);
        }

        // World position of a static body. Only Earth is static now — the Moon
        // is a celestial track whose position comes from the ephemeris engine.
        function getBodyWorldPosition(id, out) {
            if (id === 'earth') { (out || new THREE.Vector3()).set(0, 0, 0); return out; }
            return null;
        }

        const bodies = { earth };

        return { scene, camera, renderer, controls, bodies, getBodyWorldPosition, render, onResize };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createScene = createScene;
    global.Tacview.EARTH_RADIUS = EARTH_RADIUS;
})(window);
