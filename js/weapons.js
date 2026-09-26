// js/weapons.js
// Torpedo and PDC round rendering. Torpedoes are small sphere meshes with
// spawn/despawn fade; explicit pdc_round entities render as short-lived
// line-segment tracers. Additionally, compact `pdc_engagement` events
// (firing mount, target, start/end window) are expanded into short
// deterministic tracer streams — the telemetry stays small and no
// thousands of individual rounds are encoded in the dataset.

const THREE = window.THREE;

const TRACERS_PER_ENGAGEMENT = 5;

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
    const pdcEngagements = [];

    function loadWeapons() {
        reset();
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
        loadPdcEngagements();
    }

    // Expand pdc_engagement events into tracer streams. Each event
    // { t, end, actor, weapon, target } spawns TRACERS_PER_ENGAGEMENT
    // line meshes that pulse muzzle -> target during [t, end].
    function loadPdcEngagements() {
        const events = playbackEngine.getEvents();
        for (const ev of events) {
            if (ev.type !== 'pdc_engagement') continue;
            if (typeof ev.end !== 'number' || !ev.actor || !ev.target) continue;
            const tracers = [];
            for (let i = 0; i < TRACERS_PER_ENGAGEMENT; i++) {
                const m = createPdcMesh();
                scene.add(m);
                tracers.push({ mesh: m, mat: m.material, phase: i / TRACERS_PER_ENGAGEMENT });
            }
            pdcEngagements.push({
                start: ev.t, end: ev.end,
                actor: ev.actor, target: ev.target, tracers,
            });
        }
    }

    // Remove and dispose all weapon meshes so a new engagement starts
    // with no stale torpedoes or tracers from the previous one.
    function reset() {
        for (const id in torpedoMeshes) {
            scene.remove(torpedoMeshes[id]);
            torpedoMeshes[id].geometry.dispose();
            torpedoMeshes[id].material.dispose();
            delete torpedoMeshes[id];
        }
        for (const id in pdcMeshes) {
            const mesh = pdcMeshes[id].mesh;
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            delete pdcMeshes[id];
        }
        for (const eng of pdcEngagements) {
            for (const tr of eng.tracers) {
                scene.remove(tr.mesh);
                tr.mesh.geometry.dispose();
                tr.mesh.material.dispose();
            }
        }
        pdcEngagements.length = 0;
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

    // Tracer streams are a pure function of (t, event window, entity
    // states) — deterministic under scrubbing, no accumulated state.
    function updatePdcEngagements(t, stateMap) {
        for (const eng of pdcEngagements) {
            const a = stateMap[eng.actor];
            const tgt = stateMap[eng.target];
            const visible = t >= eng.start && t <= eng.end &&
                            a && a.active && tgt && tgt.active;
            const span = eng.end - eng.start;
            for (const tr of eng.tracers) {
                if (!visible) { tr.mesh.visible = false; continue; }
                // Deterministic pulse phase scrolling muzzle -> target.
                const frac = span > 0
                    ? (((t - eng.start) / span) * 3 + tr.phase) % 1
                    : 1;
                const ox = Math.sin(tr.phase * 17.3) * 1.5;
                const oy = Math.cos(tr.phase * 11.7) * 1.5;
                const oz = Math.sin(tr.phase * 7.9) * 1.5;
                const mx = a.position.x + ox;
                const my = a.position.y + oy;
                const mz = a.position.z + oz;
                const positions = tr.mesh.geometry.attributes.position.array;
                positions[0] = mx; positions[1] = my; positions[2] = mz;
                positions[3] = mx + (tgt.position.x - mx) * frac;
                positions[4] = my + (tgt.position.y - my) * frac;
                positions[5] = mz + (tgt.position.z - mz) * frac;
                tr.mesh.geometry.attributes.position.needsUpdate = true;
                tr.mesh.visible = true;
                tr.mat.opacity = 0.35 + 0.65 * frac;
            }
        }
    }

    function update(t, stateMap) {
        const ents = playbackEngine.getEntities();
        updateTorpedoes(t, stateMap, ents);
        updatePdc(t, stateMap, ents);
        updatePdcEngagements(t, stateMap);
    }

    return { loadWeapons, reset, update };
}
