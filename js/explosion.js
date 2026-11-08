// js/explosion.js
// Core visual for "explosion" events: a scenario author drops an event with
// `type: "explosion"` (and `track` naming which tracked object exploded, so the
// effect can be anchored to a world position) and the renderer draws a fireball
// there. Any scenario can carry one; a scenario with none simply shows nothing.
//
// The effect has two lives that run in *mission time* (not wall-clock), driven by
// the engine clock:
//   - a bright, expanding fireball for the seconds right after detonation
//     (author-controllable via event.radius_m and event.duration_s);
//   - a persistent, dimmer ember/glow pinned at the event position forever after
//     (so the site of the accident is still findable when you scrub back).
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
    const DEF_DURATION = 60;        // mission-seconds the fireball is bright
    const DEF_RADIUS = 25000;       // metres — seen against a lunar-distance view
    const DEF_GROWTH = 0.8;         // radius grows by this fraction over the fireball life
    const FLASH_ALPHA = 0.95;
    const EMBER_ALPHA = 0.35;
    const EMBER_OFF_AFTER = 1800;   // mission-seconds after which the ember fades to a pin
    // Sprite stays a readable size on screen from any range (like the craft/body
    // MIN_APPARENT_RAD rule): radius scaled by camera distance once far away.
    const MIN_APPARENT_FRAC = 0.06; // fireball ≈ 6 % of a 780 px viewport at 60° fov
    const EMBER_FRAC = 0.03;

    // Fireball tint: bright white-orange core bleeding to a blue-gold edge.
    const CORE_COLOR = 0xfff2cc;
    const MID_COLOR = 0xffa03a;
    const EDGE_COLOR = 0x3377ff;
    const EMBER_COLOR = 0xff7a2a;

    // A soft radial gradient sprite (canvas-generated, no asset file).
    // `hexColor` returns 'rgba(r,g,b,' — the caller appends the alpha then ')'.
    function makeGlowTexture(stops) {
        const size = 128;
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const s of stops) g.addColorStop(s[0], s[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(cv);
        tex.needsUpdate = true;
        return tex;
    }

    function hexColor(c) {
        const col = new THREE.Color(c);
        return 'rgba(' + Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ','
            + Math.round(col.b * 255) + ',';
    }

    function createExplosionSystem(scene, engine) {
        // One render object per explosion event, keyed by event.
        const effects = new Map();

        // A per-frame reusable canvas texture is created lazily so a scenario
        // without explosions never pays for one.
        let glowTex = null;
        function glow() {
            if (!glowTex) {
                // White -> edge-of-core -> transparent halo. Rendered as a sprite
                // whose colour is tinted per-instance via sprite.material.color.
                glowTex = makeGlowTexture([
                    [0.0, 'rgba(255,255,255,1)'],
                    [0.25, hexColor(MID_COLOR) + '0.95)'],
                    [0.6, hexColor(EDGE_COLOR) + '0.35)'],
                    [1.0, hexColor(EDGE_COLOR) + '0)'],
                ]);
            }
            return glowTex;
        }

        function makeSprite(color, alpha, frac) {
            const mat = new THREE.SpriteMaterial({
                map: glow(), color: color || 0xffffff,
                transparent: true,
                opacity: alpha,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const sp = new THREE.Sprite(mat);
            sp.userData.frac = frac;
            return sp;
        }

        function build(e) {
            const group = new THREE.Group();

            // Fireball: nested sprites so it reads as a hot core inside a halo.
            // The glow texture already carries the white→blue-gold tint, so the
            // sprites multiply by white and differ only in scale.
            const core = makeSprite(0xffffff, FLASH_ALPHA, 0.5);
            const mid = makeSprite(0xffffff, FLASH_ALPHA * 0.85, 1.0);
            const edge = makeSprite(0xffffff, FLASH_ALPHA * 0.5, 1.7);
            group.add(core, mid, edge);
            group.userData.sprites = { core, mid, edge };

            // Persistent ember: a dim, warm sprite pinned at the site.
            const ember = makeSprite(0xffbb66, EMBER_ALPHA, 1.0);
            group.add(ember);
            group.userData.ember = ember;

            // Anchor to the host track's position at the explosion epoch. If no
            // host track is named (or it has no state then), fall back to Earth.
            const trackId = (e.track != null && String(e.track)) || defaultTrack();
            const st = trackId ? engine.getStateAtTimeFor(trackId, e.t) : null;
            const anchor = st ? st.position.clone() : new THREE.Vector3(0, 0, 0);
            group.position.copy(anchor);

            scene.add(group);
            effects.set(e, group);
        }

        // The first non-celestial track is the natural default "what exploded".
        function defaultTrack() {
            const tracks = engine.getTracks() || [];
            const obj = tracks.find((tr) => !(tr.meta && tr.meta.kind === 'celestial'));
            return obj ? obj.id : null;
        }

        // Evaluate at mission time t (seconds). dt is mission-seconds since the
        // event; the fireball lives for duration, the ember fades to a pin after
        // emberOff, and both sit fixed in world space thereafter.
        function update(t, camera) {
            for (const [e, group] of effects) {
                const dt = t - e.t;
                const dur = (e.duration_s != null && e.duration_s > 0) ? e.duration_s : DEF_DURATION;
                const baseR = (e.radius_m != null && e.radius_m > 0) ? e.radius_m : DEF_RADIUS;
                const growth = e.growth != null ? e.growth : DEF_GROWTH;

                const visible = dt >= 0;
                group.visible = visible;
                if (!visible) continue;

                const camDist = camera.position.distanceTo(group.position);
                // Apparent-size scaling: on screen, radius ≈ frac of the viewport.
                const u = dt / dur;
                const flashScale = baseR * (1 + growth * Math.min(1, u))
                    * Math.max(1, camDist * MIN_APPARENT_FRAC / baseR);

                // Fireball alpha: fade out through the last 40 % of its life.
                let fa = FLASH_ALPHA;
                if (u >= 0.6) fa = FLASH_ALPHA * Math.max(0, 1 - (u - 0.6) / 0.4);
                for (const [name, sp] of Object.entries(group.userData.sprites)) {
                    const mult = name === 'core' ? 0.5 : (name === 'mid' ? 1.0 : 1.7);
                    sp.scale.setScalar(flashScale * sp.userData.frac);
                    sp.material.opacity = fa * (name === 'core' ? 1 : (name === 'mid' ? 0.85 : 0.5)) * (dt < dur ? 1 : 0);
                }

                // Ember: dim persistent glow after the flash. It keeps a
                // camera-adaptive size, and eases down from full to a small floor
                // that stays visible for the rest of the mission, so the
                // accident's site is still findable when you scrub back hours
                // later.
                const embR = baseR * 0.5 * Math.max(1, camDist * EMBER_FRAC / (baseR * 0.5));
                group.userData.ember.scale.setScalar(embR);
                const eProg = dt >= dur ? Math.min(1, (dt - dur) / EMBER_OFF_AFTER) : 0;
                const emberFloor = 0.12;
                const emberOp = EMBER_ALPHA * (1 - eProg * (1 - emberFloor / EMBER_ALPHA));
                group.userData.ember.material.opacity = emberOp;
            }
        }

        // (Re)build from the active scenario's explosion events. Called on scenario
        // load and on demand.
        function rebuild() {
            for (const [, g] of effects) {
                scene.remove(g);
                g.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
            }
            effects.clear();
            const events = engine.getEvents ? engine.getEvents() : [];
            for (const e of events) {
                if (e.type === 'explosion') build(e);
            }
        }

        function dispose() {
            for (const [, g] of effects) {
                scene.remove(g);
                g.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
            }
            effects.clear();
        }

        return { update, rebuild, dispose };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createExplosionSystem = createExplosionSystem;
})(window);
