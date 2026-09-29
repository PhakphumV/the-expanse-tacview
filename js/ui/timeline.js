// js/ui/timeline.js
// Bottom timeline UI: play/pause, scrubbing, speed control, event markers,
// and the TAC-020 replay controls (restart, jump-to-start/end, prev/next
// event). Keyboard shortcuts are wired here too.

import { clamp, formatTime as formatReplayTime } from '../utils/math.js';
import { createListenerScope } from '../utils/listeners.js';
import { CONFIG } from '../utils/config.js';

export function createTimeline(playbackEngine) {
    const listeners = createListenerScope();
    function formatTime(t) {
        return formatReplayTime(t, 1, 'T+');
    }

    const playPauseBtn = document.getElementById('playPauseBtn');
    const timeReadout = document.getElementById('timeReadout');
    const scrubBar = document.getElementById('scrubBar');
    const scrubProgress = document.getElementById('scrubProgress');
    const scrubHandle = document.getElementById('scrubHandle');
    const eventMarkersEl = document.getElementById('eventMarkers');
    const speedSelect = document.getElementById('speedSelect');
    const restartBtn = document.getElementById('restartBtn');
    const jumpStartBtn = document.getElementById('jumpStartBtn');
    const jumpEndBtn = document.getElementById('jumpEndBtn');
    const prevEvtBtn = document.getElementById('prevEventBtn');
    const nextEvtBtn = document.getElementById('nextEventBtn');

    speedSelect.replaceChildren();
    for (const speed of CONFIG.playback.speedOptions) {
        const option = document.createElement('option');
        option.value = String(speed);
        option.textContent = speed + 'x';
        option.selected = speed === playbackEngine.getSpeed();
        speedSelect.appendChild(option);
    }

    function refreshPlayPauseLabel() {
        const want = playbackEngine.isPlaying() ? 'Pause' : 'Play';
        if (playPauseBtn.textContent !== want) playPauseBtn.textContent = want;
    }
    let lastPlayingState = null;

    listeners.listen(playPauseBtn, 'click', function () {
        if (playbackEngine.isPlaying()) playbackEngine.pause();
        else playbackEngine.play();
        refreshPlayPauseLabel();
    });

    if (restartBtn) listeners.listen(restartBtn, 'click', function () {
        playbackEngine.restart();
        refreshPlayPauseLabel();
    });
    if (jumpStartBtn) listeners.listen(jumpStartBtn, 'click', function () {
        playbackEngine.jumpToStart();
        refreshPlayPauseLabel();
    });
    if (jumpEndBtn) listeners.listen(jumpEndBtn, 'click', function () {
        playbackEngine.jumpToEnd();
        refreshPlayPauseLabel();
    });
    if (prevEvtBtn) listeners.listen(prevEvtBtn, 'click', function () {
        playbackEngine.prevEvent();
        refreshPlayPauseLabel();
    });
    if (nextEvtBtn) listeners.listen(nextEvtBtn, 'click', function () {
        playbackEngine.nextEvent();
        refreshPlayPauseLabel();
    });

    listeners.listen(speedSelect, 'change', function () {
        playbackEngine.setSpeed(parseFloat(speedSelect.value));
    });

    // ---- Keyboard shortcuts (TAC-020) ----
    // Documented in the help overlay (#helpOverlay).
    listeners.listen(window, 'keydown', function (e) {
        // Ignore keys when the user is typing in a control.
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (playbackEngine.isPlaying()) playbackEngine.pause();
            else playbackEngine.play();
            refreshPlayPauseLabel();
        } else if (e.key === 'Home' || e.key === '0') {
            e.preventDefault();
            playbackEngine.jumpToStart();
            refreshPlayPauseLabel();
        } else if (e.key === 'End') {
            e.preventDefault();
            playbackEngine.jumpToEnd();
            refreshPlayPauseLabel();
        } else if (e.key === 'r' || e.key === 'R') {
            playbackEngine.restart();
            refreshPlayPauseLabel();
        } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
            playbackEngine.prevEvent();
            refreshPlayPauseLabel();
        } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
            playbackEngine.nextEvent();
            refreshPlayPauseLabel();
        }
    });

    // Help overlay toggle.
    const helpBtn = document.getElementById('helpBtn');
    const helpOverlay = document.getElementById('helpOverlay');
    const helpClose = document.getElementById('helpClose');
    if (helpBtn && helpOverlay) {
        listeners.listen(helpBtn, 'click', function () {
            helpOverlay.style.display = (helpOverlay.style.display === 'block') ? 'none' : 'block';
        });
        if (helpClose) listeners.listen(helpClose, 'click', function () {
            helpOverlay.style.display = 'none';
        });
        listeners.listen(window, 'keydown', function (e) {
            if (e.key === '?' || e.key === '/') {
                helpOverlay.style.display = (helpOverlay.style.display === 'block') ? 'none' : 'block';
            } else if (e.key === 'Escape') {
                helpOverlay.style.display = 'none';
            }
        });
    }

    let scrubbing = false;
    function scrubFromEvent(e) {
        const rect = scrubBar.getBoundingClientRect();
        const x = (e.clientX !== undefined ? e.clientX : 0) - rect.left;
        const frac = clamp(x / rect.width, 0, 1);
        const dur = playbackEngine.getDuration();
        playbackEngine.setTime(frac * dur);
    }
    listeners.listen(scrubBar, 'mousedown', function (e) {
        scrubbing = true;
        scrubFromEvent(e);
    });
    listeners.listen(window, 'mousemove', function (e) {
        if (scrubbing) scrubFromEvent(e);
    });
    listeners.listen(window, 'mouseup', function () { scrubbing = false; });

    function populateMarkers() {
        eventMarkersEl.innerHTML = '';
        const events = playbackEngine.getEvents();
        const dur = playbackEngine.getDuration();
        if (!dur) return;
        events.forEach(function (ev) {
            const m = document.createElement('div');
            m.className = 'eventMarker ' + ev.type;
            m.style.left = (ev.t / dur * 100) + '%';
            m.title = (ev.description || ev.type) +
                      (ev.actor ? ' [' + ev.actor.toUpperCase() + ']' : '') +
                      (ev.target ? ' -> ' + ev.target.toUpperCase() : '') +
                      (ev.result ? ' (' + ev.result + ')' : '');
            eventMarkersEl.appendChild(m);
        });
    }

    function updateUI(t = playbackEngine.getTime()) {
        const dur = playbackEngine.getDuration();
        if (dur > 0) {
            const frac = t / dur;
            scrubProgress.style.width = (frac * 100) + '%';
            scrubHandle.style.left = (frac * 100) + '%';
        }
        timeReadout.textContent = formatTime(t);
        // Keep the Play/Pause label in sync — but only when state changes.
        if (lastPlayingState !== playbackEngine.isPlaying()) {
            lastPlayingState = playbackEngine.isPlaying();
            refreshPlayPauseLabel();
        }
    }

    function isScrubbing() { return scrubbing; }

    function update(t) { updateUI(t); }

    function reset() {
        scrubbing = false;
        lastPlayingState = null;
        if (eventMarkersEl) eventMarkersEl.innerHTML = '';
        scrubProgress.style.width = '0%';
        scrubHandle.style.left = '0%';
        updateUI();
    }

    function destroy() {
        listeners.destroy();
        reset();
    }

    return { update, reset, destroy, populateMarkers, updateUI, isScrubbing, formatTime };
}
