// js/hud.js
// Tactical HUD panels for ROCI and ZMEYA: velocity, G-load, range,
// closure rate, aspect angle, plus the radar lock indicator.

const THREE = window.THREE;

const SHIP_IDS = ['roci', 'zmeya'];

function formatVelocity(v) { return (v / 1000).toFixed(2); }
function formatKm(m) { return (m / 1000).toFixed(2); }
function formatAngle(deg) { return deg.toFixed(1); }

function setVal(id, v) { document.getElementById(id).textContent = v; }

export function createHUD(playbackEngine, telemetry, lockState) {
    function updateShip(id, state, derived) {
        if (derived && state && state.active) {
            const vel = state.velocity.length();
            setVal(id + '-vel', formatVelocity(vel));
            setVal(id + '-g',   derived[id].gForce.toFixed(2));
            setVal(id + '-rng', formatKm(derived[id].range));
            setVal(id + '-clos', formatKm(derived[id].closureRate));
            setVal(id + '-asp', formatAngle(derived[id].aspectAngle));
        } else {
            [id + '-vel', id + '-g', id + '-rng', id + '-clos', id + '-asp']
                .forEach((el) => setVal(el, '---'));
        }
    }

    function updateLock() {
        const el = document.getElementById('roci-lock');
        if (!el) return;
        const locked = lockState.isLockedAt(playbackEngine.getTime());
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

    function update() {
        const t = playbackEngine.getTime();
        const derived = telemetry.getDerived(t);
        const stateMap = playbackEngine.getStateAtTime(t);
        SHIP_IDS.forEach((id) => updateShip(id, stateMap[id], derived));
        updateLock();
    }

    return { update };
}
