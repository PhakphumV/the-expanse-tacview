// js/timeline.js
// Bottom playback control: play/pause, restart, jump-to-start/end, scrubbing,
// speed, and the time readout. No event markers (ephemeris has no discrete
// events). Keyboard shortcuts wired here too.
//
// Classic-script module: attaches Tacview.createTimeline.

(function (global) {
    'use strict';

    function formatTime(t) {
        const m = Math.floor(t / 60);
        const s = t - m * 60;
        return 'T+' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    }

    function createTimeline(engine) {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const timeReadout = document.getElementById('timeReadout');
        const scrubBar = document.getElementById('scrubBar');
        const scrubProgress = document.getElementById('scrubProgress');
        const scrubHandle = document.getElementById('scrubHandle');
        const speedSelect = document.getElementById('speedSelect');
        const restartBtn = document.getElementById('restartBtn');
        const jumpStartBtn = document.getElementById('jumpStartBtn');
        const jumpEndBtn = document.getElementById('jumpEndBtn');

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

        function updateUI() {
            const t = engine.getTime();
            const dur = engine.getDuration();
            if (dur > 0) {
                const frac = t / dur;
                scrubProgress.style.width = (frac * 100) + '%';
                scrubHandle.style.left = (frac * 100) + '%';
            }
            timeReadout.textContent = formatTime(t);
            refreshPlayPauseLabel();
        }

        function isScrubbing() { return scrubbing; }

        return { updateUI, isScrubbing };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createTimeline = createTimeline;
})(window);
