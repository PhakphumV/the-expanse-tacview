# The Expanse Tacview

A static, browser-only tactical replay viewer for *Expanse*-inspired synthetic engagements, with no backend and no live ingest. This glossary captures project-specific language used by the codebase and telemetry dataset.

## Replay domain

**Engagement**:
A single selectable replay scenario; the unit the user picks from the Engagement dropdown. A telemetry dataset is a collection of one or more engagements.
_Avoid_: scenario, mission, replay

**Telemetry Dataset**:
A JSON file (`data/engagement.json`) that wraps one or more engagements; loaded by the playback engine on startup.
_Avoid_: data file, scenario bundle

**Entity**:
A ship, torpedo, or PDC round that participates in an engagement timeline; each entity owns one keyframe track.
_Avoid_: actor, object, unit

**Keyframe**:
An authored time-stamped sample of an entity's position, velocity, and orientation; the source of truth the playback engine interpolates from.
_Avoid_: sample, datapoint, frame

## Ship behavior

**IFF**:
Identification Friend-or-Foe; the side tag on every entity, conventionally `"blue"` or `"red"`.
_Avoid_: side, team, faction

**Burn Direction**:
A tactical HUD classification of a ship's current acceleration relative to its velocity: `FWD` (prograde burn), `BRK` (retrograde burn), or `IDLE` (no significant thrust). Derived from the dot product `acceleration · velocity` with thresholds.
_Avoid_: thrust mode, propulsion state

**Closure Rate**:
The rate at which range between two ships is changing, in m/s (displayed as km/s in the HUD). Positive = closing, negative = opening.
_Avoid_: closing speed, range rate

**Aspect Angle**:
The angle between a ship's nose vector (from orientation) and the line-of-sight to the other ship, 0–180°. 0° = head-on, 180° = stern-to-stern.
_Avoid_: bearing, angle on

**Brachistochrone Illusion**:
The visual effect of long-distance linear acceleration through space, produced by the inertial-frame starfield parallax. The replay reads as a pursuit on an intercept trajectory rather than an orbit around a fixed center.
_Avoid_: deep-space travel effect

## Camera

**Center of Engagement**:
A camera mode that dynamically frames the active ships in the engagement, regardless of their relative position.
_Avoid_: overhead, both-ships view

**Chase**:
A camera mode that follows a single ship (the chase target) at close range; the user can cycle the chase target with the `C` key. An engagement may declare a default chase target.
_Avoid_: third-person, follow cam

## Architecture

**Newtonian-aware Interpolation**:
Playback engine mode where position is integrated from velocity each frame (and orientation from angular velocity), but the keyframes remain the source of truth. The visible drift at keyframe boundaries is intentional, not a bug.
_Avoid_: live simulation, physics engine

**Inertial Frame**:
For the starfield, the velocity reference used to compute apparent star drift: `v_frame = 0.5 * (v_roci + v_zmeya)`. Stars drift opposite to this frame each frame.
_Avoid_: world frame, camera frame

**TacView**:
The reference commercial tactical replay tool whose UI conventions inspired this project. The project is *inspired by* TacView; it is not a clone and does not consume the TacView binary format.
_Avoid_: the application, the original
