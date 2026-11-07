// js/orbit-ring.js
// Faint guide ring for a celestial track. The ring is derived from the track's
// own samples — mean radius and the orbit plane at t=0 — so it always matches
// the data instead of a hardcoded inclination.
//
// Classic-script module: attaches Tacview.createOrbitRing.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    const SEGMENTS = 256;
    const COLOR = 0x556677;
    const OPACITY = 0.18;

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
        const ring = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({
            color: COLOR, transparent: true, opacity: OPACITY,
        }));
        ring.frustumCulled = false;
        return ring;
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createOrbitRing = createOrbitRing;
})(window);
