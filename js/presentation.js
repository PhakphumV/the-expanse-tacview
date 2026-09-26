// js/presentation.js
// Final presentation layer: mission title, replay status, elapsed/
// remaining time, IFF legend, and engagement summary. All derived from
// existing telemetry and events — no new gameplay mechanics.

const THREE = window.THREE;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function formatMmSs(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t - m * 60);
    return pad(m) + ':' + pad(s);
}
function formatMmSsTenths(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return pad(m) + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

export function createPresentation(playbackEngine) {
    const titleEl   = document.getElementById('missionTitle');
    const liveDotEl = document.getElementById('liveDot');
    const statusEl  = document.getElementById('replayStatus');
    const elapsedEl = document.getElementById('elapsedReadout');
    const remainEl  = document.getElementById('remainingReadout');
    const summaryEl = document.getElementById('engagementSummary');

    const LAUNCH_TYPES = new Set(['launch', 'roci_torpedo_launch', 'zmeya_barrage_launch']);
    const INTERCEPT_TYPES = new Set(['intercept', 'torpedo_intercept', 'missile_intercept']);
    const HIT_TYPES = new Set(['hit', 'zmeya_drive_disabled']);
    const LOCK_TYPES = new Set(['lock', 'missile_lock']);

    function buildSummary() {
        if (!summaryEl) return;
        const events = playbackEngine.getEvents();
        const intercepts = events.filter(e => INTERCEPT_TYPES.has(e.type)).length;
        const hits = events.filter(e => HIT_TYPES.has(e.type)).length;
        const locks = events.filter(e => LOCK_TYPES.has(e.type)).length;
        const launches = events.filter(e => LAUNCH_TYPES.has(e.type)).length;
        const dur = playbackEngine.getDuration();
        summaryEl.innerHTML =
            '<div class="summary-row"><span class="k">DURATION</span><span class="v">' +
            formatMmSs(dur) + '</span></div>' +
            '<div class="summary-row"><span class="k">LAUNCHES</span><span class="v">' +
            launches + '</span></div>' +
            '<div class="summary-row"><span class="k">INTERCEPTS</span><span class="v">' +
            intercepts + '</span></div>' +
            '<div class="summary-row"><span class="k">HITS</span><span class="v">' +
            hits + '</span></div>' +
            '<div class="summary-row"><span class="k">LOCKS</span><span class="v">' +
            locks + '</span></div>';
    }

    function update() {
        const t = playbackEngine.getTime();
        const dur = playbackEngine.getDuration();
        const remaining = Math.max(0, dur - t);
        if (elapsedEl) elapsedEl.textContent = formatMmSsTenths(t);
        if (remainEl)  remainEl.textContent  = '-' + formatMmSsTenths(remaining);
        if (statusEl) {
            const label = playbackEngine.isPlaying() ? 'REPLAYING' : 'PAUSED';
            if (statusEl.textContent !== label) statusEl.textContent = label;
        }
    }

    buildSummary();

    return { update, buildSummary };
}

// ---- Range ring (tactical visual aid) ----
// A flat ring on the XZ plane at each ship's position. Radius is 10 km
// (10000 m). Renders as a LineLoop so it's cheap and consistent with
// the existing trail rendering style.
function createRangeRing(radius) {
    const segments = 64;
    const positions = new Float32Array((segments + 1) * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
        color: 0x66ffaa,
        transparent: true,
        opacity: 0.35,
    });
    const ring = new THREE.LineLoop(geom, mat);
    ring.frustumCulled = false;
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions[i * 3]     = Math.cos(a) * radius;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(a) * radius;
    }
    geom.attributes.position.needsUpdate = true;
    return ring;
}

export function createRangeRings(scene, playbackEngine) {
    const RING_RADIUS = 10000; // 10 km
    const rings = {};

    function build() {
        reset();
        const ents = playbackEngine.getEntities();
        for (const id in ents) {
            if (ents[id].type !== 'ship') continue;
            const color = id === 'roci' ? 0x66aaff : 0xff8888;
            const ring = createRangeRing(RING_RADIUS);
            ring.material.color.setHex(color);
            ring.visible = false;
            scene.add(ring);
            rings[id] = ring;
        }
    }

    // Remove and dispose all rings so a new engagement starts clean.
    function reset() {
        for (const id in rings) {
            scene.remove(rings[id]);
            rings[id].geometry.dispose();
            rings[id].material.dispose();
            delete rings[id];
        }
    }

    function update(t) {
        const stateMap = playbackEngine.getStateAtTime(t);
        for (const id in rings) {
            const s = stateMap[id];
            const ring = rings[id];
            if (s && s.active) {
                ring.visible = true;
                ring.position.copy(s.position);
            } else {
                ring.visible = false;
            }
        }
    }

    return { build, reset, update };
}
