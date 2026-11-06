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

- **Path:** `data/orbits.json` (canonical source)
- **Embedded static copy:** `js/orbits-data.js` (generated from `data/orbits.json`)
- **Format:** UTF-8 JSON
- **Consumed by:** the viewer loads the embedded copy directly — no `fetch`,
  so the page works from a `file://` origin with no server.

The app reads the embedded copy in `js/orbits-data.js`; the canonical source is
`data/orbits.json`, which is what `npm test` validates. Keep the two in sync by
regenerating the embedded copy after editing the data (see `README.md`).

The first scenario ships two tracks (International Space Station and Tiangong /
CSS) plus a Moon celestial body rendered by the scene.

## Top-level structure

The dataset is a collection of one or more **tracks**. A *track* is a single
space object's ephemeris: it carries provenance (identification, reference
frame, time system) and a time-ordered series of state samples.

```json
{
  "tracks": [
    { "...track..." }
  ]
}
```

A coherent scene may assemble multiple tracks later; the first scenario ships
with a single track (the International Space Station).

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
