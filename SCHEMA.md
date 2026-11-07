# Space Telemetry Dataset Contract

This document defines the telemetry contract consumed by `index.html`. The
implementation loads `data/iss.json` via `fetch` and expects it to match this
schema.

The contract is grounded in the CCSDS 502 family recommendations:

- **OMM** (Orbital Mean-elements Message, 502.0-B-3) supplies the orbital
  semantics and field names used in the optional `mean_elements` block.
- **OEM / OPM** (ephemeris / single state vector, same 502 family) supplies
  the render-friendly *state-vector ephemeris*: contiguous samples of
  position + velocity, interpolated over time.
- **XTCE** (660.x) informs how the schema is *defined and documented*; it is
  not used as the data serialization.

## Dataset file

- **Path:** `data/scenarios.json` (canonical source)
- **Embedded static copy:** `js/scenarios-data.js` (generated from `data/scenarios.json`)
- **Format:** UTF-8 JSON
- **Consumed by:** the viewer loads the embedded copy directly — no `fetch`,
  so the page works from a `file://` origin with no server.

The app reads the embedded copy in `js/scenarios-data.js`; the canonical source is
`data/scenarios.json`, which is what `npm test` validates. Keep the two in sync by
regenerating the embedded copy after editing the data (see `README.md`).

The first scenario ships three tracks: the Moon (a *celestial* track, see
below), the International Space Station, and Tiangong / CSS.

## Top-level structure

The dataset is a collection of one or more **scenarios**. A *scenario* is a
replayable mission: it holds one or more **tracks** (space objects'
state-vector ephemerides) plus an optional list of named **events** rendered as
labeled markers on the timeline UI.

```json
{
  "scenarios": [
    {
      "id": "leo",
      "name": "Low Earth Orbit",
      "description": "ISS and Tiangong (CSS) in low Earth orbit.",
      "tracks": [ { "...track..." } ],
      "events": [ { "...event..." } ]
    }
  ]
}
```

The first scenario ships with the ISS and Tiangong tracks. Each Apollo mission
(Apollo 11, Apollo 13 — real NASA/SPICE trajectory data is planned for a future
session) will be its own scenario carrying its tracks and mission events.

### Scenario fields

- `id` (string, required, unique): identifier used by the scenario selector.
- `name` (string, required): human-readable name shown in the UI.
- `description` (string, optional).
- `tracks` (array, required, non-empty): space-object ephemerides (below).
- `events` (array, optional): named timeline events (below).

## Track fields

```json
{
  "id": "ISS",
  "OBJECT_NAME": "ISS (ZARYA)",
  "OBJECT_ID": "1998-067A",
  "NORAD_CAT_ID": 25544,
  "CENTER_NAME": "EARTH",
  "REF_FRAME": "TEME",
  "TIME_SYSTEM": "UTC",
  "mean_elements": { "...optional OMM block..." },
  "attitude": { "frame": "ECItoBody", "forward": [0, 0, -1], "up": [0, 1, 0] },
  "samples": [ { "...ephemeris sample..." } ]
}
```

- `id` (string, required, unique): identifier used by the UI and camera look-at.
- `OBJECT_NAME` / `OBJECT_ID` / `NORAD_CAT_ID`: OMM identification (best-effort
  strings/numbers taken verbatim from the source message).
- `kind` (string, optional, default `"object"`): `"object"` for an artificial
  space object, `"celestial"` for a natural body (see *Celestial tracks*). The
  renderer styles trails by this field: only artificial objects get the bright
  trail.
- `radius_m` (number, required when `kind` is `"celestial"`): body radius in
  metres, used to size the rendered sphere.
- `CENTER_NAME` (string, default `"EARTH"`): central body the `REF_FRAME` is
  fixed to.
- `REF_FRAME` (string, required): inertial reference frame, `"TEME"` or `"ECI"`.
- `TIME_SYSTEM` (string, required): `"UTC"`.
- `mean_elements` (object, optional): the **nominal-orbit descriptor** (OMM
  mean elements). This is provenance for coast segments and is **not** used as
  render data. It may be omitted; the ephemeris is the ground truth.
- `attitude` (object, required): body-frame convention. `frame` names the
  reference (e.g. `ECItoBody`); `forward` and `up` name the body axes so a
  reader can derive heading and orientation.
- `samples` (array, required, non-empty): time-ordered state samples (below).

### Ephemeris sample

```json
{
  "t":       0.0,
  "position": [x, y, z],
  "velocity": [vx, vy, vz],
  "orientation": [qx, qy, qz, qw]
}
```

- `t` (number, seconds): time relative to the track epoch (t=0 at epoch).
  Strictly ascending.
- `position` ([x, y, z], meters): ECI position of the object center.
- `velocity` ([vx, vy, vz], m/s): ECI velocity (best-fit derivative).
- `orientation` ([qx, qy, qz, qw], required): **unit quaternion** rotating the
  ECI frame into the body frame (`attitude.frame`). Supplies heading and
  attitude, which the OMM/OEM standards do not carry.

Neither OMM nor the CCSDS ephemeris messages define attitude; this contract
adds `orientation` as a per-sample unit quaternion so spacecraft heading and
orientation can be rendered in 3D.

## Celestial tracks

A natural body (the Moon) is a track like any other — same metadata, same
state samples — so it interpolates, is selectable, and scrubs with the same
engine. It is distinguished by `kind: "celestial"` and adds:

- `radius_m` (number, required): body radius in metres.
- `mean_elements.SEMI_MAJOR_AXIS` (number, required): orbit radius. `npm test`
  checks that every sample stays on it (within 5%).

Renderer behaviour:

- Drawn as a wireframe sphere instead of a spacecraft model; the sample
  `orientation` is not applied (a body has no attitude styling).
- Gets the same ribbon trail as an object, but **subtle**: colder palette, about
  half the opacity and roughly half the width, kept in the orbital plane rather
  than the body-roll plane. Only artificial space objects (`kind: "object"`)
  render the bright trail.
- The camera frames and follows bodies at body scale, not spacecraft scale.

### Motion over a short replay

The Moon's real sidereal period is 27.3 days, so over a ~3 h scenario it sweeps
under 2° — visually indistinguishable from parked. The shipped Moon track
therefore advances one full visible revolution per replay. The compression is
explicit in the data rather than implied:

- `mean_elements.ORBITAL_PERIOD_S` — true sidereal period (2 360 591.5 s).
- `mean_elements.DISPLAY_PERIOD_S` — the period actually used by the samples.
- `mean_elements.DISPLAY_TIME_SCALE` — ratio of the two (≈211.7).

Sample `velocity` keeps the *physical* tangent speed (≈1.023 km/s); only the
positional rate is compressed.

## Event object

A scenario may carry a list of named events, rendered as labeled markers on the
timeline UI at `t / duration` along the scrub bar.

```json
{
  "t": 1200.0,
  "type": "launch",
  "label": "LAUNCH",
  "description": "Liftoff from Kennedy Space Center"
}
```

- `t` (number, seconds, required): timeline position, relative to scenario
  start. Must be finite; events should be time-ordered.
- `type` (string, optional): category used for marker styling.
- `label` (string, required): short text shown as the marker label and tooltip.
- `description` (string, optional): fuller detail shown in the marker tooltip.

Apollo scenario events will include e.g. launch, trans-lunar injection (TLI),
lunar-orbit insertion (LOI), landing/docking, trans-Earth injection (TEI), and
splashdown.

## Units and coordinate system

| Quantity      | Unit  | Notes                                   |
| ------------- | ----- | --------------------------------------- |
| time (`t`)    | s     | seconds from track epoch                |
| position      | m     | ECI world-space                         |
| velocity      | m/s   | ECI velocity                            |
| orientation   | -     | unit quaternion `[x, y, z, w]`          |
| altitude      | m     | derived; displayed in km in the HUD     |
| ground speed  | m/s   | derived; displayed in km/s in the HUD   |

**Coordinate system:** right-handed, **Y-up**, **forward = -Z** (THREE.js
convention). The data is authored in an Earth-centered inertial frame; the
renderer treats it as world-space.
