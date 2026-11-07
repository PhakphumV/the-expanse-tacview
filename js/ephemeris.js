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
                maneuvers: normalizeManeuvers(raw.maneuvers),
            };
        }

        function normalizeEvents(list) {
            return (list || []).map((e, i) => {
                if (!e || typeof e !== 'object') throw new Error('ephemeris: event ' + i + ' must be an object');
                if (typeof e.t !== 'number' || !isFinite(e.t)) throw new Error('ephemeris: event ' + i + ' t must be finite');
                return {
                    t: e.t,
                    // A burn is an interval: t_end lets the timeline draw a bar
                    // instead of a tick (ADR-0004 item 3).
                    t_end: typeof e.t_end === 'number' && isFinite(e.t_end) ? e.t_end : null,
                    type: e.type != null ? String(e.type) : 'event',
                    label: e.label != null ? String(e.label) : (e.type ? String(e.type) : 'event'),
                    description: e.description != null ? String(e.description) : '',
                };
            });
        }

        // Indexed annotations over the ephemeris (ADR-0004 item 1). The samples
        // stay the ground truth; maneuvers describe what produced them.
        const MANEUVER_KINDS = ['impulsive', 'finite', 'constant'];

        function normalizeManeuvers(list) {
            return (list || []).map((m, i) => {
                if (!m || typeof m !== 'object') throw new Error('ephemeris: maneuver ' + i + ' must be an object');
                const kind = m.kind != null ? String(m.kind) : 'impulsive';
                if (MANEUVER_KINDS.indexOf(kind) === -1) {
                    throw new Error('ephemeris: maneuver ' + i + ' has unknown kind "' + kind + '"');
                }
                const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
                return {
                    id: typeof m.id === 'string' && m.id ? m.id : 'maneuver-' + (i + 1),
                    kind,
                    t_start: num(m.t_start),
                    t_end: num(m.t_end),
                    dv_mps: num(m.dv_mps),
                    dv_frame: m.dv_frame != null ? String(m.dv_frame) : 'ECI',
                    accel_mps2: num(m.accel_mps2),
                    thrust_n: num(m.thrust_n),
                    isp_s: num(m.isp_s),
                    mass_kg: m.mass_kg && typeof m.mass_kg === 'object' ? m.mass_kg : null,
                    attitude: m.attitude != null ? String(m.attitude) : 'prograde',
                    note: m.note != null ? String(m.note) : '',
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

        // Load a single scenario payload (js/scenario-<id>.js via the scenario
        // loader). Replaces whatever was loaded, so the previous scenario's
        // samples and their decoded vectors become garbage.
        function loadScenario(raw) {
            state.scenarios = [normalizeScenario(raw, 0)];
            state.scenarioIndex = 0;
            state.activeIndex = 0;
            state.currentTime = 0;
            state.playing = true;
            applyActive();
        }

        // Interpolate a track's samples at time t (null outside its window).
        // Position uses cubic Hermite through the sample velocities (ADR-0004
        // item 5), so sparse sampling of a curved arc does not facet; velocity
        // lerps and orientation slerps.
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
            const u = span > 0 ? (t - a.t) / span : 0;
            const u2 = u * u, u3 = u2 * u;
            const h00 = 2 * u3 - 3 * u2 + 1;
            const h10 = u3 - 2 * u2 + u;
            const h01 = -2 * u3 + 3 * u2;
            const h11 = u3 - u2;
            const position = new THREE.Vector3(
                h00 * a.position.x + h10 * span * a.velocity.x + h01 * b.position.x + h11 * span * b.velocity.x,
                h00 * a.position.y + h10 * span * a.velocity.y + h01 * b.position.y + h11 * span * b.velocity.y,
                h00 * a.position.z + h10 * span * a.velocity.z + h01 * b.position.z + h11 * span * b.velocity.z
            );
            return {
                position,
                velocity: new THREE.Vector3().copy(a.velocity).lerp(b.velocity, u),
                orientation: new THREE.Quaternion().copy(a.orientation).slerp(b.orientation, u),
            };
        }

        function getStateAtTime(t) { return interp(state.samples, t); }

        function getTrack(id) { return state.tracks.find((t) => t.id === id) || null; }
        function getSamplesFor(id) { const t = getTrack(id); return t ? t.samples : []; }
        function getStateAtTimeFor(id, t) { return interp(getSamplesFor(id), t); }

        // Maneuver accessors (ADR-0004 item 1).
        function getManeuvers(trackId) {
            const tr = getTrack(trackId);
            return tr ? tr.maneuvers : [];
        }
        function getAllManeuvers() {
            const out = [];
            for (const tr of state.tracks) {
                for (const m of tr.maneuvers) out.push(Object.assign({ trackId: tr.id }, m));
            }
            return out.sort((a, b) => (a.t_start == null ? Infinity : a.t_start) - (b.t_start == null ? Infinity : b.t_start));
        }
        // Cumulative dv burned by a track up to time t.
        function getDeltaVUsed(trackId, t) {
            let dv = 0;
            for (const m of getManeuvers(trackId)) {
                if (!m.dv_mps) continue;
                const end = m.t_end != null ? m.t_end : m.t_start;
                if (end != null && end <= t) dv += m.dv_mps;
            }
            return dv;
        }

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
            loadScenario,
            selectScenario,
            getStateAtTime,
            getStateAtTimeFor,
            getSamplesFor,
            getManeuvers, getAllManeuvers, getDeltaVUsed,
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
