// js/playback.js
// Keyframe-driven playback engine. Loads a telemetry dataset, exposes
// time-based state queries, and manages play/pause/speed/time controls.
// No rendering, no DOM — pure data layer.
//
// Two state APIs:
//   getStateAtTime(t)         kinematic: position/velocity lerp + slerp
//                              between adjacent keyframes. Used by
//                              consumers that don't need physics
//                              integration.
//   getIntegratedStateAtTime(t)  Newtonian-aware (Phase 6, ADR-0001):
//                              position integrated from velocity,
//                              orientation integrated from body-frame
//                              angular velocity. Synthetic ω derived
//                              from orientation deltas when the optional
//                              angular_velocity field is absent (ADR-0002).

const THREE = window.THREE;

import {
    integratePosition,
    integrateOrientation,
    deriveAngularVelocity,
} from './integrator.js';

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
                // Optional additive angular_velocity field (ADR-0002).
                // When absent on every keyframe of an entity, the
                // integrator derives a synthetic ω from orientation deltas.
                let angVel = null;
                if (Array.isArray(k.angular_velocity) && k.angular_velocity.length === 3) {
                    angVel = new THREE.Vector3(
                        k.angular_velocity[0],
                        k.angular_velocity[1],
                        k.angular_velocity[2]
                    );
                }
                return {
                    t: k.t,
                    pos: new THREE.Vector3(k.position[0], k.position[1], k.position[2]),
                    vel: new THREE.Vector3(k.velocity[0], k.velocity[1], k.velocity[2]),
                    q: new THREE.Quaternion(k.orientation[0], k.orientation[1], k.orientation[2], k.orientation[3]),
                    angVel: angVel,
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

    // ---- Integrated state (Newtonian-aware, Phase 6 ADR-0001) ----
    //
    // For an entity active in [kA.t, kB.t] at time t:
    //   velocity at t        = kA.vel            (constant across the span)
    //   position  at t        = kA.pos + kA.vel * (t - kA.t)
    //   angular velocity at t = kA.angVel if present, else derived from
    //                            orientation delta over [kA.t, kB.t]
    //   orientation at t      = kA.q integrated forward by (t - kA.t)
    //
    // This produces deterministic drift at keyframe boundaries (the
    // integrated position and orientation will not exactly match the
    // next keyframe when the dataset authors velocity / orientation
    // independently of position; the validator checks the drift against
    // a documented tolerance). Drift is intentional, not a bug.
    function getIntegratedStateAtTime(t) {
        const out = {};
        for (const id in state.entities) {
            const ent = state.entities[id];
            const kfs = ent.keyframes;
            if (kfs.length === 0) { out[id] = { active: false }; continue; }
            if (t < kfs[0].t || t > kfs[kfs.length - 1].t) {
                out[id] = { active: false };
                continue;
            }

            // Find the bracket [kA, kB] containing t.
            let i = 0;
            while (i < kfs.length - 1 && kfs[i + 1].t < t) i++;

            // Single-keyframe edge case: no integration needed.
            if (kfs.length === 1) {
                out[id] = {
                    active: true,
                    position: kfs[0].pos.clone(),
                    velocity: kfs[0].vel.clone(),
                    orientation: kfs[0].q.clone(),
                };
                continue;
            }

            // For all other cases (including t at the last keyframe), the
            // bracket is [kA, kB] with i = last-1, kB = kfs[last]. dt may
            // equal the full span or zero; either is well-defined.
            const kA = kfs[i];
            const kB = kfs[i + 1];
            const dt = t - kA.t;
            const span = kB.t - kA.t;

            // Pick the angular velocity for this span.
            let wx, wy, wz;
            if (kA.angVel) {
                wx = kA.angVel.x; wy = kA.angVel.y; wz = kA.angVel.z;
            } else if (span > 0) {
                const omega = deriveAngularVelocity(kA.q, kB.q, kA.t, kB.t);
                wx = omega[0]; wy = omega[1]; wz = omega[2];
            } else {
                wx = 0; wy = 0; wz = 0;
            }

            // Integrate position and orientation forward by dt. The
            // integrator writes into the supplied out-parameter, so we
            // pre-allocate a THREE.Vector3 / THREE.Quaternion to keep
            // the returned shape consistent with the kinematic state
            // (callers like js/entities.js rely on .clone() / .copy()).
            const pos = new THREE.Vector3();
            integratePosition(kA.pos, kA.vel, dt, pos);
            const q = new THREE.Quaternion();
            integrateOrientation(kA.q, wx, wy, wz, dt, q);

            out[id] = {
                active: true,
                position: pos,
                velocity: kA.vel.clone(),
                orientation: q,
            };
        }
        return out;
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
        getIntegratedStateAtTime,
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
