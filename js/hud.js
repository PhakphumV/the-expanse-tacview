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

        function rowsFor(t) {
            const time = engine.getTime();
            if (BODY_INFO[t]) {
                const b = BODY_INFO[t];
                if (t === 'earth') return [['BODY', 'EARTH'], ['RADIUS', km(b.radiusKm) + ' km']];
                return [['BODY', 'MOON'], ['ORBIT', km(b.orbitKm) + ' km'], ['RADIUS', km(b.radiusKm) + ' km']];
            }
            const st = engine.getStateAtTimeFor(t, time);
            if (!st) return [['ALT', '—'], ['SPD', '—'], ['POS', '—']];
            const radius = st.position.length();
            const altKm = (radius - EARTH_RADIUS) / 1000;
            const speedKmps = st.velocity.length() / 1000;
            return [
                ['ALT', altKm.toFixed(1) + ' km'],
                ['SPD', speedKmps.toFixed(3) + ' km/s'],
                ['POS', `[${(st.position.x / 1000).toFixed(0)}, ${(st.position.y / 1000).toFixed(0)}, ${(st.position.z / 1000).toFixed(0)}]`],
            ];
        }

        function labelFor(id) {
            const t = engine.getTrack(id);
            return t ? t.meta.OBJECT_NAME || t.id : (BODY_INFO[id] ? BODY_INFO[id].label : id);
        }
        function tagFor(id) {
            if (BODY_INFO[id]) return BODY_INFO[id].tag;
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
