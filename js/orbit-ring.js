// js/orbit-ring.js
// Faint, dashed guide ring for a celestial track. The ring is derived from the
// track's own samples — mean radius and the orbit plane at the first sample — so
// it always matches the data instead of a hardcoded inclination.
//
// The dash pattern is world-space, so it is rescaled with the camera distance
// (updateDashScale). Without that a dash sized for a 384 000 km lunar orbit
// would smear into a solid line when zoomed in on a 185 km parking orbit.
//
// Classic-script module: attaches Tacview.createOrbitRing, Tacview.updateDashScale.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const SEGMENTS = 256;
    const COLOR = 0x556677;
    const OPACITY = 0.18;
    const DASH_FRACTION = 1 / 220;  // dash length ≈ 1/220 of the line's own size
    const DASH_DIST_FRACTION = 0.010; // or ≈ 1% of the camera distance, whichever is larger
    const GAP_RATIO = 0.75;         // gap = 0.75 × dash

    // Rescale a dashed line's pattern to the current camera distance. Cheap:
    // computeLineDistances() only runs when the scale actually changes.
    function updateDashScale(line, camDist) {
        if (!line || !line.material || line.material.type !== 'LineDashedMaterial') return;
        const extent = line.userData.dashExtent || 1e6;
        const dash = Math.max(extent * DASH_FRACTION, camDist * DASH_DIST_FRACTION);
        const prev = line.userData.dashScale || 0;
        if (prev > 0 && Math.abs(dash - prev) / dash < 0.15) return;
        line.material.dashSize = dash;
        line.material.gapSize = dash * GAP_RATIO;
        line.computeLineDistances();
        line.userData.dashScale = dash;
    }

    function makeDashedLine(geometry, opts) {
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({
            color: opts.color,
            transparent: true,
            opacity: opts.opacity,
            dashSize: 1,
            gapSize: 1,
            depthWrite: false,
        }));
        line.frustumCulled = false;
        line.userData.dashExtent = opts.extent || 1e6;
        line.userData.dashScale = 0;
        updateDashScale(line, opts.extent || 1e6);
        return line;
    }

    // samples: [{ position: Vector3, velocity: Vector3 }] — anything with a
    // usable first sample will do; returns null when the geometry is degenerate.
    function createOrbitRing(samples) {
        if (!samples || samples.length < 2) return null;
        const p0 = samples[0].position;
        const v0 = samples[0].velocity;
        if (!p0 || !v0) return null;

        const normal = new THREE.Vector3().crossVectors(p0, v0);
        if (normal.lengthSq() < 1e-9) return null;
        normal.normalize();

        const u = new THREE.Vector3().copy(p0).normalize();       // radial, at t0
        const w = new THREE.Vector3().crossVectors(normal, u).normalize();

        let radius = 0;
        for (const s of samples) radius += s.position.length();
        radius /= samples.length;

        // A Line (not LineLoop) with the closing point duplicated, so the dash
        // distances run all the way round.
        const pos = new Float32Array((SEGMENTS + 1) * 3);
        for (let i = 0; i <= SEGMENTS; i++) {
            const a = (i / SEGMENTS) * Math.PI * 2;
            const c = Math.cos(a) * radius;
            const s = Math.sin(a) * radius;
            pos[i * 3]     = u.x * c + w.x * s;
            pos[i * 3 + 1] = u.y * c + w.y * s;
            pos[i * 3 + 2] = u.z * c + w.z * s;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return makeDashedLine(geom, {
            color: COLOR,
            opacity: OPACITY,
            extent: 2 * Math.PI * radius,
        });
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createOrbitRing = createOrbitRing;
    global.Tacview.updateDashScale = updateDashScale;
    global.Tacview.makeDashedLine = makeDashedLine;
})(window);
