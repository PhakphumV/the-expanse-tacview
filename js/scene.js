// js/scene.js
// ECI scene, camera, renderer, orbit controls, and the celestial bodies
// (Earth, Moon, and the Moon's mean orbital path ring). Pure setup; no
// gameplay logic. No background starfield (removed as distracting).
//
// Note: createScene() does NOT call controls.update() — the camera
// controller owns that.
//
// Classic-script module: attaches Tacview.createScene, Tacview.EARTH_RADIUS.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const EARTH_RADIUS = 6371000;   // m
    const MOON_RADIUS = 1737400;    // m
    const MOON_DIST = 384400000;    // m — mean Moon orbital radius
    const MOON_INCL = 0.40;         // rad — representative inclination (~23 deg)

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

        // Earth: wireframe sphere so orbits read as orbits.
        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(EARTH_RADIUS, 48, 24),
            new THREE.MeshBasicMaterial({ color: 0x1c2f54, wireframe: true, transparent: true, opacity: 0.4 })
        );
        scene.add(earth);
        earth.userData.targetId = 'earth';

        // Moon: a wireframe sphere on its (tilted) mean orbital path ring.
        const moonGroup = new THREE.Group();
        const moon = new THREE.Mesh(
            new THREE.SphereGeometry(MOON_RADIUS, 32, 16),
            new THREE.MeshBasicMaterial({ color: 0x9aa0a8, wireframe: true, transparent: true, opacity: 0.5 })
        );
        const phase = 0.35;
        moon.position.set(Math.cos(phase) * MOON_DIST, 0, Math.sin(phase) * MOON_DIST);
        moonGroup.add(moon);
        moon.userData.targetId = 'moon';

        const ringSeg = 256;
        const ringPos = new Float32Array((ringSeg + 1) * 3);
        for (let i = 0; i <= ringSeg; i++) {
            const a = (i / ringSeg) * Math.PI * 2;
            ringPos[i * 3]     = Math.cos(a) * MOON_DIST;
            ringPos[i * 3 + 1] = 0;
            ringPos[i * 3 + 2] = Math.sin(a) * MOON_DIST;
        }
        const ringGeo = new THREE.BufferGeometry();
        ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
        const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
            color: 0x556, transparent: true, opacity: 0.18,
        }));
        ring.frustumCulled = false;
        moonGroup.add(ring);
        moonGroup.rotation.x = MOON_INCL;
        scene.add(moonGroup);

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', onResize);

        function render() {
            renderer.render(scene, camera);
        }

        // World position of the Moon center (group rotated, mesh offset inside).
        function getBodyWorldPosition(id, out) {
            if (id === 'earth') { out.set(0, 0, 0); return out; }
            if (id === 'moon') { return moon.getWorldPosition(out || new THREE.Vector3()); }
            return null;
        }

        const bodies = { earth, moon: moonGroup };

        return { scene, camera, renderer, controls, bodies, getBodyWorldPosition, render, onResize };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createScene = createScene;
    global.Tacview.EARTH_RADIUS = EARTH_RADIUS;
})(window);
