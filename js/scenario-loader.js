// js/scenario-loader.js
// Loads one scenario payload at a time from js/scenario-<id>.js and releases the
// previous one, so the viewer never holds every scenario's ephemeris in memory.
// Classic <script> injection keeps this working from a file:// origin (no fetch).
//
// Classic-script module: attaches Tacview.createScenarioLoader.

(function (global) {
    'use strict';

    function createScenarioLoader(basePath) {
        const base = basePath || 'js/';
        const pending = {};   // id -> [callback]

        function registry() {
            return (global.TacviewScenarios = global.TacviewScenarios || {});
        }
        function list() {
            return (global.TacviewManifest && global.TacviewManifest.scenarios) || [];
        }
        function entry(id) {
            return list().find((s) => s.id === id) || null;
        }
        function isLoaded(id) {
            return !!registry()[id];
        }

        function inject(id, done) {
            const el = document.createElement('script');
            el.async = false;
            el.src = base + 'scenario-' + id + '.js';
            // The payload registers itself on window; drop the element afterwards
            // so the script source is not kept alive on top of the parsed data.
            el.onload = function () {
                const scenario = registry()[id];
                el.remove();
                done(null, scenario);
            };
            el.onerror = function () {
                el.remove();
                done(new Error('failed to load scenario "' + id + '"'));
            };
            document.head.appendChild(el);
        }

        // load(id, cb) — cb(err, scenarioObject). Coalesces concurrent requests
        // for the same id into one script tag.
        function load(id, cb) {
            if (isLoaded(id)) return cb(null, registry()[id]);
            if (pending[id]) { pending[id].push(cb); return; }
            pending[id] = [cb];
            inject(id, function (err, scenario) {
                const waiting = pending[id] || [];
                delete pending[id];
                if (!err && !scenario) err = new Error('scenario "' + id + '" loaded but registered nothing');
                waiting.forEach((fn) => fn(err, scenario));
            });
        }

        // Release a payload so only the active scenario stays resident. The
        // browser keeps the file in its HTTP cache, so switching back is cheap.
        function unload(id) {
            const reg = registry();
            if (reg[id]) delete reg[id];
        }

        return { list, entry, isLoaded, load, unload };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createScenarioLoader = createScenarioLoader;
})(window);
