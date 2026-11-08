// js/explosion.js
// Core visual for "explosion" events: a scenario author drops an event with
// `type: "explosion"` (and `track` naming which tracked object exploded, so the
// effect can be anchored to a world position) and the renderer draws the blast
// there. Any scenario can carry one; a scenario with none shows nothing.
//
// The effect is deliberately cheap: one smooth orange sphere that pops to full
// size in a fraction of a second of mission time and then fades out. No sprites,
// no halo, no persistent ember. Its shading is baked into vertex colours (a
// fixed light direction, smooth per-vertex normals), so the scene needs no
// lights and the ball still reads as a rounded body rather than a flat disc.
//
// Size is tied to the zoom level: the sphere keeps roughly a tenth of the
// viewport at long range (so it never vanishes into a pixel) and is capped at a
// fifth when you zoom in (so it never swallows the scene).
//
// Anchoring: the effect sits at the host track's interpolated position at the
// event epoch (one position, frozen when the effect is built). It does not move
// with the craft afterwards — the accident happened at that point in space.
//
// Classic-script module: attaches Tacview.createExplosionSystem.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    // Defaults, all overridable per event.
    const DEF_DURATION = 60;        // mission-seconds from detonation to gone
    const DEF_RADIUS = 25000;       // metres — seen against a lunar-distance view

    const POP_FRAC = 0.12;          // share of the life spent expanding
    const SETTLE_GROWTH = 0.12;     // extra radius gained over the rest of the life
    const FADE_START = 0.45;        // life fraction where the fade-out begins
    const FLASH_ALPHA = 0.95;
    const START_ALPHA = 0.55;       // see-through while it is still expanding

    // Size floor/ceiling as a fraction of what the viewport spans at the sphere's
    // distance: unreadably small below the floor, overbearing above the ceiling.
    const MIN_APPARENT_FRAC = 0.09;  // ≈ 9 % of a 780 px viewport at 60° fov
    const MAX_APPARENT_FRAC = 0.20;  // ≈ 20 % — big, but never fills the screen

    // Fireball tint: a pale hot side fading to deep orange on the dark side.
    const HOT_COLOR = 0xffc46b;
    const BASE_COLOR = 0xff7a1a;

    // 48 × 32 segments: a smooth silhouette at any zoom the viewer allows, and
    // still cheap (about 3 000 triangles for one effect).
    const SPHERE_WIDTH_SEGMENTS = 48;
    const SPHERE_HEIGHT_SEGMENTS = 32;
    const LIGHT_DIR = new THREE.Vector3(0.45, 0.6, 0.66).normalize();

    // Bake shading into vertex colours: each vertex takes a colour from its own
    // normal, so interpolation across the faces gives a smooth gradient. No
    // normals or lights are needed at render time.
    function shadeGeometry(geometry) {
        const pos = geometry.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const hot = new THREE.Color(HOT_COLOR);
        const base = new THREE.Color(BASE_COLOR);
        const n = new THREE.Vector3();
        const col = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            n.fromBufferAttribute(pos, i).normalize();

            // Lit side runs pale and hot, the limb drops toward deep orange.
            const d = n.dot(LIGHT_DIR);
            const lit = 0.42 + 0.78 * (d * 0.5 + 0.5);
            col.copy(base).multiplyScalar(lit).lerp(hot, Math.max(0, d) * 0.4);
            col.r = Math.min(1, col.r);
            col.g = Math.min(1, col.g);
            col.b = Math.min(1, col.b);

            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }

    function makeBlastGeometry() {
        return shadeGeometry(new THREE.SphereGeometry(1, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS));
    }

    function createExplosionSystem(scene, engine) {
        // One render object per explosion event, keyed by event.
        const effects = new Map();

        function build(e) {
            const mat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: FLASH_ALPHA,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(makeBlastGeometry(), mat);
            mesh.frustumCulled = false;

            // Anchor to the host track's position at the explosion epoch. If no
            // host track is named (or it has no state then), fall back to Earth.
            const trackId = (e.track != null && String(e.track)) || defaultTrack();
            const st = trackId ? engine.getStateAtTimeFor(trackId, e.t) : null;
            const anchor = st ? st.position.clone() : new THREE.Vector3(0, 0, 0);
            mesh.position.copy(anchor);

            scene.add(mesh);
            effects.set(e, mesh);
        }

        // The first non-celestial track is the natural default "what exploded".
        function defaultTrack() {
            const tracks = engine.getTracks() || [];
            const obj = tracks.find((tr) => !(tr.meta && tr.meta.kind === 'celestial'));
            return obj ? obj.id : null;
        }

        // Evaluate at mission time t (seconds). dt is mission-seconds since the
        // event: the sphere pops outward almost instantly, keeps swelling a
        // little, then fades to nothing. It sits fixed in world space throughout.
        function update(t, camera) {
            for (const [e, mesh] of effects) {
                const dt = t - e.t;
                const dur = (e.duration_s != null && e.duration_s > 0) ? e.duration_s : DEF_DURATION;
                if (dt < 0 || dt >= dur) { mesh.visible = false; continue; }

                mesh.visible = true;
                const baseR = (e.radius_m != null && e.radius_m > 0) ? e.radius_m : DEF_RADIUS;
                const u = dt / dur;

                // Sudden expansion: ease-out cubic over POP_FRAC of the life,
                // then a slow settle so the ball never looks frozen.
                const p = Math.min(1, u / POP_FRAC);
                const pop = 1 - Math.pow(1 - p, 3);
                const r = baseR * (pop + SETTLE_GROWTH * u);

                const camDist = camera.position.distanceTo(mesh.position);
                // Zoom-relative size. The floor grows the whole curve (so the pop
                // still starts from nothing) while far away; the ceiling then caps
                // how much of the screen the ball may cover up close.
                const floor = camDist * MIN_APPARENT_FRAC / baseR;
                const ceiling = camDist * MAX_APPARENT_FRAC;
                const scale = r * Math.max(1, floor);
                mesh.scale.setScalar(Math.min(scale, ceiling));

                // Opacity: starts partly see-through while it expands, reaches full
                // brightness once the pop settles, then fades out through the tail.
                const fadeIn = START_ALPHA + (1 - START_ALPHA) * Math.min(1, u / POP_FRAC);
                const fade = u <= FADE_START ? 1
                    : Math.max(0, 1 - (u - FADE_START) / (1 - FADE_START));
                mesh.material.opacity = FLASH_ALPHA * fadeIn * fade;
            }
        }

        // (Re)build from the active scenario's explosion events. Called on scenario
        // load and on demand.
        function rebuild() {
            dispose();
            const events = engine.getEvents ? engine.getEvents() : [];
            for (const e of events) {
                if (e.type === 'explosion') build(e);
            }
        }

        function dispose() {
            for (const [, mesh] of effects) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            effects.clear();
        }

        return { update, rebuild, dispose };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createExplosionSystem = createExplosionSystem;
})(window);
