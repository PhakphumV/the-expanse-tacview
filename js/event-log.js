// js/event-log.js
// Right-side event log: chronological list of events with click-to-seek
// and auto-scroll that tracks playback time.
//
// Performance notes (TAC-023):
// - Entries are created once in populate() and reused; no per-frame DOM
//   churn beyond display toggles.
// - update() does a binary search for the last visible event and only
//   touches `style.display` and `scrollTop` when the visible index
//   changes — the common case is a no-op.

import { describeEvent } from './event-model.js';

export function createEventLog(playbackEngine, formatTime) {
    const entries = [];
    const listEl = document.getElementById('eventLogList');
    let lastVisibleIdx = -1;
    let lastScrollIdx = -1;

    function reset() {
        entries.length = 0;
        if (listEl) listEl.innerHTML = '';
        lastVisibleIdx = -1;
        lastScrollIdx = -1;
    }

    function populate() {
        reset();
        const events = playbackEngine.getEvents();
        events.forEach(function (ev) {
            const entry = document.createElement('div');
            entry.className = 'event-log-entry ' + ev.type;
            const desc = describeEvent(ev);
            entry.textContent = formatTime(ev.t) + ' — ' + desc;
            entry.title = 'Jump to ' + formatTime(ev.t);
            entry.addEventListener('click', function () {
                playbackEngine.setTime(ev.t);
            });
            entry.style.display = 'none';
            if (listEl) listEl.appendChild(entry);
            entries.push({ el: entry, ev });
        });
    }

    // Binary search: largest index with ev.t <= t. -1 if none.
    function findLastVisible(t) {
        let lo = 0, hi = entries.length - 1, found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (entries[mid].ev.t <= t) {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found;
    }

    function update(t = playbackEngine.getTime()) {
        const idx = findLastVisible(t);
        if (idx === lastVisibleIdx) return; // no change — skip DOM work
        // Hide entries past the new visible index.
        for (let i = idx + 1; i <= lastVisibleIdx && i < entries.length; i++) {
            entries[i].el.style.display = 'none';
        }
        // Show entries up to the new visible index (if advancing).
        for (let i = Math.max(0, lastVisibleIdx + 1); i <= idx; i++) {
            entries[i].el.style.display = 'block';
        }
        // If we scrubbed backward, hide the now-out-of-range tail.
        if (idx < lastVisibleIdx) {
            for (let i = idx + 1; i < entries.length; i++) {
                entries[i].el.style.display = 'none';
            }
        }
        lastVisibleIdx = idx;
        if (idx >= 0 && idx !== lastScrollIdx && listEl) {
            listEl.scrollTop = entries[idx].el.offsetTop;
            lastScrollIdx = idx;
        }
    }

    // Re-sync scroll after the pane was hidden (display:none zeroes
    // offsetTop); called by the info panel when the Events tab shows.
    function refresh(t = playbackEngine.getTime()) {
        lastScrollIdx = -1;
        update(t);
    }

    function destroy() {
        reset();
    }

    return { populate, update, refresh, reset, destroy };
}
