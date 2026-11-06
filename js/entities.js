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

        // Interpolated position at time tt, writing into out(x,y,z). Keeps a
        // forward cursor so the monotonic resample scan is O(n) total.
        function positionAt(kfs, tt, cursor) {
            let i = cursor.i;
            if (i < 0 || i >= kfs.length - 1 || kfs[i + 1].t <= tt) i = 0;
            while (i < kfs.length - 2 && kfs[i + 1].t <= tt) i++;
            const a = kfs[i], b = kfs[i + 1];
            const span = b.t - a.t;
            const alpha = span > 0 ? (tt - a.t) / span : 0;
            cursor.i = i;
            return {
                x: a.position.x + (b.position.x - a.position.x) * alpha,
                y: a.position.y + (b.position.y - a.position.y) * alpha,
                z: a.position.z + (b.position.z - a.position.z) * alpha,
            };
        }

        // The trail is the object's actual recent path: the last TRAIL_SECONDS
        // of the ephemeris, resampled to TRAIL_SAMPLES points. Derived straight
        // from the dataset so it is correct at any time (start, scrub, pause),
        // not from a runtime-accumulated history buffer.
        function updateTrails(t) {
            const kfs = engine.getSamples();
            if (!trailVisible || !kfs || kfs.length < 2) { trail.visible = false; return; }
            const firstT = kfs[0].t, lastT = kfs[kfs.length - 1].t;
            const t1 = Math.max(firstT, t - TRAIL_SECONDS);
            const tEnd = Math.min(lastT, t);
            const span = Math.max(tEnd - t1, 1e-9);
            const positions = trail.geometry.attributes.position.array;
            const cursor = { i: 0 };
            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const tt = t1 + span * u;
                const p = positionAt(kfs, tt, cursor);
                positions[i * 3]     = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;
            }
            trail.visible = true;
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
