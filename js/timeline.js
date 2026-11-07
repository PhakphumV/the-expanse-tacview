// js/timeline.js
// Bottom playback control: play/pause, restart, jump-to-start/end, scrubbing,
// speed, and the time readout. No event markers (ephemeris has no discrete
// events). Keyboard shortcuts wired here too.
//
// Classic-script module: attaches Tacview.createTimeline.

(function (global) {
    'use strict';

    // Elapsed-time formatting. Short replays read as MM:SS.s; multi-day missions
    // (Apollo, 195 h) read as HHH:MM:SS so the readout stays legible.
    function formatMissionTime(t, longForm) {
        t = Math.max(0, t);
        const pad2 = (n) => (n < 10 ? '0' : '') + n;
        if (longForm) {
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const s = Math.floor(t % 60);
            return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
        }
        const m = Math.floor(t / 60);
        const s = t - m * 60;
        return pad2(m) + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    }

    function createTimeline(engine) {
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

        // Multi-day missions (Apollo) read as HHH:MM:SS rather than MM:SS.s.
        function isLong() { return engine.getDuration() >= 86400; }

        function refreshPlayPauseLabel() {
            const want = engine.isPlaying() ? 'Pause' : 'Play';
            if (playPauseBtn && playPauseBtn.textContent !== want) playPauseBtn.textContent = want;
        }

        playPauseBtn.addEventListener('click', function () {
            if (engine.isPlaying()) engine.pause(); else engine.play();
            refreshPlayPauseLabel();
        });
        if (restartBtn) restartBtn.addEventListener('click', function () {
            engine.restart(); refreshPlayPauseLabel();
        });
        if (jumpStartBtn) jumpStartBtn.addEventListener('click', function () {
            engine.jumpToStart(); refreshPlayPauseLabel();
        });
        if (jumpEndBtn) jumpEndBtn.addEventListener('click', function () {
            engine.jumpToEnd(); refreshPlayPauseLabel();
        });
        if (speedSelect) speedSelect.addEventListener('change', function () {
            engine.setSpeed(parseFloat(speedSelect.value));
        });

        window.addEventListener('keydown', function (e) {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (engine.isPlaying()) engine.pause(); else engine.play();
                refreshPlayPauseLabel();
            } else if (e.key === 'Home' || e.key === '0') {
                e.preventDefault(); engine.jumpToStart(); refreshPlayPauseLabel();
            } else if (e.key === 'End') {
                e.preventDefault(); engine.jumpToEnd(); refreshPlayPauseLabel();
            } else if (e.key === 'r' || e.key === 'R') {
                engine.restart(); refreshPlayPauseLabel();
            }
        });

        let scrubbing = false;
        function scrubFromEvent(e) {
            const rect = scrubBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const frac = Math.max(0, Math.min(1, x / rect.width));
            engine.setTime(frac * engine.getDuration());
        }
        scrubBar.addEventListener('mousedown', function (e) { scrubbing = true; scrubFromEvent(e); });
        window.addEventListener('mousemove', function (e) { if (scrubbing) scrubFromEvent(e); });
        window.addEventListener('mouseup', function () { scrubbing = false; });

        // Render labeled event markers from the active scenario onto the scrub
        // bar at t/duration. Rebuilt whenever the scenario changes. Clicking a
        // marker jumps the replay to that event (phases double as jump targets).
        // Maneuvers with an interval draw as a bar instead of a tick (ADR-0004).
        function populateEvents() {
            if (!eventMarkersEl) return;
            eventMarkersEl.innerHTML = '';
            const events = engine.getEvents();
            const dur = engine.getDuration() || 1;

            for (const m of engine.getAllManeuvers()) {
                if (m.t_start == null || m.t_end == null || m.t_end <= m.t_start) continue;
                const bar = document.createElement('div');
                bar.className = 'maneuver-bar ' + (m.kind === 'impulsive' ? 'impulsive' : m.kind);
                bar.style.left = (m.t_start / dur * 100) + '%';
                bar.style.width = Math.max(0.4, (m.t_end - m.t_start) / dur * 100) + '%';
                const dv = m.dv_mps ? ' · Δv ' + (m.dv_mps >= 1000 ? (m.dv_mps / 1000).toFixed(2) + ' km/s' : m.dv_mps.toFixed(1) + ' m/s') : '';
                bar.title = (m.id || 'burn') + ' — ' + m.kind + ' burn, T+' + formatMissionTime(m.t_start, isLong()) +
                    '–' + formatMissionTime(m.t_end, isLong()) + dv + (m.note ? ' — ' + m.note : '');
                bar.addEventListener('click', function (e) {
                    e.stopPropagation();
                    engine.setTime(m.t_start);
                    refreshPlayPauseLabel();
                    updateUI();
                });
                eventMarkersEl.appendChild(bar);
            }

            for (let i = 0; i < events.length; i++) {
                const ev = events[i];
                const m = document.createElement('div');
                m.className = 'event-marker' + (ev.type ? ' ' + ev.type : '');
                m.style.left = (ev.t / dur * 100) + '%';
                m.title = ev.label + ' (T+' + formatMissionTime(ev.t, isLong()) + ')' + (ev.description ? ' — ' + ev.description : '');
                m.addEventListener('click', function (e) {
                    e.stopPropagation();
                    engine.setTime(ev.t);
                    refreshPlayPauseLabel();
                    updateUI();
                });
                const lab = document.createElement('span');
                lab.textContent = ev.label;
                // Stagger label rows so clustered events stay readable, and
                // anchor labels at the bar's ends instead of centering them off
                // the edge.
                const frac = ev.t / dur;
                lab.style.bottom = (13 + (i % 3) * 13) + 'px';
                if (frac < 0.06) {
                    lab.style.left = '0';
                    lab.style.transform = 'none';
                } else if (frac > 0.94) {
                    lab.style.left = '100%';
                    lab.style.transform = 'translateX(-100%)';
                }
                m.appendChild(lab);
                eventMarkersEl.appendChild(m);
            }
        }

        function updateUI() {
            const t = engine.getTime();
            const dur = engine.getDuration();
            if (dur > 0) {
                const frac = t / dur;
                scrubProgress.style.width = (frac * 100) + '%';
                scrubHandle.style.left = (frac * 100) + '%';
            }
            timeReadout.textContent = 'T+' + formatMissionTime(t, isLong());
            refreshPlayPauseLabel();
        }

        function isScrubbing() { return scrubbing; }

        return { updateUI, isScrubbing, populateEvents };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTimeline = createTimeline;
    global.Tacview.formatMissionTime = formatMissionTime;
})(window);
