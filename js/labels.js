// js/labels.js
// Billboarded 2D HTML label that tracks the active object on screen.
//
// Classic-script module: attaches Tacview.createLabels.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function createLabels(engine, camera) {
        const container = document.getElementById('labelsContainer');
        let el = null;

        function ensureEl() {
            if (el) return el;
            el = document.createElement('div');
            el.className = 'entity-label';
            el.style.display = 'none';
            if (container) container.appendChild(el);
            return el;
        }

        function update() {
            const t = engine.getTime();
            const st = engine.getStateAtTime(t);
            const label = ensureEl();
            if (!st || !container) { if (label) label.style.display = 'none'; return; }
            const track = engine.getActiveTrack();
            label.textContent = (track && track.meta.OBJECT_NAME) || engine.getActiveTrackId() || '';
            const pos = st.position.clone().project(camera);
            if (pos.z > 1) { label.style.display = 'none'; return; }
            const w = window.innerWidth / 2, h = window.innerHeight / 2;
            label.style.left = (pos.x * w + w) + 'px';
            label.style.top = (-(pos.y * h) + h) + 'px';
            label.style.display = 'block';
        }

        return { update };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createLabels = createLabels;
})(window);
