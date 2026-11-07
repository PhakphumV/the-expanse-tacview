# Telemetry and scenario guide

Everything the viewer draws comes from one JSON file: `data/scenarios.json`.
This guide is for anyone adding a scenario — a mission, a launch, a docking, a
transfer — and the telemetry behind it.

- The **contract** (what a field means) is [SCHEMA.md](../SCHEMA.md).
- The **decisions** behind the contract are in [`docs/adr/`](adr/).
- This guide is the **how-to**: data flow, a minimal example, recipes for
  generating trajectories, validation rules, and the traps worth knowing.

---

## 1. How data reaches the screen

```
data/scenarios.json            canonical source (you edit this)
        │  npm run embed
        ├── js/scenarios-data.js      manifest: ids, names, hints, counts (no samples)
        └── js/scenario-<id>.js       one payload per scenario: tracks + events
                │  loaded on demand by js/scenario-loader.js
                ▼
        js/ephemeris.js          decodes samples, interpolates by time
                ▼
        js/entities.js / scene / hud / timeline / camera
                ▼
        one scenario resident in memory at a time
```

Rules that follow from this:

- **Never hand-edit** `js/scenarios-data.js` or `js/scenario-<id>.js`; they are
  generated. Edit `data/scenarios.json`, then run `npm run embed`.
- Adding a scenario means adding an entry to `data/scenarios.json`; the loader
  picks it up automatically and the SCENARIO dropdown lists it.
- The page has no build step and no `fetch`, so it also runs from `file://`.

---

## 2. The data model in one picture

```
scenario  (a replayable mission)
 ├── events     [ { t, t_end?, type, label, description } ]     timeline markers
 └── tracks     [ track ]
        ├── samples    [ { t, position[3], velocity[3], orientation[4] } ]
        ├── maneuvers  [ { id, kind, t_start, t_end?, dv_mps, … } ]   burns
        └── meta       id, OBJECT_NAME, REF_FRAME, attitude, SOURCE, …
```

`samples` are the ground truth: where the object is and how it is moving at
each instant. Everything else describes or decorates them.

---

## 3. Minimal complete example

A 10-minute low-Earth-orbit pass with one impulsive burn. These exact numbers
pass `npm test` — the samples are a 400 km circular orbit at 51.6° inclination,
with the burn bracketed by two samples 0.05 s apart. Save it as a scratch file
while you experiment, then splice it into `data/scenarios.json`.

```json
{
  "id": "demo",
  "name": "Demo — 10 min orbit",
  "description": "One spacecraft, one burn.",
  "epoch": "2026-01-01T00:00:00Z",
  "duration_s": 600,
  "default_speed": 8,
  "default_target": "DEMO-1",
  "view_distance_m": 20000000,
  "tracks": [
    {
      "id": "DEMO-1",
      "OBJECT_NAME": "DemoSat",
      "CENTER_NAME": "EARTH",
      "REF_FRAME": "ICRF",
      "TIME_SYSTEM": "UTC",
      "kind": "object",
      "SOURCE": "Synthetic circular orbit, 400 km, i = 51.6 deg, one 10 m/s prograde burn at t = 300 s",
      "attitude": { "frame": "ECItoBody", "forward": [0, 0, -1], "up": [0, 1, 0], "mode": "velocity" },
      "maneuvers": [
        { "id": "BURN-1", "kind": "impulsive", "t_start": 300, "dv_mps": 10,
          "dv_frame": "ECI", "attitude": "prograde" }
      ],
      "samples": [
        { "t": 0, "position": [6771000, 0, 0],
          "velocity": [0, 4765.818, 6012.966],
          "orientation": [0.94437637, 0, 0, 0.32886665] },
        { "t": 300, "position": [6383511.966, 1402366.264, 1769345.88],
          "velocity": [-2558.328, 4493.082, 5668.858],
          "orientation": [0.81028401, 0.46136981, 0, 0.36135539] },
        { "t": 300.05, "position": [6383384.039, 1402590.916, 1769629.32],
          "velocity": [-2562.073, 4498.848, 5676.133],
          "orientation": [0.81024481, 0.46143064, 0, 0.36136563] },
        { "t": 600, "position": [5265397.878, 2644224.436, 3336180.947],
          "velocity": [-4830.129, 3710.919, 4682.015],
          "orientation": [0.54652431, 0.71135555, 0, 0.44191001] }
      ]
    }
  ],
  "events": [
    { "t": 0, "type": "phase", "label": "COAST", "description": "Start of the replay." },
    { "t": 300, "type": "milestone", "label": "BURN-1", "description": "10 m/s prograde." }
  ]
}
```

Then:

```bash
npm run embed   # regenerate js/scenario-demo.js + the manifest
npm test        # 10 data checks + 14 trail-maths checks
```

…and open `index.html`. Two samples are enough only because the demo is short;
see §6 before you sample a real trajectory this coarsely.

---

## 4. Field reference

### Scenario

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique, kebab-case; becomes the payload filename `js/scenario-<id>.js`. |
| `name` | yes | The label in the SCENARIO dropdown. |
| `description` | no | Shown in the manifest, useful for provenance. |
| `tracks` | yes, non-empty | The objects and bodies in the scenario. |
| `events` | no | Timeline markers; `type: "phase"` drives the header PHASE readout. |
| `epoch` | no | ISO 8601 UTC instant that `t = 0` means. Provenance and honesty. |
| `duration_s` | no | Replay length. Defaults to the union of track windows and events; set it to end at a milestone. |
| `default_speed` | no | Playback multiplier selected on load (1 by default). |
| `default_target` | no | Target id framed on load (`"earth"` by default). |
| `view_distance_m` | no | Framing distance in metres for that initial shot. |

### Track

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Used by the HUD, camera and labels. Must be unique in the scenario. |
| `samples` | yes, non-empty | Time-ordered state vectors (§5). |
| `kind` | no | `"object"` (default) or `"celestial"` (a body: sphere + subtle trail). |
| `radius_m` | celestial only | Body radius in metres. |
| `attitude` | yes | `frame`, `forward`, `up`, and optional `mode`: `velocity` (default), `antivelocity`, `fixed`. |
| `maneuvers` | no | Burn records, ordered by `t_start` (§7). |
| `SOURCE` | no, but expected | Where the numbers came from. Be specific: dataset, document, model, assumptions. |
| `OBJECT_NAME` / `OBJECT_ID` / `NORAD_CAT_ID` | no | Identification, shown in the HUD and labels. |
| `CENTER_NAME` / `REF_FRAME` / `TIME_SYSTEM` | recommended | Provenance; the renderer does not transform frames (§5). |
| `mean_elements` | no | Nominal-orbit descriptor (OMM-style). Never used as render data. Celestial tracks must include `SEMI_MAJOR_AXIS`. |

### Event

| Field | Required | Meaning |
|---|---|---|
| `t` | yes | Seconds from scenario start. |
| `label` | yes | Text on the marker / in the tooltip. |
| `type` | no | `phase` (phase start, drives the header) or `milestone`; the CSS class follows the type. |
| `description` | no | Tooltip detail. |
| `t_end` | no | Makes the marker a bar (for something with a duration). |

---

## 5. Samples, units and conventions

```json
{ "t": 1234.5, "position": [x, y, z], "velocity": [vx, vy, vz], "orientation": [qx, qy, qz, qw] }
```

- **Units**: metres, metres per second, seconds, unit quaternion `[x, y, z, w]`.
- **Time**: strictly ascending `t`, seconds from the scenario's `epoch`. Tracks
  may start and end anywhere; `null` is returned outside a track's window.
- **Frame**: one inertial frame per scenario, shared by every track. The viewer
  copies the numbers straight into Three.js world coordinates — there is **no
  transform**, so pick a frame (ICRF/ECI/TEME) and be consistent. Mixing frames
  inside a scenario is the most common way to get a silently wrong scene.
- **Orientation**: a unit quaternion rotating the inertial frame into the body
  frame. `attitude.forward` names the body axis that points along the velocity
  for `mode: "velocity"`. If you only have a velocity vector,
  `quatFromMinusZ(unit(v))` is the convention used throughout this repo.
- **Idle samples**: below 1 m/s (parked, landed) the heading check is skipped, so
  a zero velocity with an identity quaternion is legal.
- **Rounding**: 3 decimals on position/velocity (mm and mm/s) and 8 on the
  quaternion is plenty and keeps files small.

---

## 6. Sampling, and what interpolation does with it

Position is interpolated with **cubic Hermite** through the sample positions *and
velocities*; velocity lerps and orientation slerps. Practical consequences:

- Sample spacing is set by curvature, not by a fixed rule. On a straight coast
  120 s is smooth; through a burn or a close lunar pass use 1–10 s.
- A sample's `velocity` is not decoration — it is the tangent used by the
  interpolation. If velocity and the path disagree, the curve will wiggle.
- Where two phases meet, **the sample grids collide**. Push every sample through
  a `Map` keyed by `Math.round(t * 1000)` so the later push wins deliberately
  instead of silently duplicating a `t`.
- After generating, always run a continuity check: for every adjacent pair,
  `|Δr| / (½(v_i + v_i+1)·Δt)` should be ≈ 1.0. This catches joins and typos
  instantly — a 9 000 km jump in one second looks exactly like this.

---

## 7. Maneuvers

```json
{
  "id": "TLI",
  "kind": "finite",           // impulsive | finite | constant
  "t_start": 9856,
  "t_end": 10213,             // required unless impulsive
  "dv_mps": 3040,
  "dv_direction": "prograde", // one of the six core directions
  "dv_frame": "ECI",
  "accel_mps2": 8.9,          // or thrust_n + mass_kg.start
  "attitude": "prograde",     // prograde | retrograde | fixed
  "note": "S-IVB restart, 5 m 57 s"
}
```

- **Direction.** Say which way the burn pushed, in one of three forms: one of the
  six core directions (`prograde`, `retrograde`, `normal`, `anti-normal`,
  `radial-out`, `radial-in`) plus `dv_mps`; an RTN triplet
  `"dv_rtn": [radial, transverse, normal]`; or an inertial
  `"dv_vector": [x, y, z]`. RTN is built from the state at ignition —
  `R = r̂`, `N = (r × v)/|r × v|`, `T = N × R` — so a "prograde" burn is along
  the velocity at that instant. Real midcourse corrections are mixes; Apollo 11's
  MCC-2 here is `[-53.9, 42.7, 5.0]` m/s (mostly radial, with a transverse kick).
- `attitude` is the vehicle's pointing, not the thrust direction; they usually
  coincide and need not.
- **Impulsive**: put two samples either side of `t_start` and let the velocity
  step. Make the bracket **tight** — 0.05 s, not 1 s. At orbital speed the
  velocity direction turns about 8 m/s per second, so a 1 s bracket reports a
  13 m/s step for a 10 m/s burn. That is what the validator measures.
- **Finite / constant**: sample the burn densely and declare the acceleration
  (`accel_mps2`, or `thrust_n` + `mass_kg.start`). `dv_mps` is the burn's
  velocity change; the validator compares it with the **speed** change for
  prograde/retrograde burns, because the velocity *vector* also turns under
  gravity during a long burn (Apollo's TLI: 4 421 m/s of vector change for
  3 037 m/s of speed change).
- Optional `isp_s` + `mass_kg: {start, end}` enables a rocket-equation check.
- A burn that also lifts the vehicle declares `gravity_loss_mps`: the thrust
  integral exceeds the speed gained, so the samples check compares against
  `dv_mps - gravity_loss_mps` instead of `dv_mps` (the Apollo 11 LM ascent
  spends 1 920 m/s of thrust to gain 1 650 m/s of speed over 593 s).
- The validator checks an **impulsive** burn's step against the declared
  direction (dot ≥ 0.98, ~11°) but only the **sense** of a finite burn (speed
  must rise for prograde, fall for retrograde): during a long burn the velocity
  vector rotates under gravity, so Apollo 11's 3 037 m/s prograde TLI shows a
  4 421 m/s net step at ~57° to the initial prograde.
- Maneuvers appear as bars on the timeline, and the HUD shows cumulative ΔV.

---

## 8. Recipes

All of these are plain Node — no dependencies — and belong in a throwaway script
you delete afterwards (the repo never gains build tooling).

### Two-body propagation (RK4)

```js
const MU = 3.986005e14;
const accel = (r) => r.map((c) => -MU * c / Math.hypot(...r) ** 3);
function rk4({ r, v }, dt) {
  const a1 = accel(r);
  const v2 = v.map((c, i) => c + a1[i] * dt / 2), r2 = r.map((c, i) => c + v[i] * dt / 2);
  const a2 = accel(r2);
  const v3 = v.map((c, i) => c + a2[i] * dt / 2), r3 = r.map((c, i) => c + v2[i] * dt / 2);
  const a3 = accel(r3);
  const v4 = v.map((c, i) => c + a3[i] * dt),  r4 = r.map((c, i) => c + v3[i] * dt);
  const a4 = accel(r4);
  return {
    r: r.map((c, i) => c + dt / 6 * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i])),
    v: v.map((c, i) => c + dt / 6 * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i])),
  };
}
```

Every stage must be evaluated **from the base state** (`v3 = v + a2·dt/2`, not
`v2 + a2·dt/2`). Incremental stages leak energy: a 185 km orbit decays hundreds
of kilometres per revolution.

### Constant-thrust arc (and the brachistochrone case)

Add the thrust to the acceleration instead of special-casing it:

```js
const accel = (r, v, thrustN, massKg) => {
  const g = r.map((c) => -MU * c / Math.hypot(...r) ** 3);
  const vh = Math.hypot(...v);
  return g.map((c, i) => c + thrustN / massKg * v[i] / vh);
};
```

A flip-and-burn transfer is the same integrator with the thrust direction
reversed at the midpoint. It is fully expressible in this schema (declare
`kind: "constant"`), but note §10 — the *renderer* is sized for cislunar
distances, not interplanetary ones.

### Earth + Moon gravity (cislunar)

```js
const MU_M = 4.9048695e12;
const accel = (r, moonPos) => {
  const toMoon = r.map((c, i) => c - moonPos[i]);
  return r.map((c, i) =>
    -MU * c / Math.hypot(...r) ** 3
    - MU_M * toMoon[i] / Math.hypot(...toMoon) ** 3);
};
```

Read the Moon's position from the scenario's own celestial track so the
spacecraft and the body are guaranteed to agree.

### Celestial track from JPL Horizons

Fetch geocentric state vectors as CSV and reshape:

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='301'
  &EPHEM_TYPE='VECTORS'&CENTER='500@399'&START_TIME='1969-07-16 13:32'
  &STOP_TIME='1969-07-24 18:00'&STEP_SIZE='15 m'&REF_PLANE='FRAME'
  &REF_SYSTEM='ICRF'&OUT_UNITS='KM-S'&VEC_TABLE='2'&CSV_FORMAT='YES'
```

Convert km → m, km/s → m/s, set `t` from the Julian-date difference, and set
`kind: "celestial"`, `radius_m`, and
`mean_elements.SEMI_MAJOR_AXIS` (the validator requires every sample to sit
within 5 % of it — real lunar distances vary ±5.5 % from the mean, so use the
*semi-major axis*, not the mean distance).

### Aiming at a target

For a transfer, either solve a Lambert arc between the two positions and use its
initial velocity, or — usually simpler — propagate a first guess and solve a
small correction: perturb each velocity component, differentiate the miss
vector numerically, and Newton-iterate. A 3-component burn can hit a 3-D point
to metres in a handful of iterations; that is how Apollo 11's MCC-2 in this repo
was produced.

---

## 9. Validation — `npm test`

Ten checks run against `data/scenarios.json`; any failure names the field. A
second suite (`scripts/test-trails.js`, 14 checks) covers the trail-geometry
maths in `js/trails.js`.

| # | Check | What fails it |
|---|---|---|
| 1 | Dataset shape | Missing ids, tracks, samples, frames, attitude, numbers that are not finite. |
| 2 | JS syntax | Any `js/*.js` module that no longer parses. |
| 3 | Sample ordering | `t` not strictly ascending in a track. |
| 4 | Unit quaternion | Quaternion norm off unit by more than 1e-4. |
| 5 | Heading | `forward·v̂ < 0.98` for `mode: velocity` (or > −0.98 for `antivelocity`); skipped below 1 m/s. |
| 6 | Events | Non-finite `t`, missing label, events out of order. |
| 7 | Celestial tracks | Missing `radius_m` / `SEMI_MAJOR_AXIS`, or a sample more than 5 % off it. |
| 8 | Scenario fields | Bad `epoch`, non-positive `duration_s` / `default_speed` / `view_distance_m`, `duration_s` ending before the last event. |
| 9 | Embedded sync | `npm run embed` not re-run after editing the dataset. |
| 10 | Maneuvers | Out of order, outside the track window, or a `dv_mps` that the samples do not show (10 %), an implied acceleration that disagrees with `accel_mps2`/thrust (15 %), or a rocket equation that disagrees with `dv_mps` (10 %). |

Check 10 is the valuable one: it makes the *description* of the motion prove
itself against the motion.

---

## 10. What the viewer does with your data

- **Trail**: the last eighth of the object's orbit (celestial bodies: 0.45 of the
  orbit — almost half the ring), but only the last **60 minutes** when the object
  is on a transfer trajectory (open or near-escape arc, e ≥ 0.9) — a trans-lunar
  coast would otherwise draw 27 hours of ribbon. That cap is applied as a length
  through the same low-pass as the orbit rule, so it eases in and out rather than
  snapping. Width scales with camera
  distance, so the band holds its apparent size at any zoom. Vertices are spread
  by arc length, not by time. Celestial bodies get a dimmer, thinner version. A
  trail longer than the track's own history stops at the first sample, so give a
  celestial track a pre-roll (`npm run preroll`) if you want its full arc.
- **Path line**: the whole track as a dashed line; dashes rescale with zoom.
- **Labels/HUD**: one label per track; HUD shows altitude, speed, position,
  cumulative ΔV, plus lunar altitude for cislunar tracks.
- **Camera**: 50 m … 9e8 m zoom range, near/far planes at 1 m / 1e9 m. A
  scenario living at interplanetary distances (1e11 m) will need the render-scale
  work from ADR-0004 item 6 — not implemented yet.
- **Bodies and vehicles** keep a minimum apparent size (1.2 % of the view), so
  they stay visible at cislunar range; below that they are true scale.
- **Memory**: exactly one scenario payload is resident. The browser keeps the
  file in cache, so switching back is instant.

---

## 11. Size and performance

- The Apollo 11 payload is ~1.6 MB for 10 520 samples (~155 B/sample embedded).
  Keep individual scenarios in that order; a 100 000-sample scenario is a 15 MB
  download and a slow decode.
- Budget: 10 s through burns and close passes, 30–120 s on coasts. Sparse
  sampling is safe now that interpolation is Hermite — use it.
- Generation code stays outside the repo. The repo's rule is "data + a small
  runtime", not "a build pipeline".

---

## 12. Honesty rules

The viewer's whole value is that it does not quietly invent trajectory physics.

- Put a real `SOURCE` on every track: dataset and version, or "reconstructed
  from <document>, propagated two-body, launch phase unconstrained".
- If a term is solved rather than published (e.g. a retargeting burn), say so in
  the maneuver `note` and, if it is large, in `docs/apollo11-phases.md`-style
  notes.
- Do not mix a real ephemeris with a synthetic one in a way the reader cannot
  tell apart; mark `kind` and `SOURCE` so they can.

---

## 13. Before you open a PR

1. `npm run embed && npm test` — 10/10.
2. Open the scenario in a browser: scrub it, jump the phase markers, watch the
   trail through every burn. Check for jumps (continuity ratio ≈ 1.0) and for
   segments where the vehicle looks "stuck".
3. Confirm the payload size is reasonable and the scenario loads from
   `file://` as well as over HTTP.
4. Update `README.md` (features) and, if you changed the contract, add or amend
   an ADR in `docs/adr/`.
