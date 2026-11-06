// js/hud.js
// Orbital telemetry readouts for the active track: altitude, ground speed,
// and ECI position. Derived inline from the state vector (no combat
// telemetry). Values displayed in km / km/s.
//
// Classic-script module: attaches Tacview.createHUD.

(function (global) {
    'use strict';
    const EARTH_RADIUS = global.Tacview.EARTH_RADIUS;

    function setVal(id, v) {
        const el = document.getElementById(id);
        if (el && el.textContent !== v) el.textContent = v;
    }

    function createHUD(engine) {
        function update() {
            const t = engine.getTime();
            const st = engine.getStateAtTime(t);
            const track = engine.getActiveTrack();

            setVal('trackName', (track && track.meta.OBJECT_NAME) || engine.getActiveTrackId() || '—');

            if (!st) {
                setVal('hud-alt', '—');
                setVal('hud-speed', '—');
                setVal('hud-pos', '—');
                return;
            }
            const radius = st.position.length();
            const altKm = (radius - EARTH_RADIUS) / 1000;
            const speedKmps = st.velocity.length() / 1000;
            setVal('hud-alt', altKm.toFixed(1));
            setVal('hud-speed', speedKmps.toFixed(3));
            setVal('hud-pos',
                `[${(st.position.x / 1000).toFixed(0)}, ${(st.position.y / 1000).toFixed(0)}, ${(st.position.z / 1000).toFixed(0)}]`);
        }

        return { update };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createHUD = createHUD;
})(window);
