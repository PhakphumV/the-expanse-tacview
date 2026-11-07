// js/entities.js
// Tracked-object renderers. Two flavours, chosen by the track's `kind` meta:
//   - artificial space object (default): spacecraft body + full orbital path
//     polyline + a bright, gradient, orientation-aware ribbon trail.
//   - celestial body (`kind: "celestial"`): wireframe sphere (no path polyline —
//     the scene's orbit ring already shows the orbit) + the same ribbon trail,
//     rendered far more subtly (dimmer, thinner, colder) so a body's arc never
//     competes with an artificial object's.
// Ribbon width scales with camera distance so it stays visible when zoomed out.
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

    // At cislunar range a 26 m spacecraft and a 3 500 km Moon are both far
    // smaller than a pixel. Like the trail width, the body is scaled up with
    // camera distance so it never shrinks below MIN_APPARENT_RAD — true scale is
    // only used once you are close enough for it to read.
    const MODEL_EXTENT = 26;        // m — spacecraft hull length
    const MIN_APPARENT_RAD = 0.012; // ≈ 9 px on a 780 px viewport at 60° fov

    // Bright trail: artificial space objects only (head bright, mid blue).
    const OBJECT_TRAIL = {
        head: new THREE.Color(0xd6f4ff),
        mid: new THREE.Color(0x3a8fe0),
        alpha: 1.0,
        widthScale: 1.0,
        pathLine: true,
        pathColor: 0x3a7bd5,
        pathOpacity: 0.4,
        pathWidth: 1,
    };

    // Subtle trail: celestial bodies. Same geometry, fade and width scaling as
    // an object's ribbon, but colder, thinner and much dimmer — the arc reads
    // against the orbit ring without competing with an artificial object.
    const CELESTIAL_TRAIL = {
        head: new THREE.Color(0x9fb4d4),
        mid: new THREE.Color(0x5b6f92),
        alpha: 0.5,
        widthScale: 0.55,
        pathLine: false,
        pathColor: 0x44506a,
        pathOpacity: 0.12,
        pathWidth: 1,
    };

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function trailStyleFor(meta) {
        return meta && meta.kind === 'celestial' ? CELESTIAL_TRAIL : OBJECT_TRAIL;
    }

    // Celestial bodies are inert shells: a wireframe sphere sized by the track's
    // radius_m. No attitude is shown, so the mesh ignores the sample quaternion.
    function createCelestialMesh(radius) {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 16),
            new THREE.MeshBasicMaterial({
                color: 0x9aa0a8, wireframe: true, transparent: true, opacity: 0.5,
            })
        );
        group.add(shell);
        return group;
    }

    function createTrailRibbon(style) {
        const verts = TRAIL_SAMPLES * 2;
        const positions = new Float32Array(verts * 3);
        const colors = new Float32Array(verts * 3);
        const alphas = new Float32Array(verts);
        const indices = [];
        for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
            const a0 = i * 2, a1 = i * 2 + 1;
            const b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
            indices.push(a0, a1, b0, a1, b0, b1);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        geom.setIndex(indices);
        // Per-vertex alpha needs a small shader (MeshBasicMaterial only blends
        // the whole mesh's opacity), so bake RGB + alpha and fade the tail to 0.
        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: [
                'attribute vec3 color;',
                'attribute float alpha;',
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main(){ vColor = color; vAlpha = alpha;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main(){ gl_FragColor = vec4(vColor, vAlpha); }',
            ].join('\n'),
        });
        const ribbon = new THREE.Mesh(geom, mat);
        ribbon.frustumCulled = false;
        ribbon.userData.style = style;
        return ribbon;
    }

    // p runs 0 (old tail) -> 1 (head, at the object). Color goes mid (middle)
    // to head; tail color is irrelevant since alpha fades it to 0.
    function writeColor(arr, i, p, style) {
        const col = new THREE.Color();
        if (p < 0.5) col.copy(style.mid);
        else col.copy(style.mid).lerp(style.head, (p - 0.5) * 2);
        arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
    }

    // Fade the tail (p=0) in to full opacity by p=0.4, so the far end is
    // transparent, the middle is solid mid, the head is solid head.
    function writeAlpha(arr, i, p, style) {
        const fade = p < 0.4 ? p / 0.4 : 1;
        arr[i] = fade * style.alpha;
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

    function buildPathLine(eng, id, style) {
        const kfs = eng.getSamplesFor(id);
        const pos = new Float32Array(kfs.length * 3);
        let extent = 0;
        kfs.forEach((s, i) => {
            pos[i * 3] = s.position.x;
            pos[i * 3 + 1] = s.position.y;
            pos[i * 3 + 2] = s.position.z;
            if (i > 0) extent += s.position.distanceTo(kfs[i - 1].position);
        });
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return global.Tacview.makeDashedLine(geom, {
            color: style.pathColor,
            opacity: style.pathOpacity,
            extent,
        });
    }

    function createTrackEntity(container, engine, camera, trackId) {
        const track = engine.getTrack(trackId);
        const meta = (track && track.meta) || {};
        const isCelestial = meta.kind === 'celestial';
        const style = trailStyleFor(meta);

        const mesh = isCelestial
            ? createCelestialMesh(meta.radius_m || 1737400)
            : createSpacecraftModel();
        mesh.visible = false;
        container.add(mesh);
        mesh.userData.trackId = trackId;

        let pathLine = null;
        if (style.pathLine) {
            pathLine = buildPathLine(engine, trackId, style);
            container.add(pathLine);
        }

        const ribbon = createTrailRibbon(style);
        ribbon.visible = false;
        container.add(ribbon);

        let trailVisible = true;

        // Gradient, orientation-aware ribbon over [t-TRAIL_SECONDS, t]. Width is
        // scaled to the camera distance so the ribbon stays visible when zoomed
        // out. Artificial objects orient the ribbon to the body's roll (body-up
        // projected off the path tangent); celestial bodies keep it in the
        // orbital plane (orbit normal x tangent) so the arc hugs the orbit.
        function updateTrails(t, st) {
            const kfs = engine.getSamplesFor(trackId);
            if (!trailVisible || !kfs || kfs.length < 2) { ribbon.visible = false; return; }
            const firstT = kfs[0].t, lastT = kfs[kfs.length - 1].t;
            const t1 = Math.max(firstT, t - TRAIL_SECONDS);
            const tEnd = Math.min(lastT, t);
            const span = Math.max(tEnd - t1, 1e-9);

            const camDist = camera.position.distanceTo(st.position);
            const halfW = (clamp(camDist * WIDTH_DIST_SCALE, WIDTH_MIN, WIDTH_MAX) / 2) * style.widthScale;

            const positions = ribbon.geometry.attributes.position.array;
            const colors = ribbon.geometry.attributes.color.array;
            const alphas = ribbon.geometry.attributes.alpha.array;
            const fwd = new THREE.Vector3();
            const upBody = new THREE.Vector3();
            const normal = new THREE.Vector3();
            const lat = new THREE.Vector3();
            const cursor = { i: 0 };
            const unitY = new THREE.Vector3(0, 1, 0);

            for (let i = 0; i < TRAIL_SAMPLES; i++) {
                const u = i / (TRAIL_SAMPLES - 1);
                const tt = t1 + span * u;
                const p = positionAt(kfs, tt, cursor);
                const sti = engine.getStateAtTimeFor(trackId, tt);

                if (sti && sti.velocity.lengthSq() > 1e-12) fwd.copy(sti.velocity).normalize();
                else fwd.set(0, 0, -1);

                if (isCelestial) {
                    normal.crossVectors(sti ? sti.position : p, fwd);
                    if (normal.lengthSq() > 1e-12) lat.crossVectors(normal.normalize(), fwd);
                    else lat.copy(unitY);
                } else {
                    upBody.set(0, 1, 0).applyQuaternion(sti ? sti.orientation : new THREE.Quaternion());
                    lat.copy(upBody).addScaledVector(fwd, -upBody.dot(fwd));
                    if (lat.lengthSq() < 1e-12) lat.crossVectors(sti ? sti.position : new THREE.Vector3(), fwd);
                }
                if (lat.lengthSq() < 1e-12) lat.copy(unitY);
                lat.normalize();

                const a = i * 2, b = i * 2 + 1;
                positions[a * 3]     = p.x + lat.x * halfW;
                positions[a * 3 + 1] = p.y + lat.y * halfW;
                positions[a * 3 + 2] = p.z + lat.z * halfW;
                positions[b * 3]     = p.x - lat.x * halfW;
                positions[b * 3 + 1] = p.y - lat.y * halfW;
                positions[b * 3 + 2] = p.z - lat.z * halfW;

                writeColor(colors, a, u, style);
                writeColor(colors, b, u, style);
                writeAlpha(alphas, a, u, style);
                writeAlpha(alphas, b, u, style);
            }

            ribbon.visible = true;
            ribbon.geometry.attributes.position.needsUpdate = true;
            ribbon.geometry.attributes.color.needsUpdate = true;
            ribbon.geometry.attributes.alpha.needsUpdate = true;
        }

        function setTrailsVisible(v) { trailVisible = !!v; }
        function getTrailsVisible() { return trailVisible; }
        function getTrackId() { return trackId; }
        function isCelestialBody() { return isCelestial; }

        function update(t) {
            const st = engine.getStateAtTimeFor(trackId, t);
            if (st) {
                mesh.visible = true;
                mesh.position.copy(st.position);
                if (!isCelestial) mesh.quaternion.copy(st.orientation);
                // Keep the object readable at orbital range (see MODEL_EXTENT).
                const dist = camera.position.distanceTo(st.position);
                const extent = isCelestial ? (meta.radius_m || 1737400) * 2 : MODEL_EXTENT;
                mesh.scale.setScalar(Math.max(1, dist * MIN_APPARENT_RAD / extent));
                if (pathLine) global.Tacview.updateDashScale(pathLine, dist);
                updateTrails(t, st);
            } else {
                mesh.visible = false;
            }
            return st;
        }

        return {
            update, setTrailsVisible, getTrailsVisible, getTrackId, isCelestialBody,
            getMesh: () => mesh,
        };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTrackEntity = createTrackEntity;
})(window);
