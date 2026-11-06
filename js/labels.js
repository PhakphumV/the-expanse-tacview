// js/labels.js
// Billboarded 2D HTML labels — one per track, tracking its object on screen.
//
// Classic-script module: attaches Tacview.createLabels.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function createLabels(engine, camera) {
        const container = document.getElementById('labelsContainer');
        const labels = {};   // trackId -> element

        function ensureLabel(id) {
            if (labels[id]) return labels[id];
            const el = document.createElement('div');
            el.className = 'entity-label';
            el.style.display = 'none';
            if (container) container.appendChild(el);
            labels[id] = el;
            return el;
        }

        function update() {
            const t = engine.getTime();
            const tracks = engine.getTracks();
            if (!container) return;
            for (const tr of tracks) {
                const st = engine.getStateAtTimeFor(tr.id, t);
                const label = ensureLabel(tr.id);
                if (!st) { label.style.display = 'none'; continue; }
                label.textContent = tr.meta.OBJECT_NAME || tr.id;
                const pos = st.position.clone().project(camera);
                if (pos.z > 1) { label.style.display = 'none'; continue; }
                const w = window.innerWidth / 2, h = window.innerHeight / 2;
                label.style.left = (pos.x * w + w) + 'px';
                label.style.top = (-(pos.y * h) + h) + 'px';
                label.style.display = 'block';
            }
        }

        return { update };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createLabels = createLabels;
})(window);
