// js/mission-state.js
// Derives a coarse mission/replay state from the event timeline and the
// current playback time. Used to drive the "STANDBY / ENGAGEMENT /
// RESOLUTION" indicator in the HUD.
//
// States:
//   STANDBY     — before the first event of the engagement
//   ENGAGEMENT  — between first and last combat-relevant events
//   RESOLUTION  — after the last combat event has been observed
//
// The transition from STANDBY → ENGAGEMENT happens at the first event.
// The transition from ENGAGEMENT → RESOLUTION happens at the last
// `intercept` or `hit` event (combat outcome). If the dataset has no
// such events, the mission never leaves ENGAGEMENT.

export function createMissionState(playbackEngine) {
    let firstEventT = Infinity;
    let lastCombatT = -Infinity;

    function build() {
        const events = playbackEngine.getEvents();
        firstEventT = Infinity;
        lastCombatT = -Infinity;
        for (const ev of events) {
            if (ev.t < firstEventT) firstEventT = ev.t;
            if (ev.type === 'intercept' || ev.type === 'hit') {
                if (ev.t > lastCombatT) lastCombatT = ev.t;
            }
        }
    }

    function getState() {
        const t = playbackEngine.getTime();
        if (!isFinite(firstEventT)) return 'STANDBY';
        if (t < firstEventT) return 'STANDBY';
        if (lastCombatT > -Infinity && t > lastCombatT) return 'RESOLUTION';
        return 'ENGAGEMENT';
    }

    function getBoundaries() {
        return {
            firstEventT: isFinite(firstEventT) ? firstEventT : null,
            lastCombatT: lastCombatT > -Infinity ? lastCombatT : null,
        };
    }

    return { build, getState, getBoundaries };
}
