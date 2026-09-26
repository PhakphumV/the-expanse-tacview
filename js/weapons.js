// js/weapons.js
// Torpedo and PDC round rendering. Torpedoes are small sphere meshes with
// spawn/despawn fade; PDC rounds are short-lived line-segment tracers.

const THREE = window.THREE;

function createTorpedoMesh() {
    const geom = new THREE.SphereGeometry(2.5, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 });
    return new THREE.Mesh(geom, mat);
}

function createPdcMesh() {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffff66, transparent: true, opacity: 1 });
    return new THREE.Line(geom, mat);
}

export function createWeaponsManager(scene, playbackEngine, entitiesManager) {
    const torpedoMeshes = {};
    const pdcMeshes = {};

    function loadWeapons() {
        const ents = playbackEngine.getEntities();
        for (const id in ents) {
            const e = ents[id];
            if (e.type === 'torpedo') {
                const m = createTorpedoMesh();
                scene.add(m);
                torpedoMeshes[id] = m;
            } else if (e.type === 'pdc_round') {
                const m = createPdcMesh();
                scene.add(m);
                pdcMeshes[id] = { mesh: m, mat: m.material };
            }
        }
    }

    function updateTorpedoes(t, stateMap, ents) {
        for (const id in torpedoMeshes) {
            const mesh = torpedoMeshes[id];
            const s = stateMap[id];
            const e = ents[id];
            if (s && s.active && e && e.keyframes.length) {
                mesh.visible = true;
                mesh.position.copy(s.position);
                const kfs = e.keyframes;
                const fade = 0.5;
                let op = 1;
                if (t < kfs[0].t + fade) op = Math.max(0, (t - kfs[0].t) / fade);
                else if (t > kfs[kfs.length - 1].t - fade) op = Math.max(0, (kfs[kfs.length - 1].t - t) / fade);
                mesh.material.opacity = op;
                if (entitiesManager && entitiesManager.pushHistory) {
                    entitiesManager.pushHistory(id, t, s.position);
                }
            } else {
                mesh.visible = false;
            }
        }
    }

    function updatePdc(t, stateMap, ents) {
        for (const id in pdcMeshes) {
            const entry = pdcMeshes[id];
            const s = stateMap[id];
            const e = ents[id];
            if (s && s.active && e && e.keyframes.length >= 2) {
                entry.mesh.visible = true;
                const a = e.keyframes[0];
                const b = e.keyframes[1];
                const span = b.t - a.t;
                const alpha = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
                const pos = new THREE.Vector3().copy(a.pos).lerp(b.pos, alpha);
                const positions = entry.mesh.geometry.attributes.position.array;
                positions[0] = a.pos.x; positions[1] = a.pos.y; positions[2] = a.pos.z;
                positions[3] = pos.x;    positions[4] = pos.y;    positions[5] = pos.z;
                entry.mesh.geometry.attributes.position.needsUpdate = true;
                let op = 1;
                if (t < a.t + 0.05) op = (t - a.t) / 0.05;
                else if (t > b.t - 0.1) op = Math.max(0, (b.t - t) / 0.1);
                entry.mat.opacity = op;
            } else {
                entry.mesh.visible = false;
            }
        }
    }

    function update(t, stateMap) {
        const ents = playbackEngine.getEntities();
        updateTorpedoes(t, stateMap, ents);
        updatePdc(t, stateMap, ents);
    }

    return { loadWeapons, update };
}
