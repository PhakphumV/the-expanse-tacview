// js/entities.js
// The tracked-object renderer: a spacecraft body + the full orbital path
// polyline + a short fading trail showing recent motion.
//
// Classic-script module: attaches Tacview.createTrackEntity.

(function (global) {
    'use strict';
    const THREE = global.THREE;
    const createSpacecraftModel = global.Tacview.createSpacecraftModel;

    const TRAIL_SECONDS = 300;
    const TRAIL_SAMPLES = 60;

    function createTrail(color) {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(TRAIL_SAMPLES * 3);
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
        const line = new THREE.Line(geom, mat);
        line.frustumCulled = false;
        return line;
    }

    function createTrackEntity(scene, engine) {
        const mesh = createSpacecraftModel();
        mesh.visible = false;
        scene.add(mesh);

        const pathLine = buildPathLine(engine);
        scene.add(pathLine);

        const trail = createTrail(0x8fd0ff);
        trail.visible = false;
        scene.add(trail);

        const trailHistory = [];
        let trailVisible = true;

        function buildPathLine(eng) {
            const kfs = eng.getSamples();
            const pos = new Float32Array(kfs.length * 3);
            kfs.forEach((s, i) => {
                pos[i * 3] = s.position.x;
                pos[i * 3 + 1] = s.position.y;
                pos[i * 3 + 2] = s.position.z;
            });
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
                color: 0x3a7bd5, transparent: true, opacity: 0.5,
            }));
            line.frustumCulled = false;
            return line;
        }

        function pushHistory(t, pos) {
            trailHistory.push({ t, pos: pos.clone() });
            while (trailHistory.length > 0 && t - trailHistory[0].t > TRAIL_SECONDS) {
                trailHistory.shift();
            }
        }

        function updateTrails(t) {
            if (!trailVisible || trailHistory.length < 2) { trail.visible = false; return; }
            trail.visible = true;
            const positions = trail.geometry.attributes.position.array;
            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const targetT = t - TRAIL_SECONDS * (1 - u);
                let p = trailHistory[trailHistory.length - 1].pos;
                for (let j = 1; j < trailHistory.length; j++) {
                    if (trailHistory[j].t >= targetT) {
                        const a = trailHistory[j - 1], b = trailHistory[j];
                        const dt = b.t - a.t;
                        const alpha = dt > 0 ? (targetT - a.t) / dt : 0;
                        p = new THREE.Vector3().copy(a.pos).lerp(b.pos, alpha);
                        break;
                    }
                }
                positions[i * 3]     = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;
            }
            trail.geometry.attributes.position.needsUpdate = true;
        }

        function setTrailsVisible(v) { trailVisible = !!v; }
        function getTrailsVisible() { return trailVisible; }

        function update(t) {
            const st = engine.getStateAtTime(t);
            if (st) {
                mesh.visible = true;
                mesh.position.copy(st.position);
                mesh.quaternion.copy(st.orientation);
                pushHistory(t, st.position);
                updateTrails(t);
            } else {
                mesh.visible = false;
            }
            return st;
        }

        return { update, setTrailsVisible, getTrailsVisible, getMesh: () => mesh };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTrackEntity = createTrackEntity;
})(window);
