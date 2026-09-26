// js/event-model.js
// Single source of truth for tactical events. Provides normalization,
// display formatting, and query helpers so timeline markers, event log,
// lock indicators, effects, and mission state all consume the same
// structured event data.
//
// Event schema (required fields):
//   t           number  seconds (event timestamp)
//   type        string  one of the documented event types
// Optional fields:
//   actor       string  entity id that performed the action
//   target      string  entity id that was acted upon (may be null)
//   result      string  outcome for combat events: "hit", "intercept",
//                       "miss", or null
//   weapon      string  mount id for PDC events (e.g. "pdc_02")
//   end         number  end timestamp for windowed events
//                       (pdc_engagement tracer windows)
//   description string  human-readable summary
//
// See SCHEMA.md for the full event-type catalogue and field rules.

const VALID_TYPES = new Set([
    'launch',
    'pdc_engage',
    'maneuver_start',
    'maneuver_end',
    'lock',
    'unlock',
    'intercept',
    'hit',
    'miss',
    // Roci vs Zmeya ("Oyedeng") narrative event set
    'pursuit_start',
    'intercept_course',
    'high_g_burn',
    'missile_lock',
    'zmeya_barrage_launch',
    'roci_torpedo_launch',
    'torpedo_intercept',
    'pdc_auto_track',
    'defensive_roll_start',
    'pdc_engagement',
    'pdc_jammed',
    'pdc_coverage_shift',
    'missile_intercept',
    'all_missiles_destroyed',
    'railgun_fire',
    'zmeya_drive_disabled',
    'engagement_resolution',
]);

const REQUIRED_FIELDS = ['t', 'type'];

function normalize(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('event-model: event must be an object');
    }
    for (const f of REQUIRED_FIELDS) {
        if (!(f in raw)) {
            throw new Error(`event-model: missing required field "${f}"`);
        }
    }
    if (typeof raw.t !== 'number' || !isFinite(raw.t)) {
        throw new Error(`event-model: t must be a finite number, got ${raw.t}`);
    }
    if (!VALID_TYPES.has(raw.type)) {
        throw new Error(`event-model: unknown event type "${raw.type}"`);
    }
    if ('end' in raw && (typeof raw.end !== 'number' || !isFinite(raw.end) || raw.end < raw.t)) {
        throw new Error(`event-model: end must be a finite number >= t, got ${raw.end}`);
    }
    return {
        t: raw.t,
        type: raw.type,
        actor: raw.actor != null ? String(raw.actor) : null,
        target: raw.target != null ? String(raw.target) : null,
        result: raw.result != null ? String(raw.result) : null,
        weapon: raw.weapon != null ? String(raw.weapon) : null,
        end: typeof raw.end === 'number' ? raw.end : null,
        description: raw.description != null ? String(raw.description) : '',
    };
}

function normalizeAll(rawEvents) {
    if (!Array.isArray(rawEvents)) {
        throw new Error('event-model: events must be an array');
    }
    return rawEvents.map(normalize);
}

// Filter events by predicate. Returned events share the structured shape.
function filter(events, predicate) {
    return events.filter(predicate);
}

function byType(events, type) {
    return filter(events, (e) => e.type === type);
}

function byActor(events, actorId) {
    return filter(events, (e) => e.actor === actorId);
}

function byTarget(events, targetId) {
    return filter(events, (e) => e.target === targetId);
}

function byResult(events, result) {
    return filter(events, (e) => e.result === result);
}

// Find the event strictly before / after a given time. Both return null
// when no such event exists. Deterministic: events are assumed to be
// sorted by t (the schema requires it).
function prevAt(events, t) {
    let target = null;
    for (const ev of events) {
        if (ev.t < t - 1e-6) target = ev;
        else break;
    }
    return target;
}

function nextAt(events, t) {
    for (const ev of events) {
        if (ev.t > t + 1e-6) return ev;
    }
    return null;
}

// Human-readable display string for the event log.
function describe(ev) {
    if (ev.description) return ev.description;
    const parts = [];
    if (ev.actor) parts.push(ev.actor.toUpperCase());
    parts.push(ev.type);
    if (ev.target) parts.push('-> ' + ev.target.toUpperCase());
    if (ev.result) parts.push('(' + ev.result + ')');
    return parts.join(' ');
}

// CSS class hook for timeline markers. Mirrors the event type so markers
// can be styled per kind.
function typeClass(ev) {
    return 'event-marker-' + ev.type;
}

export const EventModel = {
    normalize,
    normalizeAll,
    byType,
    byActor,
    byTarget,
    byResult,
    prevAt,
    nextAt,
    describe,
    typeClass,
    VALID_TYPES,
};
