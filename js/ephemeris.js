// js/ephemeris.js
// Track/ephemeris engine. Loads a telemetry dataset (see SCHEMA.md) and
// exposes time-based state queries plus playback controls. Pure data layer:
// no rendering, no DOM.
//
// Track model (state-vector ephemeris):
//   - state.tracks holds the normalized track collection.
//   - getStateAtTime(t) interpolates a track's samples (position, velocity,
//     orientation) at time t — propulsion-agnostic ground truth.
//   - Samples are delivered pre-baked; no SGP4/propagator runs here.
//
// Classic-script module: attaches Tacview.createEphemerisEngine.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function createEphemerisEngine() {
        const state = {
            tracks: [],
            activeIndex: 0,
            samples: [],
            duration: 0,
            currentTime: 0,
            speed: 1.0,
            playing: true,
        };

        function buildSamples(list) {
            return (list || []).map((s) => ({
                t: s.t,
                position: new THREE.Vector3(s.position[0], s.position[1], s.position[2]),
                velocity: new THREE.Vector3(s.velocity[0], s.velocity[1], s.velocity[2]),
                orientation: new THREE.Quaternion(
                    s.orientation[0], s.orientation[1], s.orientation[2], s.orientation[3]),
            }));
        }

        function normalizeTrack(raw, idx) {
            if (!raw || typeof raw !== 'object') {
                throw new Error('ephemeris: track entry must be an object');
            }
            return {
                id: typeof raw.id === 'string' && raw.id ? raw.id : 'track-' + (idx + 1),
                meta: raw,
                samples: buildSamples(raw.samples),
            };
        }

        function normalize(json) {
            if (!json || typeof json !== 'object') {
                throw new Error('ephemeris: dataset must be an object');
            }
            if (!Array.isArray(json.tracks)) {
                throw new Error('ephemeris: missing tracks array');
            }
            return json.tracks.map(normalizeTrack);
        }

        function applyActive() {
            const tr = state.tracks[state.activeIndex];
            state.samples = tr ? tr.samples : [];
            state.duration = state.samples.length
                ? state.samples[state.samples.length - 1].t
                : 0;
        }

        function load(json) {
            state.tracks = normalize(json);
            state.activeIndex = 0;
            state.currentTime = 0;
            state.playing = true;
            applyActive();
        }

        // Interpolate a track's samples at time t (null outside its window).
        function interp(kfs, t) {
            if (!kfs || kfs.length === 0) return null;
            if (t < kfs[0].t || t > kfs[kfs.length - 1].t) return null;
            let i = 0;
            while (i < kfs.length - 1 && kfs[i + 1].t < t) i++;
            if (i >= kfs.length - 1) {
                const s = kfs[kfs.length - 1];
                return {
                    position: s.position.clone(),
                    velocity: s.velocity.clone(),
                    orientation: s.orientation.clone(),
                };
            }
            const a = kfs[i], b = kfs[i + 1];
            const span = b.t - a.t;
            const alpha = span > 0 ? (t - a.t) / span : 0;
            return {
                position: new THREE.Vector3().copy(a.position).lerp(b.position, alpha),
                velocity: new THREE.Vector3().copy(a.velocity).lerp(b.velocity, alpha),
                orientation: new THREE.Quaternion().copy(a.orientation).slerp(b.orientation, alpha),
            };
        }

        function getStateAtTime(t) { return interp(state.samples, t); }

        function getTrack(id) { return state.tracks.find((t) => t.id === id) || null; }
        function getSamplesFor(id) { const t = getTrack(id); return t ? t.samples : []; }
        function getStateAtTimeFor(id, t) { return interp(getSamplesFor(id), t); }

        function setTime(t) { state.currentTime = Math.max(0, Math.min(t, state.duration)); }
        function getTime() { return state.currentTime; }
        function setSpeed(s) { state.speed = s; }
        function getSpeed() { return state.speed; }
        function play() { state.playing = true; }
        function pause() { state.playing = false; }
        function isPlaying() { return state.playing; }
        function getDuration() { return state.duration; }
        function getSamples() { return state.samples; }
        function getTracks() { return state.tracks; }
        function getActiveTrack() { return state.tracks[state.activeIndex] || null; }
        function getActiveTrackId() { const t = getActiveTrack(); return t ? t.id : null; }
        function jumpToStart() { setTime(0); }
        function jumpToEnd() { setTime(state.duration); }
        function restart() { setTime(0); state.playing = true; }

        return {
            load,
            getStateAtTime,
            getStateAtTimeFor,
            getSamplesFor,
            getTrack,
            setTime, getTime, setSpeed, getSpeed,
            play, pause, isPlaying, getDuration,
            getSamples, getTracks, getActiveTrack, getActiveTrackId,
            jumpToStart, jumpToEnd, restart,
        };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createEphemerisEngine = createEphemerisEngine;
})(window);
