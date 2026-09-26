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

    return {
        load,
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
    };
}
