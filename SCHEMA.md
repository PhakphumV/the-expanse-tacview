# Telemetry Dataset Contract

This document defines the telemetry contract consumed by `index.html`. The
implementation loads `data/engagement.json` via `fetch` and expects it to
match this schema.

## Dataset file

- **Path:** `data/engagement.json`
- **Format:** UTF-8 JSON
- **Loaded by:** `index.html` → `PlaybackEngine.loadCollection(json)`

A minimal reference example lives at `data/example.json` and is covered by
the validation harness in `scripts/validate-playback.js`.

## Collection wrapper

The dataset file is a collection of one or more engagements:

```json
{
  "engagements": [
    {
      "id": "roci-vs-zmeya-synthetic",
      "name": "Roci vs Zmeya — Synthetic Engagement",
      "description": "Synthetic tactical replay",
      "duration": 90.0,
      "entities": [ { ...entity... } ],
      "events":   [ { ...event...   } ]
    }
  ]
}
```

- `engagements` (array, required): one entry per selectable engagement.
- Each entry is a complete single-engagement document (see
  **Engagement structure** below) plus:
  - `id` (string, required, unique): stable identifier used as the
    dropdown option value and for programmatic selection.
  - `name` (string): human-readable label shown in the Engagement
    dropdown. Falls back to `id` when omitted.
  - `description` (string): free-text summary.

The application loads the first entry as the deterministic default; the
Engagement dropdown switches entries without a page reload. An empty
`engagements` array is valid and produces a visible empty state in the
UI. Malformed entries are reported in an error banner and do not make
the application unusable.

## Engagement structure

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
  markers, event log, lock indicator, and burst effects.

## Units and coordinate system

| Quantity      | Unit | Notes                                          |
| ------------- | ---- | ---------------------------------------------- |
| time (`t`)    | s    | seconds from engagement start                  |
| position      | m    | meters, world-space                            |
| velocity      | m/s  | meters per second                              |
| orientation   | -    | unit quaternion `[x, y, z, w]`                 |
| angular_velocity | rad/s | body-frame `[wx, wy, wz]`; optional, additive |
| range         | m    | derived; displayed in km in the HUD            |
| closure rate  | m/s  | derived; displayed in km/s in the HUD          |
| G-force       | G   | multiples of 9.8 m/s²                          |

**Coordinate system:** right-handed, **Y-up**, **forward = -Z** (THREE.js
convention). The ship's local forward axis (used by aspect-angle
calculation) is `(0, 0, -1)` rotated by the entity's orientation.

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

> **Optional keyframe fields (additive, ignored when absent):**
> - `angular_velocity: [wx, wy, wz]` — body-frame angular velocity in rad/s.
>   When omitted on every keyframe of an entity, the integrator derives a
>   synthetic angular velocity from the quaternion delta between adjacent
>   keyframes, so existing datasets render a continuous roll without
>   re-authoring the data. See [Phase 6 ADR-0002](adr/0002-angular-velocity-field-policy.md).

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
- `angular_velocity` ([wx, wy, wz], rad/s, **optional**): body-frame
  angular velocity. The integrator uses this directly when present; when
  absent it derives a synthetic ω from quaternion deltas between
  adjacent keyframes. See the optional-fields note above.

### Entity lifecycle

An entity is **active** in the closed interval
`[keyframes[0].t, keyframes[last].t]`. Outside that window:

- it is **not rendered**,
- it is **excluded** from derived telemetry (range, closure, G-force),
- any events referencing it are still displayed but may not have a
  position to project to.

This convention naturally supports torpedoes launched at t=12 and
destroyed at t=18: their keyframes simply span `[12, 18]`.

## Event object (structured model)

```json
{
  "t":          12.5,
  "type":       "launch",
  "actor":      "roci",
  "target":     "zmeya",
  "result":     null,
  "description": "Roci launches torpedo at Zmeya"
}
```

### Required fields

- `t` (number, seconds): event timestamp relative to engagement start.
  Must be a finite number.
- `type` (string, required, must be in `EventModel.VALID_TYPES`): one of
  the types listed below.

### Optional fields

- `actor` (string): entity id that performed the action. Used by the
  event log, mission state, burst positioning, and lock indicator.
- `target` (string): entity id that was acted upon. May be `null` for
  self-referential events like `maneuver_start`/`maneuver_end` or
  `unlock`.
- `result` (string): combat outcome for terminal events. One of
  `"hit"`, `"intercept"`, `"miss"`, or `null`.
- `weapon` (string): mount id for weapon-specific events
  (e.g. `"pdc_02"` on `pdc_engagement` / `pdc_jammed` /
  `pdc_coverage_shift` / `missile_intercept`).
- `end` (number, seconds): end timestamp for windowed events. Required
  on `pdc_engagement`; the renderer synthesizes a deterministic tracer
  stream across `[t, end]`.
- `description` (string): human-readable summary used by the event
  log and timeline marker tooltips. When omitted, a fallback is
  composed from the other fields.

### Event-type catalogue

| Type             | actor          | target          | result     | Meaning                                |
| ---------------- | -------------- | --------------- | ---------- | -------------------------------------- |
| `launch`         | launching ship | target ship     | `null`     | Munition spawned                       |
| `pdc_engage`     | firing ship    | inbound torpedo | `null`     | Point-defense opens fire               |
| `maneuver_start` | maneuvering    | `null`          | `null`     | Ship begins a named maneuver           |
| `maneuver_end`   | maneuvering    | `null`          | `null`     | Ship completes a named maneuver        |
| `lock`           | locking ship   | target ship     | `null`     | Targeting lock acquired                |
| `unlock`         | releasing ship | `null`          | `null`     | Targeting lock lost                    |
| `intercept`      | torpedo        | intercepting    | `"intercept"` | PDC successfully defeats munition   |
| `hit`            | torpedo        | struck ship     | `"hit"`    | Munition impacts a ship                |
| `miss`           | torpedo        | intended target | `"miss"`   | Munition passes without effect         |
| `pursuit_start`  | pursuing ship  | `null`          | `null`     | Pursuit track established              |
| `intercept_course` | pursuing ship | `null`        | `null`     | Commits to an intercept course         |
| `high_g_burn`    | burning ship   | `null`          | `null`     | Sustained high-acceleration burn       |
| `missile_lock`   | locking ship   | target ship     | `null`     | Firing solution on the target          |
| `zmeya_barrage_launch` | launching ship | target ship | `null` | Large missile barrage launched         |
| `roci_torpedo_launch`  | launching ship | targeted missile | `null` | Defensive torpedo launched       |
| `torpedo_intercept` | interceptor torpedo | destroyed missile | `"intercept"` | Torpedo destroys an incoming missile |
| `pdc_auto_track` | defending ship | `null`          | `null`     | PDCs switched to automatic tracking    |
| `defensive_roll_start` | rolling ship | `null`     | `null`     | Ship begins a defensive roll/spin      |
| `pdc_engagement` | firing ship    | targeted missile | `null`    | PDC fire window; needs `weapon`, `end` |
| `pdc_jammed`     | owning ship    | `null`          | `null`     | A PDC mount jams; needs `weapon`       |
| `pdc_coverage_shift` | owning ship | `null`        | `null`     | Roll brings another PDC to bear; needs `weapon` |
| `missile_intercept` | defending ship | destroyed missile | `"intercept"` | PDC destroys an incoming missile; needs `weapon` |
| `all_missiles_destroyed` | defending ship | `null` | `null` | Final incoming missile destroyed       |
| `railgun_fire`   | firing ship    | target ship     | `null`     | Railgun discharged                     |
| `zmeya_drive_disabled` | firing ship | disabled ship | `"hit"` | Railgun disables the target's drive cone |
| `engagement_resolution` | ship | ship or `null` | `null`    | Engagement outcome settled             |

### Shared module

All event consumption goes through `js/event-model.js`, which provides:

- `EventModel.normalize(raw)` / `EventModel.normalizeAll(rawList)` —
  validate and coerce an event (or list) into the canonical shape.
- `EventModel.byType / byActor / byTarget / byResult(events, key)` —
  filtered views over an event list.
- `EventModel.prevAt(events, t)` / `EventModel.nextAt(events, t)` —
  deterministic navigation to the event strictly before / after a
  given time.
- `EventModel.describe(ev)` — display string for the event log.
- `EventModel.typeClass(ev)` — CSS hook for timeline markers.

Consumers (timeline markers, event log, lock indicator, burst
effects, mission state) all read from `playbackEngine.getEvents()`
and rely on the schema above; they do not maintain their own copies
of event definitions.

`lock`/`unlock` pairs define closed intervals consumed by the radar
lock indicator. `intercept`/`hit` events spawn procedural burst
effects at the affected entity's position (target for `hit`, actor
for `intercept`).
