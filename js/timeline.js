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
        const detailBar = document.getElementById('detailBar');
        const detailGrid = document.getElementById('detailGrid');
        const detailTicks = document.getElementById('detailTicks');
        const detailFrom = document.getElementById('detailFrom');
        const detailTo = document.getElementById('detailTo');
        const speedSelect = document.getElementById('speedSelect');
        const restartBtn = document.getElementById('restartBtn');
        const prevEventBtn = document.getElementById('prevEventBtn');
        const nextEventBtn = document.getElementById('nextEventBtn');

        // Detail timeline: a fixed 20-minute window (±10) centred on the playhead.
        // Dragging it pans the window, which is the same as scrubbing the time.
        const DETAIL_WINDOW_S = 1200;
        let detailDrag = null;          // { x0, t0 } while a drag is in progress

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

            if (detailTicks) {
                detailTicks.innerHTML = '';
                for (const ev of events) {
                    const dm = document.createElement('div');
                    dm.className = 'detail-marker';
                    dm.dataset.t = String(ev.t);
                    detailTicks.appendChild(dm);
                }
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
                const base = pin.classList.contains('explosion') ? '#ffb14a'
                    : (pin.classList.contains('milestone') ? '#9fd0ff'
                        : (pin.classList.contains('phase') ? '#ffe8b8' : '#ffd27f'));
                let color = step === 0 ? base : CLUSTER_COLORS[step % CLUSTER_COLORS.length];
                // Never give a neighbour the colour it already has: that is the whole
                // point of tinting a cluster.
                if (color === prev) color = CLUSTER_COLORS[(step + 1) % CLUSTER_COLORS.length];
                pin.style.setProperty('--mk', color);
                prev = color;
                lastX = x;
            }
            syncDetailColors();
        }

        // The detail track draws its events as lines, in exactly the colour the
        // overview pin took — including the cluster palette, which is why this runs
        // after the pins are painted rather than from the event type.
        function syncDetailColors() {
            if (!detailTicks || !eventMarkersEl) return;
            const pins = eventMarkersEl.querySelectorAll('.event-marker');
            const lines = detailTicks.children;
            for (let i = 0; i < lines.length && i < pins.length; i++) {
                const c = pins[i].style.getPropertyValue('--mk');
                if (c) lines[i].style.setProperty('--mk', c);
            }
        }
        window.addEventListener('resize', paintMarkers);

        // Window bounds for the detail bar: always 1200 s wide and centred on the
        // playhead, so it runs past the mission ends rather than sliding the
        // playhead off-centre.
        function detailWindow(t) {
            return { start: t - DETAIL_WINDOW_S / 2, end: t + DETAIL_WINDOW_S / 2 };
        }

        // Minute ruler under the detail track: a line at every whole minute of
        // mission time, brighter with a timestamp every fifth. Lines live at fixed
        // mission times and scroll with the window, so they mean the same thing as
        // the event lines beside them. A pool of elements is reused each frame
        // rather than rebuilt (paintDetail runs on every animation frame).
        const DETAIL_MAJOR_S = 300;
        const gridPool = [];
        function gridTick(i) {
            if (gridPool[i]) return gridPool[i];
            const line = document.createElement('div');
            line.className = 'detail-grid-line';
            const label = document.createElement('span');
            label.className = 'detail-grid-label';
            line.appendChild(label);
            detailGrid.appendChild(line);
            const rec = { line, label };
            gridPool[i] = rec;
            return rec;
        }

        function paintDetailGrid(w) {
            if (!detailGrid) return;
            const dur = engine.getDuration();
            const first = Math.ceil(w.start / 60) * 60;
            let i = 0;
            for (let tt = first; tt <= w.end; tt += 60, i++) {
                const rec = gridTick(i);
                const frac = (tt - w.start) / DETAIL_WINDOW_S;
                rec.line.style.display = 'block';
                rec.line.style.left = (frac * 100) + '%';
                const major = Math.abs(tt % DETAIL_MAJOR_S) < 0.5;
                rec.line.classList.toggle('major', major);
                // Outside the mission there is nothing to name: the line still
                // shows the ruler, the label would just read nonsense. Labels also
                // stay off the two ends, where they would be clipped by the bar.
                rec.label.textContent = (major && tt >= 0 && tt <= dur && frac > 0.06 && frac < 0.94)
                    ? formatMissionTime(tt, isLong()) : '';
            }
            for (; i < gridPool.length; i++) gridPool[i].line.style.display = 'none';
        }

        function paintDetail(t) {
            if (!detailBar) return;
            const w = detailWindow(t);
            paintDetailGrid(w);
            if (detailTicks) {
                for (const dm of detailTicks.children) {
                    const et = parseFloat(dm.dataset.t);
                    const frac = (et - w.start) / DETAIL_WINDOW_S;
                    if (frac < 0 || frac > 1) { dm.style.display = 'none'; continue; }
                    dm.style.display = 'block';
                    dm.style.left = (frac * 100) + '%';
                }
            }
            // "10 min" rather than 00:10:00: at 8-9 px Orbitron's zero is a rounded
            // box and the timestamp reads as debris.
            const half = DETAIL_WINDOW_S / 120;
            if (detailFrom) detailFrom.textContent = '\u2212' + half + ' min';
            if (detailTo) detailTo.textContent = '+' + half + ' min';
        }

        if (detailBar) {
            detailBar.addEventListener('mousedown', function (e) {
                e.preventDefault();
                // Playback would fight the drag (the engine advances while the pointer
                // also sets the time), so hold it and resume on release.
                detailDrag = { x0: e.clientX, t0: engine.getTime(), playing: engine.isPlaying() };
                if (detailDrag.playing) { engine.pause(); refreshPlayPauseLabel(); }
            });
            window.addEventListener('mousemove', function (e) {
                if (!detailDrag) return;
                const rect = detailBar.getBoundingClientRect();
                // Drag right = earlier, the way dragging a strip of film behaves.
                const dt = -((e.clientX - detailDrag.x0) / rect.width) * DETAIL_WINDOW_S;
                const dur = engine.getDuration();
                engine.setTime(Math.max(0, Math.min(dur, detailDrag.t0 + dt)));
                updateUI();
            });
            window.addEventListener('mouseup', function () {
                if (detailDrag && detailDrag.playing) { engine.play(); refreshPlayPauseLabel(); }
                detailDrag = null;
            });
            detailBar.addEventListener('dblclick', function () {
                engine.setTime(engine.getTime());   // no-op; keeps the bar from selecting text
            });
        }

        function updateUI() {
            const t = engine.getTime();
            const dur = engine.getDuration();
            if (dur > 0) {
                const frac = t / dur;
                scrubProgress.style.width = (frac * 100) + '%';
                scrubHandle.style.left = (frac * 100) + '%';
            }
            paintDetail(t);
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
