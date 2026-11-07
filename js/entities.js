// js/entities.js
// Tracked-object renderers. Two flavours, chosen by the track's `kind` meta:
//   - artificial space object (default): spacecraft body + full orbital path
//     polyline + a bright, gradient, orientation-aware ribbon trail.
//   - celestial body (`kind: "celestial"`): wireframe sphere (no path polyline —
//     the scene's orbit ring already shows the orbit) + the same ribbon trail,
//     rendered far more subtly (dimmer, thinner, colder) so a body's arc never
//     competes with an artificial object's.
//
// Trail geometry follows ADR-0006: the ribbon is half as wide as it used to be
// for craft, its width scales with camera distance (constant apparent size at
// any zoom), and its *length* comes from the object's own orbit — 0.45 of the
// orbit perimeter for a celestial body, an eighth for a craft — instead of a
// fixed 300 s. Vertices are placed at equal arc length so a long coast does not
// waste them on nothing.
//
// Classic-script module: attaches Tacview.createTrackEntity.

(function (global) {
    'use strict';
    const THREE = global.THREE;
    const createSpacecraftModel = global.Tacview.createSpacecraftModel;
    const Trails = global.Tacview.Trails;

    const TRAIL_VERTS = 128;        // vertices along the ribbon (equal arc length)
    const SOLVE_INTERVAL_MS = 200;  // trail window solve rate (5 Hz)
    const LENGTH_TAU_S = 0.8;       // low-pass on the target length (eases regime changes)
    const SUBSTEPS = 256;           // time steps used to measure arc length
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
    // widthScale 0.5 is ADR-0006's "halve the craft ribbon": the band used to be
    // 2% of the camera distance, now 1%.
    const OBJECT_TRAIL = {
        head: new THREE.Color(0xd6f4ff),
        mid: new THREE.Color(0x3a8fe0),
        alpha: 1.0,
        widthScale: 0.5,
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
        const verts = TRAIL_VERTS * 2;
        const positions = new Float32Array(verts * 3);
        const colors = new Float32Array(verts * 3);
        const alphas = new Float32Array(verts);
        const indices = [];
        for (let i = 0; i < TRAIL_VERTS - 1; i++) {
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
    // transparent, the middle is solid mid, the head is solid head. p is the
    // arc-length fraction, so a 12-day lunar arc fades exactly like an
    // 11-minute LEO arc.
    function writeAlpha(arr, i, p, style) {
        const fade = p < 0.4 ? p / 0.4 : 1;
        arr[i] = fade * style.alpha;
    }

    // Interpolated state at time tt (O(1) via cursor). Cubic Hermite through the
    // sample positions and velocities, matching the engine so sparse sampling
    // still draws a smooth ribbon (ADR-0004 item 5). Velocity is lerped (the
    // ribbon only needs a tangent) and the orientation is the nearest sample's
    // (roll changes far too slowly to matter along a trail).
    function sampleAt(kfs, tt, cursor, out) {
        let i = cursor.i;
        // Resume from the cursor only when it is still behind tt; a ribbon walks
        // its vertices forward from the tail, so a stale cursor must restart.
        if (i < 0 || i >= kfs.length - 1 || kfs[i + 1].t <= tt || kfs[i].t > tt) i = 0;
        while (i < kfs.length - 2 && kfs[i + 1].t <= tt) i++;
        const a = kfs[i], b = kfs[i + 1];
        cursor.i = i;
        const span = b.t - a.t;
        if (!(span > 0)) {
            out.p.x = a.position.x; out.p.y = a.position.y; out.p.z = a.position.z;
            out.v.x = a.velocity.x; out.v.y = a.velocity.y; out.v.z = a.velocity.z;
            out.q = a.orientation;
            return out;
        }
        const u = clamp((tt - a.t) / span, 0, 1);
        // Hermite is only valid when the sample velocities describe the sample
        // spacing. The LEO scenario compresses the Moon's motion for display, so
        // its stored velocities (real, ~1 km/s) say nothing about positions that
        // move 200x faster; Hermite there folds the ribbon onto itself. When the
        // tangents disagree with the chord, interpolate linearly instead.
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dz = b.position.z - a.position.z;
        const chord = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const tangentRun = 0.5 * span * Math.sqrt(
            (a.velocity.x + b.velocity.x) ** 2 + (a.velocity.y + b.velocity.y) ** 2 + (a.velocity.z + b.velocity.z) ** 2);
        const consistent = chord > 0 && tangentRun > 0 && tangentRun / chord > 0.5 && tangentRun / chord < 2;
        if (!consistent) {
            out.p.x = a.position.x + dx * u;
            out.p.y = a.position.y + dy * u;
            out.p.z = a.position.z + dz * u;
            out.v.x = dx / span;
            out.v.y = dy / span;
            out.v.z = dz / span;
            out.q = u < 0.5 ? a.orientation : b.orientation;
            return out;
        }
        const u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        out.p.x = h00 * a.position.x + h10 * span * a.velocity.x + h01 * b.position.x + h11 * span * b.velocity.x;
        out.p.y = h00 * a.position.y + h10 * span * a.velocity.y + h01 * b.position.y + h11 * span * b.velocity.y;
        out.p.z = h00 * a.position.z + h10 * span * a.velocity.z + h01 * b.position.z + h11 * span * b.velocity.z;
        out.v.x = a.velocity.x + (b.velocity.x - a.velocity.x) * u;
        out.v.y = a.velocity.y + (b.velocity.y - a.velocity.y) * u;
        out.v.z = a.velocity.z + (b.velocity.z - a.velocity.z) * u;
        out.q = u < 0.5 ? a.orientation : b.orientation;
        return out;
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

        // Trail length is measured against the object's own orbit, so the track's
        // total arc is needed once as the presentation cap (ADR-0006 §2).
        const allSamples = engine.getSamplesFor(trackId) || [];
        const trackArc = allSamples.length > 1 ? Trails.arcLength(allSamples) : 0;
        // At lunar distance the craft is hyperbolic about Earth but orbiting the
        // Moon; the Moon's state is what the dominance test needs.
        const moonTrack = isCelestial ? null : engine.getTrack('moon');

        let lengthSmooth = null;
        let lastSolveMs = -1e9;
        let lastFrameMs = 0;
        let lastTransfer = false;
        let effLength = null;
        const vertTimes = new Float64Array(TRAIL_VERTS);
        const probe = { p: new THREE.Vector3(), v: new THREE.Vector3(), q: null };
        const cursor = { i: 0 };
        const fwd = new THREE.Vector3();
        const upBody = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const lat = new THREE.Vector3();
        const prevLat = new THREE.Vector3();
        const unitY = new THREE.Vector3(0, 1, 0);
        const zeroQuat = new THREE.Quaternion();

        // Place the vertex times at equal arc-length spacing across the window.
        function solveWindow(t, kfs, t0, tEnd) {
            const times = new Float64Array(SUBSTEPS);
            const cum = new Float64Array(SUBSTEPS);
            let prev = Trails.pointAt(kfs, t0);
            let acc = 0;
            times[0] = t0; cum[0] = 0;
            for (let i = 1; i < SUBSTEPS; i++) {
                const tt = t0 + (tEnd - t0) * (i / (SUBSTEPS - 1));
                const p = Trails.pointAt(kfs, tt);
                acc += Trails.dist(prev, p);
                times[i] = tt; cum[i] = acc; prev = p;
            }
            const total = acc;
            let j = 0;
            for (let i = 0; i < TRAIL_VERTS; i++) {
                const want = total * (i / (TRAIL_VERTS - 1));
                while (j < SUBSTEPS - 2 && cum[j + 1] < want) j++;
                const spanArc = cum[j + 1] - cum[j];
                const f = spanArc > 0 ? (want - cum[j]) / spanArc : 0;
                vertTimes[i] = times[j] + (times[j + 1] - times[j]) * f;
            }
            vertTimes[TRAIL_VERTS - 1] = tEnd;
            return total;
        }

        // Gradient, orientation-aware ribbon since the trail start (ADR-0006).
        // Width scales to the camera distance so the ribbon keeps its apparent
        // size at any zoom. Artificial objects orient the ribbon to the body's
        // roll (body-up projected off the path tangent); celestial bodies keep it
        // in the orbital plane (orbit normal x tangent) so the arc hugs the orbit.
        function updateTrails(t, st) {
            const kfs = allSamples;
            if (!trailVisible || !kfs || kfs.length < 2) { ribbon.visible = false; return; }
            const nowMs = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() : Date.now();
            const dtMs = lastFrameMs ? Math.min(nowMs - lastFrameMs, 100) : 16;
            lastFrameMs = nowMs;

            // Length is always low-passed: the filter is what turns a regime change
            // (orbit -> transfer at TLI, transfer -> lunar orbit at LOI) into an ease
            // instead of a snap. A scrub settles the same way in ~1 s, which reads
            // better than an instant jump and needs no seek heuristic.
            const firstT = kfs[0].t, trackLastT = kfs[kfs.length - 1].t;
            const tEnd = Math.min(trackLastT, t);
            const moonState = moonTrack ? engine.getStateAtTimeFor(moonTrack.id, t) : null;
            const transfer = !isCelestial && Trails.isTransfer({
                state: { position: st.position, velocity: st.velocity },
                moon: moonState ? { position: moonState.position, velocity: moonState.velocity } : null,
            });
            let target = Trails.targetLength({
                kind: isCelestial ? 'celestial' : 'object',
                state: { position: st.position, velocity: st.velocity },
                moon: moonState ? { position: moonState.position, velocity: moonState.velocity } : null,
                arcLength: trackArc,
            });
            if (transfer) {
                // The 60-minute transfer cap is applied as a *distance*, not as a hard
                // cut on the window: that way the low-pass below eases into and out of
                // it instead of snapping the ribbon short.
                target = Math.min(target, Trails.lengthOver(kfs, tEnd, Trails.TRANSFER_WINDOW_S));
            }
            lastTransfer = transfer;
            if (lengthSmooth === null) lengthSmooth = target;
            else lengthSmooth += (target - lengthSmooth) * Math.min(1, dtMs / (LENGTH_TAU_S * 1000));

            // 2. Re-solve the window at 5 Hz: the vertex times do not move between
            //    solves (they are historical points), so the ribbon is stable.
            if (nowMs - lastSolveMs > SOLVE_INTERVAL_MS) {
                lastSolveMs = nowMs;
                const t0 = Math.max(firstT, Trails.windowStart(kfs, tEnd, lengthSmooth));
                effLength = solveWindow(t, kfs, t0, tEnd);
                ribbon.userData.trail = {
                    target, smooth: lengthSmooth, t0, tEnd, trackArc, transfer, effective: effLength,
                };
            }
            vertTimes[TRAIL_VERTS - 1] = tEnd;

            const camDist = camera.position.distanceTo(st.position);
            const halfW = (clamp(camDist * WIDTH_DIST_SCALE, WIDTH_MIN, WIDTH_MAX) / 2) * style.widthScale;

            const positions = ribbon.geometry.attributes.position.array;
            const colors = ribbon.geometry.attributes.color.array;
            const alphas = ribbon.geometry.attributes.alpha.array;

            prevLat.set(0, 0, 0);
            cursor.i = 0;
            for (let i = 0; i < TRAIL_VERTS; i++) {
                const u = i / (TRAIL_VERTS - 1);
                // The head is pinned to the live state so the ribbon always
                // touches the object, whatever the solve rate.
                const p = i === TRAIL_VERTS - 1 ? st.position : sampleAt(kfs, vertTimes[i], cursor, probe).p;

                if (i === TRAIL_VERTS - 1) fwd.copy(st.velocity);
                else fwd.copy(probe.v);
                if (fwd.lengthSq() > 1e-12) fwd.normalize();
                else fwd.set(0, 0, -1);

                if (isCelestial) {
                    normal.crossVectors(i === TRAIL_VERTS - 1 ? st.position : probe.p, fwd);
                    if (normal.lengthSq() > 1e-12) lat.crossVectors(normal.normalize(), fwd);
                    else lat.copy(unitY);
                } else {
                    upBody.set(0, 1, 0).applyQuaternion(
                        (i === TRAIL_VERTS - 1 ? st.orientation : probe.q) || zeroQuat);
                    lat.copy(upBody).addScaledVector(fwd, -upBody.dot(fwd));
                    if (lat.lengthSq() < 1e-12) lat.crossVectors(i === TRAIL_VERTS - 1 ? st.position : probe.p, fwd);
                }
                if (lat.lengthSq() < 1e-12) lat.copy(unitY);
                lat.normalize();
                // Keep the ribbon from twisting: over a long arc the up-vector can
                // flip between adjacent vertices, which folds the band.
                if (i > 0 && lat.dot(prevLat) < 0) lat.negate();
                prevLat.copy(lat);

                const a = i * 2, b = i * 2 + 1;
                // Ease the far end: a shorter band that still had full width would
                // end in a blunt cut. Tapering the last half of the arc (with the
                // alpha fade) makes the tail read as a fade rather than a snap.
                const taper = u < 0.5 ? 0.35 + 0.65 * (u / 0.5) : 1;
                const w = halfW * taper;
                positions[a * 3]     = p.x + lat.x * w;
                positions[a * 3 + 1] = p.y + lat.y * w;
                positions[a * 3 + 2] = p.z + lat.z * w;
                positions[b * 3]     = p.x - lat.x * w;
                positions[b * 3 + 1] = p.y - lat.y * w;
                positions[b * 3 + 2] = p.z - lat.z * w;

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
        // Length actually drawn (after the transfer cap), falling back to the
        // orbit-derived target before the first solve.
        function getTrailLength() { return effLength === null ? lengthSmooth : effLength; }
        function isTransferTrail() { return lastTransfer; }
        function getTrailTarget() { return lengthSmooth; }

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
            getTrailLength, getTrailTarget, isTransferTrail, getMesh: () => mesh,
        };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTrackEntity = createTrackEntity;
})(window);
