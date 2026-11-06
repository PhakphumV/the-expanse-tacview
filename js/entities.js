// js/entities.js
// Tracked-object renderers: one spacecraft body + full orbital path polyline
// + a gradient, orientation-aware ribbon trail per track. Ribbon width scales
// with camera distance so it stays visible when zoomed out.
//
// Classic-script module: attaches Tacview.createTrackEntity.

(function (global) {
    'use strict';
    const THREE = global.THREE;
    const createSpacecraftModel = global.Tacview.createSpacecraftModel;

    const TRAIL_SECONDS = 300;
    const TRAIL_SAMPLES = 60;       // path samples along the ribbon
    const WIDTH_MIN = 40;           // m — floor ribbon width
    const WIDTH_MAX = 4e6;          // m — ceiling so it never blows up
    const WIDTH_DIST_SCALE = 0.02;  // ribbon width ≈ 2% of camera distance

    const HEAD_COLOR = new THREE.Color(0xaef2ff);
    const MID_COLOR = new THREE.Color(0x3a7bd5);
    const TAIL_COLOR = new THREE.Color(0x0a2a5a);

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function createTrailRibbon() {
        const verts = TRAIL_SAMPLES * 2;
        const positions = new Float32Array(verts * 3);
        const colors = new Float32Array(verts * 3);
        const indices = [];
        for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
            const a0 = i * 2, a1 = i * 2 + 1;
            const b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
            indices.push(a0, a1, b0, a1, b0, b1);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geom.setIndex(indices);
        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ribbon = new THREE.Mesh(geom, mat);
        ribbon.frustumCulled = false;
        return ribbon;
    }

    function writeColor(arr, i, u) {
        const col = new THREE.Color();
        if (u < 0.5) col.copy(HEAD_COLOR).lerp(MID_COLOR, u * 2);
        else col.copy(MID_COLOR).lerp(TAIL_COLOR, (u - 0.5) * 2);
        arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
    }

    // Interpolated position at time tt (lightweight, O(1) via cursor).
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

    function createTrackEntity(scene, engine, camera, trackId) {
        const mesh = createSpacecraftModel();
        mesh.visible = false;
        scene.add(mesh);
        mesh.userData.trackId = trackId;

        const pathLine = buildPathLine(engine, trackId);
        scene.add(pathLine);

        const ribbon = createTrailRibbon();
        ribbon.visible = false;
        scene.add(ribbon);

        let trailVisible = true;

        function buildPathLine(eng, id) {
            const kfs = eng.getSamplesFor(id);
            const pos = new Float32Array(kfs.length * 3);
            kfs.forEach((s, i) => {
                pos[i * 3] = s.position.x;
                pos[i * 3 + 1] = s.position.y;
                pos[i * 3 + 2] = s.position.z;
            });
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
                color: 0x3a7bd5, transparent: true, opacity: 0.4,
            }));
            line.frustumCulled = false;
            return line;
        }

        // Gradient, orientation-aware ribbon over [t-TRAIL_SECONDS, t]. Width is
        // scaled to the camera distance so the ribbon stays visible when zoomed
        // out; width is oriented to the body's roll (body-up projected off the
        // path tangent, falling back to cross(position,tangent)).
        function updateTrails(t, st) {
            const kfs = engine.getSamplesFor(trackId);
            if (!trailVisible || !kfs || kfs.length < 2) { ribbon.visible = false; return; }
            const firstT = kfs[0].t, lastT = kfs[kfs.length - 1].t;
            const t1 = Math.max(firstT, t - TRAIL_SECONDS);
            const tEnd = Math.min(lastT, t);
            const span = Math.max(tEnd - t1, 1e-9);

            const camDist = camera.position.distanceTo(st.position);
            const halfW = clamp(camDist * WIDTH_DIST_SCALE, WIDTH_MIN, WIDTH_MAX) / 2;

            const positions = ribbon.geometry.attributes.position.array;
            const colors = ribbon.geometry.attributes.color.array;
            const fwd = new THREE.Vector3();
            const upBody = new THREE.Vector3();
            const lat = new THREE.Vector3();
            const cursor = { i: 0 };

            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const tt = t1 + span * u;
                const p = positionAt(kfs, tt, cursor);
                const sti = engine.getStateAtTimeFor(trackId, tt);

                if (sti && sti.velocity.lengthSq() > 1e-12) fwd.copy(sti.velocity).normalize();
                else fwd.set(0, 0, -1);
                upBody.set(0, 1, 0).applyQuaternion(sti ? sti.orientation : new THREE.Quaternion());
                lat.copy(upBody).addScaledVector(fwd, -upBody.dot(fwd));
                if (lat.lengthSq() < 1e-12) lat.crossVectors(sti ? sti.position : new THREE.Vector3(), fwd);
                lat.normalize();

                const a = i * 2, b = i * 2 + 1;
                positions[a * 3]     = p.x + lat.x * halfW;
                positions[a * 3 + 1] = p.y + lat.y * halfW;
                positions[a * 3 + 2] = p.z + lat.z * halfW;
                positions[b * 3]     = p.x - lat.x * halfW;
                positions[b * 3 + 1] = p.y - lat.y * halfW;
                positions[b * 3 + 2] = p.z - lat.z * halfW;

                writeColor(colors, a, u);
                writeColor(colors, b, u);
            }

            ribbon.visible = true;
            ribbon.geometry.attributes.position.needsUpdate = true;
            ribbon.geometry.attributes.color.needsUpdate = true;
        }

        function setTrailsVisible(v) { trailVisible = !!v; }
        function getTrailsVisible() { return trailVisible; }
        function getTrackId() { return trackId; }

        function update(t) {
            const st = engine.getStateAtTimeFor(trackId, t);
            if (st) {
                mesh.visible = true;
                mesh.position.copy(st.position);
                mesh.quaternion.copy(st.orientation);
                updateTrails(t, st);
            } else {
                mesh.visible = false;
            }
            return st;
        }

        return { update, setTrailsVisible, getTrailsVisible, getTrackId, getMesh: () => mesh };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTrackEntity = createTrackEntity;
})(window);
