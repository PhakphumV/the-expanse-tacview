// js/event-log.js
// Right-side event log: chronological list of events with click-to-seek
// and auto-scroll that tracks playback time.

export function createEventLog(playbackEngine, formatTime) {
    const entries = [];
    const listEl = document.getElementById('eventLogList');

    function populate() {
        entries.length = 0;
        if (listEl) listEl.innerHTML = '';
        const events = playbackEngine.getEvents();
        events.forEach(function (ev) {
            const entry = document.createElement('div');
            entry.className = 'event-log-entry ' + ev.type;
            const desc = ev.description ||
                [ev.actor && ev.actor.toUpperCase(), ev.type,
                 ev.target && ('-> ' + ev.target.toUpperCase()),
                 ev.result && ('(' + ev.result + ')')]
                    .filter(Boolean).join(' ');
            entry.textContent = formatTime(ev.t) + ' — ' + desc;
            entry.title = 'Jump to ' + formatTime(ev.t);
            entry.addEventListener('click', function () {
                playbackEngine.setTime(ev.t);
            });
            if (listEl) listEl.appendChild(entry);
            entries.push({ el: entry, ev });
        });
    }

    function update() {
        const t = playbackEngine.getTime();
        let lastVisible = null;
        for (const e of entries) {
            if (e.ev.t <= t) {
                e.el.style.display = 'block';
                lastVisible = e.el;
            } else {
                e.el.style.display = 'none';
            }
        }
        if (lastVisible && listEl) {
            listEl.scrollTop = lastVisible.offsetTop;
        }
    }

    return { populate, update };
}
