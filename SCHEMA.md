# Telemetry Keyframe Schema

This document describes the JSON schema used for all entity telemetry in The Expanse Tacview (ships, torpedoes, PDC rounds).

## Top-level structure

```json
{
  "duration": 90.0,
  "entities": [
    { ...entity... }
  ],
  "events": [
    { ...event... }
  ]
}
```

- `duration` (number): total engagement length in seconds.
- `entities` (array): per-entity keyframe tracks.
- `events` (array): discrete time-stamped events (launch, intercept, hit, miss, maneuver start/end, lock/unlock).

## Entity object

```json
{
  "id": "roci",
  "type": "ship",
  "iff": "blue",
  "keyframes": [
    {
      "t": 0.0,
      "position": [x, y, z],
      "velocity": [vx, vy, vz],
      "orientation": [x, y, z, w]
    }
  ]
}
```

- `id` (string): unique entity identifier.
- `type` (string): one of `"ship"`, `"torpedo"`, `"pdc_round"`.
- `iff` (string): side identifier, e.g. `"blue"`, `"red"`, `"neutral"`.
- `keyframes` (array): ordered keyframes. The engine interpolates between adjacent keyframes; an entity is rendered from its first keyframe's `t` until its last keyframe's `t`.

### Keyframe

- `t` (number): time in seconds from engagement start.
- `position` (array of 3 numbers): world-space position in meters.
- `velocity` (array of 3 numbers): velocity vector in m/s at this keyframe.
- `orientation` (array of 4 numbers): unit quaternion `[x, y, z, w]`.

## Event object

```json
{
  "t": 12.5,
  "type": "launch",
  "entity_id": "torpedo_01",
  "detail": "Roci launches torpedo at Zmeya"
}
```

- `t` (number): timestamp.
- `type` (string): one of `"launch"`, `"intercept"`, `"hit"`, `"miss"`, `"maneuver_start"`, `"maneuver_end"`, `"lock"`, `"unlock"`.
- `entity_id` (string, optional): the entity this event refers to.
- `detail` (string, optional): human-readable description.

## Spawn / despawn semantics

An entity is considered active between its first and last keyframe (inclusive). Outside that window it is not rendered. This naturally supports torpedoes launched at t=12 and destroyed at t=18.

## Example

See [`data/example.json`](data/example.json) for a minimal, validated well-formed example with two entities and a handful of keyframes each.
