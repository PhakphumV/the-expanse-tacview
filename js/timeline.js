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

    // A map-pin glyph: 14 x 17 with the tip at the bottom centre, so it plants on
    // the track's top edge. Colour comes from the button's `color` (phase, milestone).
    const PIN_SVG = '<svg viewBox="0 0 14 17" aria-hidden="true" focusable="false">'
        + '<path d="M7 16.6S13 9.7 13 6.05A6 6 0 1 0 1 6.05C1 9.7 7 16.6 7 16.6Z"/>'
        + '<circle cx="7" cy="6" r="2.1" fill="#0a1626"/></svg>';

    function createTimeline(engine) {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const timeReadout = document.getElementById('timeReadout');
        const scrubBar = document.getElementById('scrubBar');
        const scrubProgress = document.getElementById('scrubProgress');
        const scrubHandle = document.getElementById('scrubHandle');
        const eventMarkersEl = document.getElementById('eventMarkers');
        const speedSelect = document.getElementById('speedSelect');
        const restartBtn = document.getElementById('restartBtn');
        const prevEventBtn = document.getElementById('prevEventBtn');
        const nextEventBtn = document.getElementById('nextEventBtn');

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
        // Event stepping: the pins on the track are the jump targets, so these two
        // buttons walk them in either direction from wherever the playhead is.
        function events() {
            const list = (engine.getEvents ? engine.getEvents() : []) || [];
            return list.filter((e) => typeof e.t === 'number').sort((a, b) => a.t - b.t);
        }
        function stepEvent(dir) {
            const t = engine.getTime();
            const list = events();
            let best = null;
            for (const e of list) {
                if (dir > 0 && e.t > t + 0.5 && (best === null || e.t < best.t)) best = e;
                if (dir < 0 && e.t < t - 0.5 && (best === null || e.t > best.t)) best = e;
            }
            if (!best) return;
            engine.setTime(best.t);
            refreshPlayPauseLabel();
            updateUI();
        }
        if (prevEventBtn) prevEventBtn.addEventListener('click', function () { stepEvent(-1); });
        if (nextEventBtn) nextEventBtn.addEventListener('click', function () { stepEvent(1); });
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
            } else if (e.key === 'ArrowLeft' && e.shiftKey) {
                e.preventDefault(); stepEvent(-1);
            } else if (e.key === 'ArrowRight' && e.shiftKey) {
                e.preventDefault(); stepEvent(1);
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
                const dir = m.dv_direction || (Array.isArray(m.dv_rtn) ? 'RTN ' + m.dv_rtn.map((c) => c.toFixed(0)).join('/') + ' m/s'
                    : (Array.isArray(m.dv_vector) ? 'vector' : m.attitude || ''));
                bar.title = (m.id || 'burn') + ' — ' + m.kind + ' burn, T+' + formatMissionTime(m.t_start, isLong()) +
                    '–' + formatMissionTime(m.t_end, isLong()) + dv + (dir ? ' · ' + dir : '') + (m.note ? ' — ' + m.note : '');
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
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'event-marker' + (ev.type ? ' ' + ev.type : '');
                btn.style.left = (ev.t / dur * 100) + '%';
                btn.title = ev.label + ' (T+' + formatMissionTime(ev.t, isLong()) + ')' + (ev.description ? ' — ' + ev.description : '');
                btn.innerHTML = PIN_SVG;
                // Stop the press here: the scrub bar starts a drag on mousedown, and a
                // pin should jump, not scrub.
                btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    engine.setTime(ev.t);
                    refreshPlayPauseLabel();
                    updateUI();
                });
                const lab = document.createElement('span');
                lab.textContent = ev.label;
                // Anchor labels at the bar's ends instead of centering them off the edge.
                const frac = ev.t / dur;
                if (frac < 0.06) {
                    lab.style.left = '0';
                    lab.style.transform = 'none';
                } else if (frac > 0.94) {
                    lab.style.left = '100%';
                    lab.style.transform = 'translateX(-100%)';
                }
                btn.appendChild(lab);
                eventMarkersEl.appendChild(btn);
            }
            paintMarkers();
        }

        // Events that land within a few pixels of each other keep their own tick and
        // pin — nothing is stacked — and are told apart by colour instead: the first
        // of a cluster keeps its type colour (phase amber, milestone blue) and each
        // neighbour after it takes the next palette colour. Re-run on resize, because
        // how close "close" is depends on the track's width in pixels.
        const CLUSTER_COLORS = ['#ffe8b8', '#9fd0ff', '#ffb3c7', '#a8f0a0', '#d9b3ff', '#ffc98a'];
        function paintMarkers() {
            if (!eventMarkersEl) return;
            const pins = Array.prototype.slice.call(eventMarkersEl.querySelectorAll('.event-marker'));
            let lastX = -1e9;
            let step = 0;
            let prev = null;
            for (const pin of pins) {
                const x = pin.offsetLeft;
                step = (x - lastX >= 14) ? 0 : step + 1;
                const base = pin.classList.contains('milestone') ? '#9fd0ff'
                    : (pin.classList.contains('phase') ? '#ffe8b8' : '#ffd27f');
                let color = step === 0 ? base : CLUSTER_COLORS[step % CLUSTER_COLORS.length];
                // Never give a neighbour the colour it already has: that is the whole
                // point of tinting a cluster.
                if (color === prev) color = CLUSTER_COLORS[(step + 1) % CLUSTER_COLORS.length];
                pin.style.setProperty('--mk', color);
                prev = color;
                lastX = x;
            }
        }
        window.addEventListener('resize', paintMarkers);

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
