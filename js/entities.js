// js/entities.js
// Ship hull meshes, fading trails, and billboarded 2D entity labels.
// Weapons (torpedoes, PDC tracers) live in js/weapons.js.
// Hull geometry comes from js/ship-models.js (procedural silhouettes).

import { createRociModel, createZmeyaModel } from './ship-models.js';

const THREE = window.THREE;

const TRAIL_SECONDS = 2.0;
const TRAIL_SAMPLES = 30;

function createTrail(color) {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_SAMPLES * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    return line;
}

export function createEntitiesManager(scene, playbackEngine) {
    const hullMeshes = {};
    const trails = {};
    const trailHistory = {};
    let trailsVisible = true;

    // Ship meshes created up-front; trails are created per entity in load().
    function createShips() {
        const rociMesh = createRociModel();
        scene.add(rociMesh);
        hullMeshes['roci'] = rociMesh;

        const zmeyaMesh = createZmeyaModel();
        scene.add(zmeyaMesh);
        hullMeshes['zmeya'] = zmeyaMesh;
    }

    function loadEntities() {
        const ents = playbackEngine.getEntities();
        for (const id in ents) {
            const e = ents[id];
            if (e.type === 'ship') {
                trails[id] = createTrail(id === 'roci' ? 0x3a7bd5 : 0xd53a3a);
                scene.add(trails[id]);
            }
        }
    }

    function pushHistory(id, t, pos) {
        if (!trailHistory[id]) trailHistory[id] = [];
        const arr = trailHistory[id];
        arr.push({ t, pos: pos.clone() });
        while (arr.length > 0 && t - arr[0].t > TRAIL_SECONDS) arr.shift();
    }

    function updateShips(t, stateMap) {
        for (const id in hullMeshes) {
            const mesh = hullMeshes[id];
            const s = stateMap[id];
            if (s && s.active) {
                mesh.visible = true;
                mesh.position.copy(s.position);
                mesh.quaternion.copy(s.orientation);
                pushHistory(id, t, s.position);
            } else {
                mesh.visible = false;
            }
        }
    }

    function updateTrails(t) {
        for (const id in trails) {
            const line = trails[id];
            if (!trailsVisible) { line.visible = false; continue; }
            const arr = trailHistory[id];
            if (!arr || arr.length < 2) { line.visible = false; continue; }
            line.visible = true;
            const positions = line.geometry.attributes.position.array;
            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const targetT = t - TRAIL_SECONDS * (1 - u);
                let p = arr[arr.length - 1].pos;
                for (let j = 1; j < arr.length; j++) {
                    if (arr[j].t >= targetT) {
                        const a2 = arr[j - 1], b2 = arr[j];
                        const dt = b2.t - a2.t;
                        const alpha = dt > 0 ? (targetT - a2.t) / dt : 0;
                        p = new THREE.Vector3().copy(a2.pos).lerp(b2.pos, alpha);
                        break;
                    }
                }
                positions[i * 3]     = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;
            }
            line.geometry.attributes.position.needsUpdate = true;
        }
    }

    function setTrailsVisible(v) { trailsVisible = !!v; }
    function getTrailsVisible() { return trailsVisible; }

    function update(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        updateShips(t, stateMap);
        updateTrails(t);
        return stateMap;
    }

    function getHullMeshes() { return hullMeshes; }

    return {
        createShips,
        loadEntities,
        update,
        setTrailsVisible,
        getTrailsVisible,
        getHullMeshes,
        pushHistory,
    };
}

// ---- Labels (billboarded 2D HTML overlays) ----
export function createLabels(playbackEngine, camera) {
    const labels = {};
    const container = document.getElementById('labelsContainer');
    if (container) container.innerHTML = '';

    function createShipLabels() {
        ['roci', 'zmeya'].forEach(function (id) {
            const el = document.createElement('div');
            el.className = 'entity-label';
            el.textContent = id === 'roci' ? 'ROCI' : 'ZMEYA';
            el.style.color = id === 'roci' ? '#7fd0ff' : '#ff8080';
            if (container) container.appendChild(el);
            labels[id] = el;
        });
    }

    function update() {
        const t = playbackEngine.getTime();
        const stateMap = playbackEngine.getStateAtTime(t);
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;
        camera.updateMatrixWorld();
        for (const id in labels) {
            const s = stateMap[id];
            const el = labels[id];
            if (s && s.active) {
                const pos = s.position.clone().project(camera);
                if (pos.z > 1) { el.style.display = 'none'; continue; }
                const x = (pos.x * widthHalf) + widthHalf;
                const y = -(pos.y * heightHalf) + heightHalf;
                el.style.left = x + 'px';
                el.style.top = y + 'px';
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
    }

    return { createShipLabels, update };
}
