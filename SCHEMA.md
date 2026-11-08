# Space Telemetry Dataset Contract

This document defines the telemetry contract consumed by `index.html`. The
implementation loads the embedded per-scenario payloads generated from
`data/scenarios/<id>.json` and expects them to match this schema.

For a step-by-step authoring guide — data flow, a verified minimal example,
generation recipes and the ten automated checks — see
**[docs/telemetry-guide.md](docs/telemetry-guide.md)**.

The contract is grounded in the CCSDS 502 family recommendations:

- **OMM** (Orbital Mean-elements Message, 502.0-B-3) supplies the orbital
  semantics and field names used in the optional `mean_elements` block.
- **OEM / OPM** (ephemeris / single state vector, same 502 family) supplies
  the render-friendly *state-vector ephemeris*: contiguous samples of
  position + velocity, interpolated over time.
- **XTCE** (660.x) informs how the schema is *defined and documented*; it is
  not used as the data serialization.

## Dataset file

- **Path:** `data/scenarios/<id>.json` (canonical source, one file per scenario)
- **Embedded payloads:** `js/scenario-<id>.js`, one per scenario — generated
- **Embedded manifest:** `js/scenarios-data.js` — generated
- **Format:** UTF-8 JSON
- **Consumed by:** the viewer boots from the manifest (ids, names, presentation
  hints, counts — no samples), then injects the `<script>` for the selected
  scenario and releases the previous payload. No `fetch`, so the page still
  works from a `file://` origin with no server.
- **Regenerate:** `npm run embed` (`scripts/embed-scenarios.js`)

The app reads the generated files; the canonical source is the scenario store,
which is what `npm test` validates. `npm test` also fails when a generated
payload no longer matches the canonical dataset (sample counts, windows, events),
so a forgotten `npm run embed` is caught rather than shipped.

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
- `epoch` (string, optional): ISO 8601 UTC instant that `t = 0` corresponds to
  (e.g. `"1969-07-16T13:32:00Z"` for Apollo 11's launch). Provenance only.
- `duration_s` (number, optional): explicit replay length in seconds. Defaults
  to the union of track windows and event times; set it to end the replay at a
  milestone (Apollo 11 ends at splashdown even though the Moon track runs on).
- `default_speed` (number, optional): playback multiplier selected on load, for
  scenarios whose realistic rate would otherwise crawl (Apollo 11: `512`).
- `default_target` (string, optional): target id the camera frames on load
  (default `"earth"`).
- `view_distance_m` (number, optional): framing distance in metres for the
  initial Earth view — a cislunar scenario needs a much wider shot than a
  low-Earth-orbit one.

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
- `SOURCE` (string, optional): provenance for the samples — the dataset, model
  or document they came from. Required in spirit for any reconstructed track.
- `CENTER_NAME` (string, default `"EARTH"`): central body the `REF_FRAME` is
  fixed to.
- `REF_FRAME` (string, required): inertial reference frame — `"TEME"`, `"ECI"`
  or `"ICRF"`.
- `TIME_SYSTEM` (string, required): `"UTC"`.
- `mean_elements` (object, optional): the **nominal-orbit descriptor** (OMM
  mean elements). This is provenance for coast segments and is **not** used as
  render data. It may be omitted; the ephemeris is the ground truth.
- `attitude` (object, required): body-frame convention. `frame` names the
  reference (e.g. `ECItoBody`); `forward` and `up` name the body axes so a
  reader can derive heading and orientation. Optional `mode` declares which way
  the body is meant to point: `"velocity"` (default, forward along velocity),
  `"antivelocity"` (retrograde/braking attitude) or `"fixed"` (attitude
  unrelated to the velocity, e.g. a parked or landed vehicle). `npm test` checks
  the heading against the declared mode.
- `maneuvers` (array, optional): ordered burn records, see *Maneuvers* below.
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

The renderer interpolates **position with cubic Hermite** through the sample
positions and velocities, so a sparsely sampled curved arc stays smooth; velocity
lerps and orientation slerps. Samples may therefore be as far apart as the
trajectory's curvature allows (60–120 s on a coast, 1–10 s through a burn).

## Maneuvers

A track may carry an ordered `maneuvers` array describing the burns that
produced its ephemeris (ADR-0004). The samples remain the ground truth; the
maneuver records are validated *against* them.

```json
{
  "id": "TLI",
  "kind": "finite",              // impulsive | finite | constant
  "t_start": 9856,
  "t_end": 10213,                // required unless kind is "impulsive"
  "dv_mps": 3040,                // velocity change of the burn
  "dv_frame": "ECI",
  "accel_mps2": 8.9,             // or thrust_n + mass_kg
  "thrust_n": 1000000,
  "isp_s": 421,
  "mass_kg": { "start": 115000, "end": 53000 },
  "attitude": "prograde",
  "note": "S-IVB restart, 5 m 57 s"
}
```

- `kind`: `impulsive` (a velocity step between two consecutive samples),
  `finite` (a burn with a duration) or `constant` (continuous low thrust).
- `dv_mps`: the burn's velocity change. `npm test` compares it with the samples —
  the vector step for an impulsive burn, the **speed change** for a prograde or
  retrograde finite burn (the vector turns under gravity during the burn, so its
  magnitude difference is not the dv).
- `gravity_loss_mps`: optional, for a burn that also lifts the vehicle. A launch
  burn's thrust integral is always larger than the speed it gains, so the samples
  check compares against `dv_mps - gravity_loss_mps` (the LM ascent spends
  1 920 m/s of thrust to gain 1 650 m/s). Must be non-negative and below `dv_mps`.
- `accel_mps2` **or** `thrust_n` + `mass_kg.start`: the validator checks
  `dv_mps / (t_end - t_start)` against it (15 % tolerance, which absorbs gravity
  and steering losses). If `isp_s` and both masses are present, the rocket
  equation must also agree with `dv_mps` (10 %).
- `attitude`: `prograde` | `retrograde` | `fixed`, used to interpret the burn.

### Attitude

Each sample carries `orientation`, a unit quaternion for the body frame. The model's
forward axis is `-Z` (a track may override it with `attitude.forward`), and
`attitude.mode` says what the forward axis tracks: `velocity` (nose first, the
default), `antivelocity`, or `fixed`.

A burn is not flown nose-first: the engine points along the thrust, so a
**retrograde burn flies tail-first** and a plane change is off-axis. The validator
therefore exempts samples inside a manoeuvre window (±400 s around it) from the
heading check and requires nose-first everywhere else. `npm run attitude` rewrites
the orientations from the manoeuvres: cruise attitude from the velocity, the thrust
attitude held through each burn, and a slew in and out at 1.5 °/s with samples
added every 5 s so the renderer's slerp is smooth.

## Burn direction

Magnitude alone cannot describe a plane change, so a burn may also say *which
way it pushed*. Three forms, in order of precedence:

```json
"dv_direction": "prograde",        // one of the six core directions
"dv_rtn": [-53.9, 42.7, 5.0],      // [radial, transverse, normal] m/s
"dv_vector": [42.2, -49.3, -23.3]  // explicit inertial vector, in dv_frame
```

The six core directions are taken in the vehicle's local **RTN** frame at
ignition, built from the state itself:

| Direction | Axis | Meaning |
|---|---|---|
| `prograde` | `+T` | along the velocity (raises the opposite apsis) |
| `retrograde` | `−T` | against the velocity |
| `normal` | `+N` | along the orbit normal `(r × v)/|r × v|` |
| `anti-normal` | `−N` | against the orbit normal |
| `radial-out` | `+R` | away from the central body (`r̂`) |
| `radial-in` | `−R` | toward the central body |

with `T = N × R`. Use `dv_rtn` when the burn is a mix (any real midcourse
correction is), and `dv_vector` when you already have inertial components.

`attitude` and `dv_direction` answer different questions: `attitude` is where the
*vehicle* points, `dv_direction` is where the *thrust* goes. They coincide for a
well-flown burn and differ for a gimballed or off-axis one.

What the validator checks:

- **Impulsive** burns: the observed velocity step must match the declared
  direction within ~11° (dot ≥ 0.98). This catches a burn labelled prograde that
  was actually retrograde.
- **Finite / constant** burns: only the *sense* is checked (speed must rise for
  prograde, fall for retrograde). A long burn's velocity vector rotates under
  gravity, so its net step is not its thrust direction — Apollo 11's TLI is a
  3 037 m/s prograde burn whose net velocity change is 4 421 m/s, at ~57° to the
  initial prograde.
- `dv_vector` / `dv_rtn` are checked by direction and, through `dv_mps` or their
  own magnitude, by size.

### Events with duration

A burn is an interval, so an event may carry `t_end`. The timeline draws a bar
for it; maneuvers with a duration draw their own bars without needing a
duplicate event.

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
- `type` (string, optional): category used for marker styling. `"phase"` marks
  the start of a mission phase — the header's PHASE readout shows the last phase
  event at or before the current time, and every event is a click-to-jump target
  on the scrub bar. `"milestone"` is the other convention used by the Apollo 11
  scenario for one-off events (docking, EVA start, splashdown). `"explosion"`
  additionally drives a renderer explosion effect at the event's position (see
  below).
- `track` (string, optional): for `"explosion"` events, the id of the tracked
  object that exploded. The effect is anchored to that track's interpolated world
  position at `t`. Omitting it anchors the effect to the scenario's first
  non-celestial track; a track with no state at `t` falls back to Earth.
- `radius_m` (number, optional): for `"explosion"` events, the final radius of
  the fireball in metres (default 25 000). Apparent size still adapts to camera
  distance so it stays readable from any range.
- `duration_s` (number, optional): for `"explosion"` events, how many
  mission-seconds the fireball takes to expand and fade out (default 60).
  Nothing remains at the site afterwards.
- `label` (string, required): short text shown as the marker label and tooltip.
- `description` (string, optional): fuller detail shown in the marker tooltip.

### Explosion events

A `type: "explosion"` event makes the renderer draw a low-poly fireball — a
faceted orange sphere — at the host track's position at that epoch. It pops to
full size almost instantly, swells a little, and fades out over `duration_s`;
nothing is left behind. The effect is driven by the scenario data alone — any
scenario can carry one by adding an event; a scenario with none draws nothing.
The explosion does not change the trajectory (an accident that does not perturb
the orbit, like Apollo 13's tank rupture, must not produce a jolt in the track).

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
