// js/timeline.js
// Bottom timeline UI: play/pause, scrubbing, speed control, event markers.

function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return 'T+' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

export function createTimeline(playbackEngine) {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const timeReadout = document.getElementById('timeReadout');
    const scrubBar = document.getElementById('scrubBar');
    const scrubProgress = document.getElementById('scrubProgress');
    const scrubHandle = document.getElementById('scrubHandle');
    const eventMarkersEl = document.getElementById('eventMarkers');
    const speedSelect = document.getElementById('speedSelect');

    playPauseBtn.addEventListener('click', function () {
        if (playbackEngine.isPlaying()) {
            playbackEngine.pause();
            playPauseBtn.textContent = 'Play';
        } else {
            playbackEngine.play();
            playPauseBtn.textContent = 'Pause';
        }
    });

    speedSelect.addEventListener('change', function () {
        playbackEngine.setSpeed(parseFloat(speedSelect.value));
    });

    let scrubbing = false;
    function scrubFromEvent(e) {
        const rect = scrubBar.getBoundingClientRect();
        const x = (e.clientX !== undefined ? e.clientX : 0) - rect.left;
        let frac = Math.max(0, Math.min(1, x / rect.width));
        const dur = playbackEngine.getDuration();
        playbackEngine.setTime(frac * dur);
    }
    scrubBar.addEventListener('mousedown', function (e) {
        scrubbing = true;
        scrubFromEvent(e);
    });
    window.addEventListener('mousemove', function (e) {
        if (scrubbing) scrubFromEvent(e);
    });
    window.addEventListener('mouseup', function () { scrubbing = false; });

    function populateMarkers() {
        eventMarkersEl.innerHTML = '';
        const events = playbackEngine.getEvents();
        const dur = playbackEngine.getDuration();
        if (!dur) return;
        events.forEach(function (ev) {
            const m = document.createElement('div');
            m.className = 'eventMarker ' + ev.type;
            m.style.left = (ev.t / dur * 100) + '%';
            m.title = ev.type + (ev.detail ? ': ' + ev.detail : '');
            eventMarkersEl.appendChild(m);
        });
    }

    function updateUI() {
        const t = playbackEngine.getTime();
        const dur = playbackEngine.getDuration();
        if (dur > 0) {
            const frac = t / dur;
            scrubProgress.style.width = (frac * 100) + '%';
            scrubHandle.style.left = (frac * 100) + '%';
        }
        timeReadout.textContent = formatTime(t);
    }

    function isScrubbing() { return scrubbing; }

    return { populateMarkers, updateUI, isScrubbing, formatTime };
}
