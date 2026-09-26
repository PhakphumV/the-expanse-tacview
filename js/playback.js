// js/playback.js
// Keyframe-driven playback engine. Loads a telemetry dataset, exposes
// time-based state queries, and manages play/pause/speed/time controls.
// No rendering, no DOM — pure data layer.

const THREE = window.THREE;

export function createPlaybackEngine() {
    const state = {
        dataset: null,
        entities: {},
        duration: 0,
        currentTime: 0,
        speed: 1.0,
        playing: true,
        engagementData: [],
        activeId: null,
    };

    function load(json) {
        state.dataset = json;
        state.duration = json.duration;
        state.entities = {};
        json.entities.forEach(function (e) {
            const kfs = e.keyframes.map(function (k) {
                return {
                    t: k.t,
                    pos: new THREE.Vector3(k.position[0], k.position[1], k.position[2]),
                    vel: new THREE.Vector3(k.velocity[0], k.velocity[1], k.velocity[2]),
                    q: new THREE.Quaternion(k.orientation[0], k.orientation[1], k.orientation[2], k.orientation[3])
                };
            });
            state.entities[e.id] = { type: e.type, iff: e.iff, keyframes: kfs };
        });
    }

    function getStateAtTime(t) {
        const out = {};
        for (const id in state.entities) {
            const ent = state.entities[id];
            const kfs = ent.keyframes;
            if (kfs.length === 0) { out[id] = { active: false }; continue; }
            if (t < kfs[0].t || t > kfs[kfs.length - 1].t) { out[id] = { active: false }; continue; }
            let i = 0;
            while (i < kfs.length - 1 && kfs[i + 1].t < t) i++;
            if (i >= kfs.length - 1) {
                out[id] = {
                    active: true,
                    position: kfs[kfs.length - 1].pos.clone(),
                    velocity: kfs[kfs.length - 1].vel.clone(),
                    orientation: kfs[kfs.length - 1].q.clone(),
                };
                continue;
            }
            const a = kfs[i];
            const b = kfs[i + 1];
            const span = b.t - a.t;
            const alpha = span > 0 ? (t - a.t) / span : 0;
            const pos = new THREE.Vector3().copy(a.pos).lerp(b.pos, alpha);
            const vel = new THREE.Vector3().copy(a.vel).lerp(b.vel, alpha);
            const q = new THREE.Quaternion().copy(a.q).slerp(b.q, alpha);
            out[id] = { active: true, position: pos, velocity: vel, orientation: q };
        }
        return out;
    }

    function getEventsUpTo(t) {
        if (!state.dataset) return [];
        return state.dataset.events.filter(function (ev) { return ev.t <= t; });
    }

    function setTime(t) { state.currentTime = Math.max(0, Math.min(t, state.duration)); }
    function getTime() { return state.currentTime; }
    function setSpeed(s) { state.speed = s; }
    function getSpeed() { return state.speed; }
    function play() { state.playing = true; }
    function pause() { state.playing = false; }
    function isPlaying() { return state.playing; }
    function getDuration() { return state.duration; }
    function getEntities() { return state.entities; }
    function getEvents() { return state.dataset ? state.dataset.events : []; }
    function getDataset() { return state.dataset; }

    // ---- Engagement collection (multi-engagement selector) ----
    // The dataset file wraps one or more engagements:
    //   { "engagements": [ { id, name, description, duration, entities, events } ] }
    // Each entry is a complete single-engagement document plus a stable
    // id and a human-readable name for the selector UI.

    function validateEngagementShape(e) {
        if (!e || typeof e !== 'object') throw new Error('engagement entry is not an object');
        if (typeof e.id !== 'string' || !e.id) throw new Error('engagement entry missing string "id"');
        if (typeof e.duration !== 'number' || !isFinite(e.duration)) {
            throw new Error('engagement "' + e.id + '" missing numeric "duration"');
        }
        if (!Array.isArray(e.entities)) throw new Error('engagement "' + e.id + '" missing "entities" array');
        if (!Array.isArray(e.events)) throw new Error('engagement "' + e.id + '" missing "events" array');
    }

    // Load the collection document. The first engagement becomes active
    // (deterministic default). An empty collection is valid: nothing is
    // loaded and the UI shows its empty state.
    function loadCollection(json) {
        if (!json || !Array.isArray(json.engagements)) {
            throw new Error('dataset has no "engagements" array');
        }
        state.engagementData = json.engagements;
        state.activeId = null;
        state.dataset = null;
        state.entities = {};
        state.duration = 0;
        state.currentTime = 0;
        if (json.engagements.length > 0) {
            const first = json.engagements[0];
            validateEngagementShape(first);
            load(first);
            state.activeId = first.id;
            state.playing = true;
        }
        return getEngagements();
    }

    // Selector metadata: stable id + display name per engagement.
    function getEngagements() {
        return state.engagementData.map(function (e) {
            return {
                id: e && e.id,
                name: (e && e.name) || (e && e.id) || '(unnamed engagement)',
                description: (e && e.description) || '',
            };
        });
    }

    function getActiveEngagementId() { return state.activeId; }

    // Switch the active engagement by id. Resets replay time to T+00:00
    // and pauses; throws if the id is unknown or the entry is malformed
    // (the previous engagement stays active in that case).
    function selectEngagement(id) {
        let eng = null;
        for (const e of state.engagementData) {
            if (e && e.id === id) { eng = e; break; }
        }
        if (!eng) throw new Error('unknown engagement id "' + id + '"');
        validateEngagementShape(eng);
        load(eng);
        state.activeId = id;
        state.currentTime = 0;
        state.playing = false;
        return true;
    }

    // ---- Navigation helpers (TAC-020) ----
    // Jump to start of engagement. Playing state is preserved.
    function jumpToStart() { setTime(0); }
    // Jump to end of engagement. Playing state is preserved.
    function jumpToEnd() { setTime(state.duration); }
    // Restart: jump to t=0 and resume playback if paused.
    function restart() { setTime(0); state.playing = true; }
    // Seek to the previous event strictly before currentTime.
    // Returns the event's t, or null if there is no earlier event.
    function prevEvent() {
        const events = getEvents();
        let target = null;
        for (const ev of events) {
            if (ev.t < state.currentTime - 1e-6) target = ev.t;
            else break;
        }
        if (target !== null) setTime(target);
        return target;
    }
    // Seek to the next event strictly after currentTime.
    // Returns the event's t, or null if there is no later event.
    function nextEvent() {
        const events = getEvents();
        for (const ev of events) {
            if (ev.t > state.currentTime + 1e-6) {
                setTime(ev.t);
                return ev.t;
            }
        }
        return null;
    }

    return {
        load,
        loadCollection,
        getEngagements,
        getActiveEngagementId,
        selectEngagement,
        getStateAtTime,
        getEventsUpTo,
        setTime,
        getTime,
        setSpeed,
        getSpeed,
        play,
        pause,
        isPlaying,
        getDuration,
        getEntities,
        getEvents,
        getDataset,
        jumpToStart,
        jumpToEnd,
        restart,
        prevEvent,
        nextEvent,
    };
}
