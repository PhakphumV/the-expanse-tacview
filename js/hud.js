// js/hud.js
// Selectable target panel: lists every celestial body and space track, lets
// the user pick which the camera should orbit/follow, and shows per-target
// readouts (altitude/speed/position for tracks; radius/distance for bodies).
//
// Classic-script module: attaches Tacview.createHUD.

(function (global) {
    'use strict';
    const EARTH_RADIUS = global.Tacview.EARTH_RADIUS;

    const BODY_INFO = {
        earth: { label: 'Earth', tag: 'CELESTIAL BODY', radiusKm: 6371 },
        moon:  { label: 'Moon',  tag: 'CELESTIAL BODY', radiusKm: 1737, orbitKm: 384400 },
    };

    function km(n) { return n.toLocaleString('en-US'); }

    function createHUD(engine, targets, onSelect) {
        const listEl = document.getElementById('targetList');
        const infoEl = document.getElementById('targetInfo');
        const items = {};          // id -> button element
        let activeId = null;

        // Build one clickable row per target.
        function buildList(targets) {
            if (listEl) listEl.innerHTML = '';
            for (const k in items) delete items[k];
            for (const t of targets) {
                const btn = document.createElement('button');
                btn.className = 'target-item';
                btn.textContent = t.label;
                btn.addEventListener('click', () => setTarget(t.id));
                if (listEl) listEl.appendChild(btn);
                items[t.id] = btn;
            }
            refreshHighlight();
        }
        buildList(targets);

        function refreshHighlight() {
            for (const id in items) items[id].classList.toggle('active', id === activeId);
        }

        // Rebuild the list when the active scenario changes (new track targets).
        function setTargets(newTargets) {
            if (!items[activeId]) activeId = 'earth';
            buildList(newTargets);
            setTarget(activeId);
        }

        function setTarget(id) {
            if (!items[id]) return;
            activeId = id;
            refreshHighlight();
            if (typeof onSelect === 'function') onSelect(id);
            update();
        }

        function getTarget() { return activeId; }

        function isCelestial(id) {
            const tr = engine.getTrack(id);
            return !!(tr && tr.meta && tr.meta.kind === 'celestial');
        }

        // Body readouts come from the track metadata when the body is a
        // telemetry track (Moon), and from BODY_INFO for the static Earth.
        function bodyRows(id) {
            const tr = engine.getTrack(id);
            const me = (tr && tr.meta && tr.meta.mean_elements) || {};
            const info = BODY_INFO[id];
            const name = ((tr && tr.meta.OBJECT_NAME) || (info && info.label) || id).toUpperCase();
            const radiusKm = tr && tr.meta.radius_m ? tr.meta.radius_m / 1000 : (info && info.radiusKm);
            const orbitKm = me.SEMI_MAJOR_AXIS ? me.SEMI_MAJOR_AXIS / 1000 : (info && info.orbitKm);
            const rows = [['BODY', name]];
            if (orbitKm) rows.push(['ORBIT', km(Math.round(orbitKm)) + ' km']);
            if (radiusKm) rows.push(['RADIUS', km(Math.round(radiusKm)) + ' km']);
            return rows;
        }

        function rowsFor(t) {
            const time = engine.getTime();
            if (BODY_INFO[t] || isCelestial(t)) return bodyRows(t);
            const st = engine.getStateAtTimeFor(t, time);
            if (!st) return [['ALT', '—'], ['SPD', '—'], ['POS', '—']];
            const radius = st.position.length();
            const altKm = (radius - EARTH_RADIUS) / 1000;
            const moonState = engine.getStateAtTimeFor('moon', time);
            const moonInfo = engine.getTrack('moon') ? engine.getTrack('moon').meta : null;
            // Inside the Moon's sphere of influence the Earth-frame speed is mostly
            // the Moon's own motion (~1 km/s), so report the lunar-relative speed: a
            // landed LM reads 0.000, not 1.000.
            let speedVec = st.velocity;
            let lunarFrame = false;
            if (moonState && moonInfo && moonInfo.radius_m
                && st.position.distanceTo(moonState.position) < 6.6e7) {
                speedVec = st.velocity.clone().sub(moonState.velocity);
                lunarFrame = true;
            }
            const speedKmps = speedVec.length() / 1000;
            const dvUsed = engine.getDeltaVUsed(t, time);
            const rows = [
                ['ALT', altKm.toFixed(1) + ' km'],
                ['SPD', speedKmps.toFixed(3) + ' km/s' + (lunarFrame ? ' lunar' : '')],
                ['POS', `[${(st.position.x / 1000).toFixed(0)}, ${(st.position.y / 1000).toFixed(0)}, ${(st.position.z / 1000).toFixed(0)}]`],
                ['\u0394V', dvUsed >= 1000 ? (dvUsed / 1000).toFixed(2) + ' km/s' : dvUsed.toFixed(0) + ' m/s'],
            ];
            // Cislunar tracks: Earth altitude is not the interesting number, so
            // report the Moon as well (ADR-0004 follow-up).
            if (moonState && moonInfo && moonInfo.radius_m) {
                const dist = st.position.distanceTo(moonState.position);
                const moonAlt = (dist - moonInfo.radius_m) / 1000;
                if (dist < 2e8) {
                    // A landed vehicle should read as on the surface, not "BELOW 0 km":
                    // round-off can put the altitude a few metres under the radius.
                    const label = Math.abs(moonAlt) < 0.05
                        ? 'ON SURFACE'
                        : (moonAlt > 0 ? 'ALT ' : 'BELOW ') + Math.abs(moonAlt).toFixed(0) + ' km';
                    rows.push(['MOON', label]);
                }
            }
            return rows;
        }

        function labelFor(id) {
            const t = engine.getTrack(id);
            return t ? t.meta.OBJECT_NAME || t.id : (BODY_INFO[id] ? BODY_INFO[id].label : id);
        }
        function tagFor(id) {
            if (BODY_INFO[id] || isCelestial(id)) return 'CELESTIAL BODY';
            const t = engine.getTrack(id);
            return t ? 'SPACE OBJECT' : id;
        }

        function update() {
            if (!infoEl) return;
            const id = activeId || 'earth';
            const tag = tagFor(id);
            const rows = rowsFor(id);
            infoEl.innerHTML =
                '<div class="hud-title">' + labelFor(id) + ' <span class="tag">' + tag + '</span></div>' +
                rows.map(([k, v]) => '<div class="row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>').join('');
        }

        return { setTarget, setTargets, getTarget, update };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createHUD = createHUD;
    global.Tacview.BODY_INFO = BODY_INFO;
})(window);
