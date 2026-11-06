// js/entities.js
// The tracked-object renderer: a spacecraft body + the full orbital path
// polyline + a gradient, orientation-aware ribbon trail showing recent motion.
//
// Classic-script module: attaches Tacview.createTrackEntity.

(function (global) {
    'use strict';
    const THREE = global.THREE;
    const createSpacecraftModel = global.Tacview.createSpacecraftModel;

    const TRAIL_SECONDS = 300;
    const TRAIL_SAMPLES = 60;      // path samples along the ribbon
    const RIBBON_WIDTH = 40;       // full physical width of the ribbon (m)

    // Gradient: interpolate across these colors head -> tail.
    // Head (bright cyan/white), mid (blue), tail (fades to transparent-ish).
    const HEAD_COLOR = new THREE.Color(0xaef2ff);
    const MID_COLOR = new THREE.Color(0x3a7bd5);
    const TAIL_COLOR = new THREE.Color(0x0a2a5a);

    function createTrailRibbon() {
        const verts = TRAIL_SAMPLES * 2;
        const positions = new Float32Array(verts * 3);
        const colors = new Float32Array(verts * 3);
        const indices = [];
        // Triangle strip: for each segment, two triangles (a0,a1,b0),(a1,b0,b1).
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
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ribbon = new THREE.Mesh(geom, mat);
        ribbon.frustumCulled = false;
        return ribbon;
    }

    // Write the gradient color for path position u in [0,1] (0=head,1=tail).
    function writeColor(arr, i, u) {
        const col = new THREE.Color();
        if (u < 0.5) {
            col.copy(HEAD_COLOR).lerp(MID_COLOR, u * 2);
        } else {
            col.copy(MID_COLOR).lerp(TAIL_COLOR, (u - 0.5) * 2);
        }
        arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
    }

    function createTrackEntity(scene, engine) {
        const mesh = createSpacecraftModel();
        mesh.visible = false;
        scene.add(mesh);

        const pathLine = buildPathLine(engine);
        scene.add(pathLine);

        const trail = createTrailRibbon();
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
                color: 0x3a7bd5, transparent: true, opacity: 0.4,
            }));
            line.frustumCulled = false;
            return line;
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

        // Build the ribbon: a triangle strip spanning the last TRAIL_SECONDS of
        // the object's path. Ribbon width is oriented to the spacecraft's body:
        // we take the body's local "up" axis (roll-aware) and project it onto
        // the plane perpendicular to the path tangent, so the ribbon always
        // lies flat through the heading and carries the body's roll. Colors are
        // a head-to-tail gradient.
        function updateTrails(t) {
            const kfs = engine.getSamples();
            if (!trailVisible || !kfs || kfs.length < 2) { trail.visible = false; return; }
            const firstT = kfs[0].t, lastT = kfs[kfs.length - 1].t;
            const t1 = Math.max(firstT, t - TRAIL_SECONDS);
            const tEnd = Math.min(lastT, t);
            const span = Math.max(tEnd - t1, 1e-9);

            const positions = trail.geometry.attributes.position.array;
            const colors = trail.geometry.attributes.color.array;
            const halfW = RIBBON_WIDTH / 2;
            const fwd = new THREE.Vector3();
            const upBody = new THREE.Vector3();
            const lat = new THREE.Vector3();

            const cursor = { i: 0 };
            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const tt = t1 + span * u;
                const p = positionAt(kfs, tt, cursor);

                // Path tangent (heading) from the object's state at this sample.
                const st = engine.getStateAtTime(tt);
                if (st && st.velocity.lengthSq() > 1e-12) fwd.copy(st.velocity).normalize();
                else fwd.set(0, 0, -1);
                // Body "up" axis in world space, projected off the tangent so the
                // ribbon width reflects the spacecraft's roll about its heading.
                upBody.set(0, 1, 0).applyQuaternion(st ? st.orientation : new THREE.Quaternion());
                lat.copy(upBody).addScaledVector(fwd, -upBody.dot(fwd));
                if (lat.lengthSq() < 1e-12) lat.crossVectors(st ? st.position : new THREE.Vector3(), fwd);
                lat.normalize();

                // Two ribbon vertices offset by ±lateral.
                const a = i * 2, b = i * 2 + 1;
                positions[a * 3]     = p.x + lat.x * halfW;
                positions[a * 3 + 1] = p.y + lat.y * halfW;
                positions[a * 3 + 2] = p.z + lat.z * halfW;
                positions[b * 3]     = p.x - lat.x * halfW;
                positions[b * 3 + 1] = p.y - lat.y * halfW;
                positions[b * 3 + 2] = p.z - lat.z * halfW;

                // Gradient same color for the two vertices at this position.
                writeColor(colors, a, u);
                writeColor(colors, b, u);
            }

            trail.visible = true;
            trail.geometry.attributes.position.needsUpdate = true;
            trail.geometry.attributes.color.needsUpdate = true;
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
