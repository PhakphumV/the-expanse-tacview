// js/scene.js
// ECI scene, camera, renderer, orbit controls, starfield, and a minimal
// Earth reference sphere. Pure setup; no gameplay logic.
//
// Scale: positions are in meters with the Earth center at the origin
// (ECI/TEME frame). The camera far plane spans well beyond the orbital path.
//
// Note: createScene() does NOT call controls.update() — the camera
// controller owns that (the vendored OrbitControls.update() forces
// camera.lookAt(target), which would fight Follow/Inertial modes).
//
// Classic-script module: attaches Tacview.createScene, Tacview.EARTH_RADIUS.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const EARTH_RADIUS = 6371000;   // m
    const STARFIELD_RADIUS = 5e8;   // m
    const STAR_COUNT = 6000;

    function createScene(container) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000010);

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

        // Salt-and-pepper starfield on a large shell.
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            const r = STARFIELD_RADIUS;
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            starPos[i * 3 + 2] = r * Math.cos(phi);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff, size: 1.5, sizeAttenuation: false,
        }));
        scene.add(stars);

        // Minimal Earth reference: wireframe sphere so the orbit reads as an orbit.
        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(EARTH_RADIUS, 48, 24),
            new THREE.MeshBasicMaterial({ color: 0x1c2f54, wireframe: true, transparent: true, opacity: 0.4 })
        );
        scene.add(earth);

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', onResize);

        function tickStars() {
            stars.rotation.y += 0.0001;
        }

        function render() {
            renderer.render(scene, camera);
        }

        return { scene, camera, renderer, controls, stars, tickStars, render, onResize };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createScene = createScene;
    global.Tacview.EARTH_RADIUS = EARTH_RADIUS;
})(window);
