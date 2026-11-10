// js/spacecraft-model.js
// Low-poly procedural spacecraft bodies, one per real vehicle, chosen by the
// track id so each mission reads as the thing it actually is. The viewer has no
// lights (every material is MeshBasic), so shapes are conveyed by silhouette
// and flat colour alone.
//
//   ISS      — long acquisition truss with four big solar arrays, radiators and
//              a string of habitat modules along the flight axis.
//   TIANGONG — a T-shaped station: the long Tianhe core with two radial lab
//              modules near the front and solar arrays on the core and labs.
//   COLUMBIA / ODYSSEY — Apollo CSM: service module, command-module cone, SPS
//              bell, and the LM docked to the cone's apex.
//   SERVICE MODULE — the bare Apollo service module cylinder with its SPS bell
//              and four flush solar panels.
//   EAGLE / AQUARIUS — the Apollo LM: octagonal descent stage on four legs and
//              the ascent stage on top.
//   (default) — the original synthetic hull used when a track is not one of
//              the known vehicles.
//   ORION    — the Artemis I crew module + European Service Module with four
//              solar-array wings and an OMS bell.
//
// Every model keeps the body convention of the rest of the viewer: forward =
// -Z, up = +Y. The group reports its true bounding length in userData.extent so
// the entity's apparent-size floor (entities.js MODEL_EXTENT) tracks each
// vehicle's real size.
//
// Classic-script module: attaches Tacview.createSpacecraftModel.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function mesh(geom, color) {
        return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color }));
    }

    // Cylinder with its axis along +Z (Three's default is +Y).
    function cylZ(rTop, rBot, len, color, segs) {
        const m = mesh(new THREE.CylinderGeometry(rTop, rBot, len, segs || 10), color);
        m.rotation.x = Math.PI / 2;
        return m;
    }

    // Cone with its apex pointing forward (-Z).
    function coneZ(radius, len, color, segs) {
        const m = mesh(new THREE.ConeGeometry(radius, len, segs || 10), color);
        m.rotation.x = -Math.PI / 2;
        return m;
    }

    // ------- ISS -----------------------------------------------------------
    // Truss across X, four large solar arrays, radiators, and a run of habitat
    // modules along Z (the flight axis). True truss span ~84 m.
    function buildISS() {
        const g = new THREE.Group();
        const truss = 0x9aa0a8;     // light structural gray
        const panel = 0x1e4fb4;     // solar array blue
        const mod = 0xe6e8ee;       // module white
        const gold = 0xc9a35a;      // radiator gold
        const accent = 0xffb454;    // project orange accent

        // Acquisition truss, elevated above the modules.
        const trussMesh = mesh(new THREE.BoxGeometry(84, 1.6, 1.6), truss);
        trussMesh.position.y = 4.2;
        g.add(trussMesh);

        // Four solar arrays: two per side, racked above and below the truss,
        // presenting big blue faces fore and aft.
        function array(x, y) {
            const a = mesh(new THREE.BoxGeometry(0.6, 11, 32), panel);
            a.position.set(x, y, 0);
            g.add(a);
        }
        array(-32, 9.2); array(-32, -0.8);
        array(32, 9.2);  array(32, -0.8);

        // Radiator panels inboard, smaller and gold.
        function radiator(x) {
            const r = mesh(new THREE.BoxGeometry(0.4, 6, 20), gold);
            r.position.set(x, 7.2, 0);
            g.add(r);
        }
        radiator(-13); radiator(13);

        // Russian segment (Zvezda + Zarya) toward the back, US segment forward.
        const zvezda = cylZ(2.0, 2.0, 10, mod); zvezda.position.z = 7; g.add(zvezda);
        const zarya = cylZ(2.2, 2.2, 12, mod);  zarya.position.z = -2; g.add(zarya);
        const node = cylZ(1.6, 1.6, 6, accent);  node.position.z = -10; g.add(node);
        const us = cylZ(2.5, 2.5, 16, mod);     us.position.z = -20; g.add(us);

        // A solar panel on the port starboard node for character.
        g.userData.extent = 88;
        return g;
    }

    // ------- Tiangong / CSS -----------------------------------------------
    // T-shaped: long Tianhe core along Z, two radial labs along X near the
    // forward end, solar arrays on the core and on each lab's outer end.
    function buildTSS() {
        const g = new THREE.Group();
        const mod = 0xe6e8ee;
        const panel = 0x1e4fb4;

        // Tianhe core module.
        const core = cylZ(2.2, 2.2, 18, mod);
        g.add(core);

        // Two radial lab modules near the forward end, along X.
        function lab(x) {
            const l = cylZ(1.8, 1.8, 9, mod);
            l.rotation.x = 0;
            l.rotation.z = Math.PI / 2;   // axis along X
            l.position.set(x, 0, -6);
            g.add(l);
            // Solar array on the lab's outer end, facing fore/aft.
            const arr = mesh(new THREE.BoxGeometry(0.4, 7, 13), panel);
            arr.position.set(x + (x > 0 ? 6 : -6), 0.5, -6);
            g.add(arr);
        }
        lab(6); lab(-6);

        // Core solar arrays on both sides, in the fore/aft plane.
        function coreArray(x) {
            const a = mesh(new THREE.BoxGeometry(0.4, 7, 15), panel);
            a.position.set(x, 0.5, 0);
            g.add(a);
        }
        coreArray(7.5); coreArray(-7.5);

        g.userData.extent = 32;
        return g;
    }

    // ------- Apollo CSM + LM ----------------------------------------------
    // Service module behind, command-module cone forward, SPS bell at the rear,
    // LM docked to the cone's apex.
    function buildCSM(withLM) {
        const g = new THREE.Group();
        const smCol = 0xc7ccd6;    // service module silver
        const cmCol = 0xf0f2f4;    // command module white
        const band = 0x23252b;     // dark heat-shield / window band
        const nozzle = 0x3a3d46;
        const lmGold = 0xd3b25a;

        // Service module cylinder.
        const sm = cylZ(2.0, 2.0, 7, smCol);
        sm.position.z = 5.5;
        g.add(sm);

        // Flush solar panels flat on the SM hull.
        function smPanel(ang) {
            const p = mesh(new THREE.BoxGeometry(1.8, 0.25, 4.4), 0x1e4fb4);
            p.position.set(Math.cos(ang) * 1.95, Math.sin(ang) * 1.95, 5.5);
            p.rotation.z = ang;
            g.add(p);
        }
        smPanel(0); smPanel(Math.PI);

        // SPS engine bell at the rear.
        const bell = cylZ(1.4, 1.0, 1.7, nozzle);
        bell.position.z = 9.3;
        g.add(bell);

        // Command-module cone, apex forward, with a dark band at the base.
        const cm = coneZ(2.0, 3.0, cmCol, 12);
        cm.position.z = -1.5;
        g.add(cm);
        const bandMesh = mesh(new THREE.BoxGeometry(3.4, 3.4, 0.8), band);
        bandMesh.position.z = -0.2;
        g.add(bandMesh);

        if (withLM) {
            // LM docked to the cone's apex (forward).
            const desc = mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), lmGold);
            desc.position.set(0, 0.1, -4.4);
            g.add(desc);
            const asc = mesh(new THREE.BoxGeometry(1.0, 1.1, 1.0), 0xc7ccd6);
            asc.position.set(0, 1.15, -5.1);
            g.add(asc);
        }

        g.userData.extent = 15;
        return g;
    }

    // ------- Apollo Service Module alone ----------------------------------
    function buildSM() {
        const g = new THREE.Group();
        const sm = cylZ(2.0, 2.0, 7.5, 0xc7ccd6);
        g.add(sm);
        const bell = cylZ(1.4, 1.0, 1.7, 0x3a3d46);
        bell.position.z = 4.6;
        g.add(bell);
        // Four flush solar panels.
        for (let i = 0; i < 4; i++) {
            const ang = i * (Math.PI / 2);
            const p = mesh(new THREE.BoxGeometry(1.8, 0.25, 4.4), 0x1e4fb4);
            p.position.set(Math.cos(ang) * 1.95, Math.sin(ang) * 1.95, 0);
            p.rotation.z = ang;
            g.add(p);
        }
        // A darker patch on one face suggesting the exposed panels post-accident.
        const patch = mesh(new THREE.BoxGeometry(1.6, 3.0, 0.2), 0x23252b);
        patch.position.set(1.95, 0, 0.5);
        g.add(patch);
        g.userData.extent = 10;
        return g;
    }

    // ------- Apollo LM -----------------------------------------------------
    // Descent stage box on four outward-canted legs, ascent stage on top.
    function buildLM() {
        const g = new THREE.Group();
        const gold = 0xd3b25a;
        const silver = 0xc7ccd6;
        const dark = 0x3a3d46;

        // Descent stage.
        const desc = mesh(new THREE.BoxGeometry(4.3, 2.0, 4.3), gold);
        desc.position.y = 1.0;
        g.add(desc);

        // Ascent stage on top.
        const asc = mesh(new THREE.BoxGeometry(3.2, 2.4, 3.2), silver);
        asc.position.y = 3.2;
        g.add(asc);
        // Forward window band.
        const win = mesh(new THREE.BoxGeometry(0.2, 0.9, 2.4), 0x23252b);
        win.position.set(0, 3.2, -1.65);
        g.add(win);

        // Four outward-canted legs with gold footpads.
        function leg(x, z) {
            const l = cylZ(0.14, 0.14, 2.6, dark, 6);
            l.rotation.x = Math.PI / 2 + (z > 0 ? 0.5 : -0.5);
            l.rotation.z = x > 0 ? -0.35 : 0.35;
            l.position.set(x * 2.2, -0.6, z * 2.2);
            g.add(l);
            const pad = cylZ(0.5, 0.6, 0.35, gold, 8);
            pad.position.set(x * 2.6, -1.7, z * 2.6);
            g.add(pad);
        }
        leg(1, 1); leg(1, -1); leg(-1, 1); leg(-1, -1);

        g.userData.extent = 9;
        return g;
    }

    // ------- Original generic hull (fallback) -------------------------------
    function buildGeneric() {
        const g = new THREE.Group();
        const bodyColor = 0x9db2d0;
        const accent = 0xffb454;

        g.add(mesh(new THREE.BoxGeometry(5, 4, 26), bodyColor));
        const nose = mesh(new THREE.ConeGeometry(2.2, 6, 4), accent);
        nose.rotation.x = Math.PI / 2;
        nose.position.z = -16;
        g.add(nose);

        function wing(side) {
            const w = mesh(new THREE.BoxGeometry(2, 0.4, 22), 0x22427a);
            w.position.set(side * 10, 0, 0);
            g.add(w);
        }
        wing(1); wing(-1);

        g.userData.extent = 26;
        return g;
    }

    // ------- Orion CM + European Service Module ----------------------------
    // Crew-module cone forward of a service-module drum, four solar-array wings
    // forming an X around the drum, OMS bell at the rear. Forward = -Z.
    function buildOrion() {
        const g = new THREE.Group();
        const cmCol = 0xf0f2f4;    // crew module white
        const esm = 0xc7ccd6;      // service module silver
        const panel = 0x1e4fb4;    // solar array blue
        const dark = 0x23252b;     // heat shield / cover

        // Crew module cone, apex forward.
        const cm = coneZ(2.0, 3.4, cmCol, 12);
        cm.position.z = -1.7;
        g.add(cm);
        // Heat-shield band at the CM/ESM join.
        const band = mesh(new THREE.BoxGeometry(3.6, 3.6, 0.7), dark);
        band.position.z = -0.1;
        g.add(band);
        // European Service Module drum behind the CM.
        const sm = cylZ(1.95, 1.95, 4.6, esm);
        sm.position.z = 2.7;
        g.add(sm);
        // OMS engine bell at the rear.
        const bell = cylZ(1.1, 0.8, 1.2, 0x3a3d46);
        bell.position.z = 5.2;
        g.add(bell);
        // Four solar-array wings around the SM drum.
        function wing(ang) {
            const w = mesh(new THREE.BoxGeometry(1.4, 7.0, 0.3), panel);
            w.position.set(Math.cos(ang) * 2.6, Math.sin(ang) * 2.6, 2.4);
            w.rotation.z = ang - Math.PI / 2;
            g.add(w);
        }
        wing(0); wing(Math.PI / 2); wing(Math.PI); wing(-Math.PI / 2);

        g.userData.extent = 9;
        return g;
    }

    function createSpacecraftModel(trackId) {
        const id = String(trackId || '').toUpperCase().replace(/\s+/g, ' ');
        switch (id) {
            case 'ISS': return buildISS();
            case 'TIANGONG': return buildTSS();
            case 'COLUMBIA':
            case 'ODYSSEY': return buildCSM(true);
            case 'SERVICE MODULE': return buildSM();
            case 'EAGLE':
            case 'AQUARIUS': return buildLM();
            case 'ORION': return buildOrion();
            default: return buildGeneric();
        }
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createSpacecraftModel = createSpacecraftModel;
})(window);
