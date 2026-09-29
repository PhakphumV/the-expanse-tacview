// js/render/effects.js
// Procedural burst effects spawned at intercept/hit-class events. Each
// burst is an additive-blended sphere that fades and expands over
// BURST_DURATION seconds.
//
// Burst location per event type (mirrored in scripts/validate-playback.js):
//   intercept              -> actor   (the destroyed torpedo)
//   hit                    -> target  (the struck ship)
//   torpedo_intercept      -> target  (the destroyed missile)
//   missile_intercept      -> target  (the destroyed missile)
//   zmeya_drive_disabled   -> target  (the disabled ship)

import { getBurstEntityId, isHitEvent } from '../data/event-model.js';

const THREE = window.THREE;

const BURST_DURATION = 1.0;

function createBurstMesh(color) {
    const geom = new THREE.SphereGeometry(5, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    return new THREE.Mesh(geom, mat);
}

export function createEffectsManager(scene, playbackEngine) {
    const bursts = [];

    function loadBursts() {
        reset();
        const events = playbackEngine.getEvents();
        for (const ev of events) {
            const burstEntityId = getBurstEntityId(ev);
            if (!burstEntityId) continue;
            const sMap = playbackEngine.getStateAtTime(ev.t);
            const s = sMap[burstEntityId];
            if (s && s.active) {
                const color = isHitEvent(ev)
                    ? 0xff3333 : 0xffaa33;
                const mesh = createBurstMesh(color);
                mesh.position.copy(s.position);
                mesh.visible = false;
                scene.add(mesh);
                bursts.push({ mesh, startTime: ev.t, duration: BURST_DURATION });
            }
        }
    }

    function update(t) {
        for (const b of bursts) {
            const elapsed = t - b.startTime;
            if (elapsed < 0 || elapsed > b.duration) {
                b.mesh.visible = false;
            } else {
                b.mesh.visible = true;
                const u = elapsed / b.duration;
                b.mesh.material.opacity = 1 - u;
                const scale = 1 + u * 2;
                b.mesh.scale.setScalar(scale);
            }
        }
    }

    // Remove and dispose all burst meshes so a new engagement starts
    // with no stale effects from the previous one.
    function reset() {
        for (const b of bursts) {
            scene.remove(b.mesh);
            b.mesh.geometry.dispose();
            b.mesh.material.dispose();
        }
        bursts.length = 0;
    }

    return { loadBursts, reset, update };
}
