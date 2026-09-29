const BURST_ENTITY_FIELDS = {
    intercept: 'actor',
    hit: 'target',
    torpedo_intercept: 'target',
    missile_intercept: 'target',
    zmeya_drive_disabled: 'target',
};

const LAUNCH_TYPES = new Set(['launch', 'roci_torpedo_launch', 'zmeya_barrage_launch']);
const INTERCEPT_TYPES = new Set(['intercept', 'torpedo_intercept', 'missile_intercept']);
const HIT_TYPES = new Set(['hit', 'zmeya_drive_disabled']);
const LOCK_TYPES = new Set(['lock', 'missile_lock']);

export function getBurstEntityId(event) {
    const field = BURST_ENTITY_FIELDS[event.type];
    return field ? event[field] : null;
}

export function isHitEvent(event) {
    return HIT_TYPES.has(event.type);
}

export function isLockStartEvent(event) {
    return event.type === 'lock';
}

export function isLockEndEvent(event) {
    return event.type === 'unlock';
}

export function summarizeEvents(events) {
    const counts = { launches: 0, intercepts: 0, hits: 0, locks: 0 };
    for (const event of events) {
        if (LAUNCH_TYPES.has(event.type)) counts.launches++;
        if (INTERCEPT_TYPES.has(event.type)) counts.intercepts++;
        if (HIT_TYPES.has(event.type)) counts.hits++;
        if (LOCK_TYPES.has(event.type)) counts.locks++;
    }
    return counts;
}

export function describeEvent(event) {
    return event.description ||
        [event.actor && event.actor.toUpperCase(), event.type,
         event.target && ('-> ' + event.target.toUpperCase()),
         event.result && '(' + event.result + ')']
            .filter(Boolean).join(' ');
}