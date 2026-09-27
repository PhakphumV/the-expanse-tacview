// js/mission-state.js
// Derives a coarse mission/replay state from the event timeline and the
// current playback time. Used to drive the six-phase HUD indicator.
//
// Phase labels (per ADR-0003):
//   STANDBY    — before the first event of the engagement
//   PURSUIT    — closing / maneuvering / no weapons released
//   LAUNCH     — weapons released, target locks active
//   INTERCEPT  — weapons intercepting (torpedoes, missiles)
//   ROLL       — defensive roll and PDC activity
//   ATTRITION  — decisive shots, defensive exhaustion, the kill
//   RESOLUTION — after the last combat-outcome event
//
// STANDBY and RESOLUTION are the boundary phases, derived from playback
// time relative to the first event and the last combat-outcome event.
// The four middle phases are derived from the most recent event's type
// during the engagement window. Sub-phases flicker during complex
// multi-event moments (e.g. a roll-vulnerable moment when both
// pdc_engagement and missile_intercept are interleaved), which is
// informative for a tactical operator.

// Event types that count as combat outcomes for the RESOLUTION boundary.
const TERMINAL_TYPES = new Set([
    'intercept',
    'hit',
    'torpedo_intercept',
    'missile_intercept',
    'railgun_fire',
    'zmeya_drive_disabled',
    'engagement_resolution',
]);

// Event-type → sub-phase map. Events not present here do not change the
// sub-phase (the previous phase persists until an event with a defined
// mapping arrives). This handles events like `unlock` cleanly.
const SUB_PHASE_BY_TYPE = {
    pursuit_start: 'PURSUIT',
    intercept_course: 'PURSUIT',
    high_g_burn: 'PURSUIT',
    lock: 'LAUNCH',
    missile_lock: 'LAUNCH',
    roci_torpedo_launch: 'LAUNCH',
    zmeya_barrage_launch: 'LAUNCH',
    torpedo_intercept: 'INTERCEPT',
    missile_intercept: 'INTERCEPT',
    intercept: 'INTERCEPT',
    defensive_roll_start: 'ROLL',
    pdc_auto_track: 'ROLL',
    pdc_coverage_shift: 'ROLL',
    pdc_engagement: 'ROLL',
    pdc_jammed: 'ROLL',
    railgun_fire: 'ATTRITION',
    all_missiles_destroyed: 'ATTRITION',
    zmeya_drive_disabled: 'ATTRITION',
};

export const MISSION_PHASES = [
    'STANDBY',
    'PURSUIT',
    'LAUNCH',
    'INTERCEPT',
    'ROLL',
    'ATTRITION',
    'RESOLUTION',
];

export function createMissionState(playbackEngine) {
    let firstEventT = Infinity;
    let lastCombatT = -Infinity;
    let phaseTimeline = []; // sorted [{ t, phase }]

    function build() {
        const events = playbackEngine.getEvents();
        firstEventT = Infinity;
        lastCombatT = -Infinity;
        phaseTimeline = [];
        let currentSubPhase = 'PURSUIT';
        const sorted = events.slice().sort((a, b) => a.t - b.t);
        for (const ev of sorted) {
            if (ev.t < firstEventT) firstEventT = ev.t;
            if (TERMINAL_TYPES.has(ev.type) && ev.t > lastCombatT) {
                lastCombatT = ev.t;
            }
            const next = SUB_PHASE_BY_TYPE[ev.type];
            if (next && next !== currentSubPhase) {
                phaseTimeline.push({ t: ev.t, phase: next });
                currentSubPhase = next;
            }
        }
    }

    function getState() {
        const t = playbackEngine.getTime();
        if (!isFinite(firstEventT)) return 'STANDBY';
        if (t < firstEventT) return 'STANDBY';
        if (lastCombatT > -Infinity && t > lastCombatT) return 'RESOLUTION';
        // Within ENGAGEMENT window: walk the phaseTimeline to find the
        // most recent transition at-or-before t. Falls back to PURSUIT.
        let phase = 'PURSUIT';
        for (const entry of phaseTimeline) {
            if (entry.t <= t) phase = entry.phase;
            else break;
        }
        return phase;
    }

    function getBoundaries() {
        return {
            firstEventT: isFinite(firstEventT) ? firstEventT : null,
            lastCombatT: lastCombatT > -Infinity ? lastCombatT : null,
        };
    }

    function getPhaseTimeline() {
        return phaseTimeline.slice();
    }

    return { build, getState, getBoundaries, getPhaseTimeline };
}
