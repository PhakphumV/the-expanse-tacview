# Telemetry Dataset Contract

This document defines the telemetry contract consumed by `index.html`. The
implementation loads `data/engagement.json` via `fetch` and expects it to
match this schema.

## Dataset file

- **Path:** `data/engagement.json`
- **Format:** UTF-8 JSON
- **Loaded by:** `index.html` → `PlaybackEngine.load(json)`

A minimal reference example lives at `data/example.json` and is covered by
the validation harness in `scripts/validate-playback.js`.

## Units and coordinate system

| Quantity      | Unit | Notes                                          |
| ------------- | ---- | ---------------------------------------------- |
| time (`t`)    | s    | seconds from engagement start                  |
| position      | m    | meters, world-space                            |
| velocity      | m/s  | meters per second                              |
| orientation   | -    | unit quaternion `[x, y, z, w]`                 |
| range         | m    | derived; displayed in km in the HUD            |
| closure rate  | m/s  | derived; displayed in km/s in the HUD          |
| G-force       | G   | multiples of 9.8 m/s²                          |

**Coordinate system:** right-handed, **Y-up**, **forward = -Z** (THREE.js
convention). The ship's local forward axis (used by aspect-angle
calculation) is `(0, 0, -1)` rotated by the entity's orientation.

## Top-level structure

```json
{
  "duration": 90.0,
  "entities": [ { ...entity... } ],
  "events":   [ { ...event...   } ]
}
```

- `duration` (number, seconds): total engagement length.
- `entities` (array): per-entity keyframe tracks.
- `events` (array): discrete time-stamped events used by the timeline
  markers, event log, lock indicator, burst effects, and minimap.

## Entity object

```json
{
  "id": "roci",
  "type": "ship",
  "iff": "blue",
  "keyframes": [
    { "t": 0.0, "position": [x, y, z], "velocity": [vx, vy, vz], "orientation": [x, y, z, w] }
  ]
}
```

- `id` (string, required, unique): entity identifier referenced by events.
- `type` (string, required): one of `"ship"`, `"torpedo"`, `"pdc_round"`.
- `iff` (string, required): side tag, typically `"blue"` or `"red"`.
- `keyframes` (array, required, length ≥ 1): ordered by `t` ascending.

### Keyframe

- `t` (number, seconds): timestamp relative to engagement start.
- `position` ([x, y, z], meters): world-space position.
- `velocity` ([vx, vy, vz], m/s): velocity vector at this keyframe.
  Authored as an independent sample, not strictly the derivative of
  `position`. See `VALIDATION.md` for the resulting tolerance.
- `orientation` ([x, y, z, w]): unit quaternion.

### Entity lifecycle

An entity is **active** in the closed interval
`[keyframes[0].t, keyframes[last].t]`. Outside that window:

- it is **not rendered**,
- it is **excluded** from derived telemetry (range, closure, G-force),
- any events referencing it are still displayed but may not have a
  position to project to.

This convention naturally supports torpedoes launched at t=12 and
destroyed at t=18: their keyframes simply span `[12, 18]`.

## Event object

```json
{
  "t": 12.5,
  "type": "launch",
  "entity_id": "torp_01",
  "detail": "Roci launches torpedo at Zmeya"
}
```

- `t` (number, seconds): timestamp.
- `type` (string, required): one of the types listed below.
- `entity_id` (string, optional): the entity this event refers to.
- `detail` (string, optional): human-readable description shown in the
  event log and as marker tooltips.

### Event types used by the application

| Type              | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `launch`          | Munition spawn                                  |
| `pdc_engage`      | PDC point-defense opens fire                    |
| `intercept`       | PDC successfully defeats an inbound munition   |
| `hit`             | Munition impacts a ship                         |
| `miss`            | Munition passes without effect                  |
| `maneuver_start`  | Ship begins a named maneuver                    |
| `maneuver_end`    | Ship completes a named maneuver                 |
| `lock`            | Targeting lock acquired                         |
| `unlock`          | Targeting lock lost                             |

`lock`/`unlock` pairs define closed intervals consumed by the radar lock
indicator. `intercept`/`hit` events spawn procedural burst effects at the
referenced entity's position.
