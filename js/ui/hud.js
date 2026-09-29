// js/ui/hud.js
// Tactical HUD panels for ROCI and ZMEYA: velocity, G-load, range,
// closure rate, aspect angle, plus the radar lock indicator.

const THREE = window.THREE;
import { CONFIG } from '../utils/config.js';

const SHIP_IDS = ['roci', 'zmeya'];

function formatVelocity(v) { return (v / 1000).toFixed(CONFIG.hud.numericPrecision); }
function formatKm(m) { return (m / 1000).toFixed(CONFIG.hud.numericPrecision); }
function formatAngle(deg) { return deg.toFixed(CONFIG.hud.anglePrecision); }

function setVal(id, v) { document.getElementById(id).textContent = v; }

export function createHUD(playbackEngine, telemetry, lockState) {
    const VALUE_IDS = [
        'vel', 'g', 'rng', 'clos', 'asp', 'acc', 'burn', 'hdg', 'pitch', 'roll',
    ];

    function updateShip(id, state, derived) {
        if (derived && state && state.active) {
            const vel = state.velocity.length();
            setVal(id + '-vel', formatVelocity(vel));
            setVal(id + '-g',   derived[id].gForce.toFixed(CONFIG.hud.numericPrecision));
            setVal(id + '-rng', formatKm(derived[id].range));
            setVal(id + '-clos', formatKm(derived[id].closureRate));
            setVal(id + '-asp', formatAngle(derived[id].aspectAngle));
            // New Phase 6 fields (Q7):
            const acceleration = derived[id].acceleration;
            setVal(
                id + '-acc',
                Math.hypot(acceleration.x, acceleration.y, acceleration.z).toFixed(CONFIG.hud.numericPrecision)
            );
            setVal(id + '-burn', derived[id].burnDirection);
            // 3D angular debug overlay (issue #30). Heading (yaw) / pitch /
            // roll extracted from the integrated orientation in degrees; the
            // telemetry layer guarantees all three are present together.
            setVal(id + '-hdg',   formatAngle(derived[id].heading));
            setVal(id + '-pitch', formatAngle(derived[id].pitch));
            setVal(id + '-roll',  formatAngle(derived[id].roll));
        } else {
            [id + '-vel', id + '-g', id + '-rng', id + '-clos', id + '-asp',
             id + '-acc', id + '-burn',
             id + '-hdg', id + '-pitch', id + '-roll']
                .forEach((el) => setVal(el, '---'));
        }
    }

    function updateLock(t) {
        const el = document.getElementById('roci-lock');
        if (!el) return;
        const locked = lockState.isLockedAt(t);
        if (locked) {
            el.textContent = 'LOCK: ON';
            el.classList.add('on');
            el.classList.remove('off');
        } else {
            el.textContent = 'LOCK: OFF';
            el.classList.add('off');
            el.classList.remove('on');
        }
    }

    function update(t = playbackEngine.getTime()) {
        const derived = telemetry.getDerived(t);
        const stateMap = playbackEngine.getStateAtTime(t);
        SHIP_IDS.forEach((id) => updateShip(id, stateMap[id], derived));
        updateLock(t);
    }

    function reset() {
        SHIP_IDS.forEach((id) => VALUE_IDS.forEach((value) => setVal(id + '-' + value, '---')));
        updateLock(playbackEngine.getTime());
    }

    function destroy() {
        reset();
    }

    return { update, reset, destroy };
}
