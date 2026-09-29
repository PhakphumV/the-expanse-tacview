// js/render/starfield.js
// Procedural starfield with inertial-frame parallax (Phase 6 #33).
//
// Three layers at different depths drift each frame opposite to the
// unweighted velocity mean of the two active ships (per ADR-0004 / Q8):
//
//   v_frame = 0.5 * (v_roci + v_zmeya)
//
// Each layer has its own parallax factor. Closer layers have higher
// parallax so they appear to slide past faster than the more distant
// layers, producing differential parallax depth — the "brachistochrone
// travel illusion" the issue describes.
//
// The previous Phase-6-pre starfield (in js/render/scene.js) rotated the
// particles uniformly around the scene origin, which read as "orbiting
// a fixed center" rather than traveling through deep space. That
// behavior is removed by this module.

import { CONFIG } from '../utils/config.js';

const THREE = window.THREE;

export function createStarfield(scene, playbackEngine) {
    const layers = [];
    for (const cfg of CONFIG.starfield.layers) {
        const positions = new Float32Array(cfg.count * 3);
        for (let i = 0; i < cfg.count; i++) {
            // Uniform distribution on a sphere of `radius`. Star
            // positions within the layer are fixed; the entire
            // THREE.Points object translates per frame (cheaper than
            // rewriting 6000 vertex slots).
            const r = cfg.radius;
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: cfg.size,
            sizeAttenuation: false,
        });
        const points = new THREE.Points(geom, mat);
        scene.add(points);
        layers.push({ points, parallax: cfg.parallax });
    }

    // Last known v_frame for outside-active-window fallback. The
    // starfield keeps drifting at the most recent rate when neither
    // ship is currently active (e.g., before t=0, after t=duration, or
    // during a pause outside the engagement window) so the scene
    // doesn't visibly freeze.
    const lastFrameV = new THREE.Vector3();
    // Scratch vector reused across calls to avoid per-frame allocations.
    const _scratch = new THREE.Vector3();

    function update(t, dt) {
        // Resolve the unweighted velocity mean of the active ships at
        // the current playback time. With two ships this is the mean;
        // the pattern generalizes to "mean of all active ships" if a
        // future engagement grows past two combatants.
        const integratedMap = playbackEngine.getIntegratedStateAtTime(t);
        const roci = integratedMap['roci'];
        const zmeya = integratedMap['zmeya'];
        let vFrame;
        if (roci && roci.active && zmeya && zmeya.active) {
            vFrame = _scratch.copy(roci.velocity).add(zmeya.velocity).multiplyScalar(0.5);
            lastFrameV.copy(vFrame);
        } else if (roci && roci.active) {
            vFrame = _scratch.copy(roci.velocity);
            lastFrameV.copy(vFrame);
        } else if (zmeya && zmeya.active) {
            vFrame = _scratch.copy(zmeya.velocity);
            lastFrameV.copy(vFrame);
        } else {
            vFrame = _scratch.copy(lastFrameV);
        }
        // Translate each layer's points object opposite to v_frame,
        // scaled by the layer's parallax factor. The geometry
        // positions are fixed in their local frame; only the parent
        // group's world position changes, so each frame's cost is 3
        // vector addScaledVector calls regardless of layer size.
        for (const layer of layers) {
            layer.points.position.addScaledVector(vFrame, -dt * layer.parallax);
        }
    }

    return { update };
}
