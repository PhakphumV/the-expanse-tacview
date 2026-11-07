// js/ephemeris.js
// Scenario / ephemeris engine. Loads a telemetry dataset (see SCHEMA.md) of
// one or more SCENARIOS, each holding tracks (state-vector ephemerides) and
// optionally discrete events (labeled timeline markers). Exposes time-based
// state queries + playback controls. Pure data layer: no rendering, no DOM.
//
// Classic-script module: attaches Tacview.createEphemerisEngine.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function createEphemerisEngine() {
        const state = {
            scenarios: [],
            scenarioIndex: 0,
            tracks: [],           // active scenario's tracks
            activeIndex: 0,       // active track within the scenario
            samples: [],          // active track's samples
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

        function normalizeEvents(list) {
            return (list || []).map((e, i) => {
                if (!e || typeof e !== 'object') throw new Error('ephemeris: event ' + i + ' must be an object');
                if (typeof e.t !== 'number' || !isFinite(e.t)) throw new Error('ephemeris: event ' + i + ' t must be finite');
                return {
                    t: e.t,
                    type: e.type != null ? String(e.type) : 'event',
                    label: e.label != null ? String(e.label) : (e.type ? String(e.type) : 'event'),
                    description: e.description != null ? String(e.description) : '',
                };
            });
        }

        function normalizeScenario(raw, idx) {
            if (!raw || typeof raw !== 'object') {
                throw new Error('ephemeris: scenario entry must be an object');
            }
            return {
                id: typeof raw.id === 'string' && raw.id ? raw.id : 'scenario-' + (idx + 1),
                name: typeof raw.name === 'string' && raw.name ? raw.name : 'Scenario ' + (idx + 1),
                description: typeof raw.description === 'string' ? raw.description : '',
                meta: raw,
                tracks: (raw.tracks || []).map(normalizeTrack),
                events: normalizeEvents(raw.events),
            };
        }

        function normalize(json) {
            if (!json || typeof json !== 'object') {
                throw new Error('ephemeris: dataset must be an object');
            }
            if (!Array.isArray(json.scenarios) || json.scenarios.length === 0) {
                throw new Error('ephemeris: missing scenarios array');
            }
            return json.scenarios.map(normalizeScenario);
        }

        // A scenario's timeline spans all its tracks and events, so a multi-track
        // or event-bearing scenario replays over the full union. A scenario may
        // declare an explicit `duration_s` to end the replay at a mission
        // milestone instead (e.g. splashdown) even when a celestial track's
        // ephemeris runs longer.
        function scenarioDuration(sc) {
            const declared = sc.meta && sc.meta.duration_s;
            if (typeof declared === 'number' && isFinite(declared) && declared > 0) return declared;
            let d = 0;
            for (const tr of sc.tracks) {
                const s = tr.samples;
                if (s.length && s[s.length - 1].t > d) d = s[s.length - 1].t;
            }
            for (const ev of sc.events) if (ev.t > d) d = ev.t;
            return d;
        }

        function applyActive() {
            const sc = state.scenarios[state.scenarioIndex];
            state.tracks = sc ? sc.tracks : [];
            if (!state.tracks[state.activeIndex]) state.activeIndex = 0;
            const tr = state.tracks[state.activeIndex];
            state.samples = tr ? tr.samples : [];
            state.duration = sc ? scenarioDuration(sc) : 0;
        }

        function load(json) {
            state.scenarios = normalize(json);
            state.scenarioIndex = 0;
            state.activeIndex = 0;
            state.currentTime = 0;
            state.playing = true;
            applyActive();
        }

        // Switch the active scenario; returns false if the id is unknown.
        function selectScenario(id) {
            const idx = state.scenarios.findIndex((s) => s.id === id);
            if (idx === -1) return false;
            if (idx === state.scenarioIndex) return true;
            state.scenarioIndex = idx;
            state.activeIndex = 0;
            state.currentTime = 0;
            state.playing = true;
            applyActive();
            return true;
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

        function getScenarios() { return state.scenarios; }
        function getScenario(id) { return state.scenarios.find((s) => s.id === id) || null; }
        function getActiveScenario() { return state.scenarios[state.scenarioIndex] || null; }
        function getEvents() { const sc = getActiveScenario(); return sc ? sc.events : []; }
        function getEventsUpTo(t) { return getEvents().filter((e) => e.t <= t); }

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
            selectScenario,
            getStateAtTime,
            getStateAtTimeFor,
            getSamplesFor,
            getTrack,
            getScenarios, getScenario, getActiveScenario,
            getEvents, getEventsUpTo,
            setTime, getTime, setSpeed, getSpeed,
            play, pause, isPlaying, getDuration,
            getSamples, getTracks, getActiveTrack, getActiveTrackId,
            jumpToStart, jumpToEnd, restart,
        };
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createEphemerisEngine = createEphemerisEngine;
})(window);
