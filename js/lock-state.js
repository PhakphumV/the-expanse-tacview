// js/lock-state.js
// Builds closed lock intervals from discrete lock/unlock events and answers
// isLockedAt(t) queries. Driven by the dataset's events array.

export function createLockState(playbackEngine) {
    let intervals = [];

    function build() {
        intervals = [];
        const events = playbackEngine.getEvents().slice().sort((a, b) => a.t - b.t);
        let open = null;
        for (const ev of events) {
            if (ev.type === 'lock') {
                if (!open) open = { start: ev.t, end: Infinity };
            } else if (ev.type === 'unlock') {
                if (open) { open.end = ev.t; intervals.push(open); open = null; }
            }
        }
        if (open) intervals.push(open);
    }

    function isLockedAt(t) {
        for (let i = 0; i < intervals.length; i++) {
            if (t >= intervals[i].start && t < intervals[i].end) return true;
        }
        return false;
    }

    return { build, isLockedAt };
}
