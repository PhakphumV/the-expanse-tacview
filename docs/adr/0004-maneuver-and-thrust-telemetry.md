# ADR-0004 — Maneuvers, thrust and wide-scale trajectory telemetry

- Status: accepted (items 1, 3, 4, 5 and 7 implemented; items 2 and 6 deferred
  until an interplanetary scenario needs them)
- Date: 2026-11

## Context

The contract today is a state-vector ephemeris: tracks of samples
`{t, position[m], velocity[m/s], orientation[x,y,z,w]}` plus point events
`{t, type, label, description}`, with an optional OMM `mean_elements` block. Phase 1
already models a finite burn (TLI: 357 s at 8.9 m/s²) purely by sampling it densely.

Before Phase 2 (trans-lunar coast with MCC-2) and before any Expanse-style
scenario, the question is whether that contract can express:

1. an arbitrary velocity change (impulsive ΔV),
2. manoeuvring in general (finite burns, mid-course corrections, plane changes),
3. constant-thrust trajectories,
4. a brachistochrone transfer (continuous high thrust, flip at midpoint).

## Findings

### 1. Impulsive ΔV — representable, not describable

A burn is a velocity discontinuity, and the sample stream can hold one: put two
samples ≤1 s apart with the pre- and post-burn velocity. But nothing in the data
says *a burn happened*, how big it was, in which frame, or what produced it. The
engine (`js/ephemeris.js:interp`) lerps velocity component-wise across the
bracket and lerps position through it, so an impulsive burn smears over one
interval and cuts the corner. Nothing can be verified or displayed.

### 2. Finite / constant-thrust arcs — representable, unverifiable

Dense sampling is enough (Phase 1 proves it). Missing: `thrust`, `mass`,
`isp`, burn interval, so the HUD cannot show ΔV used, the timeline cannot draw a
burn as a bar (events are points, no `t_end`), and the validator cannot check
that the arc's measured acceleration matches the declared thrust.

### 3. Brachistochrone — the data fits, everything around it does not

The sample format is agnostic, so a brachistochrone transfer can be expressed.
What breaks is scale, precision and attitude convention:

| Constraint | Today | Brachistochrone need |
|---|---|---|
| Rendering scale | camera near 1 m / far 1e9 m (`scene.js`), zoom clamp 50 m … 9e8 m (`camera.js`), trail width ceiling 4e6 m, dash scaling | 1 AU = 1.5e11 m (Earth–Mars ≈ 75–150 Gm) |
| Precision | float32 buffers: ~60 m quantisation at 1e9 m | ~9 km quantisation at 1 AU — jitter on bodies and trails |
| Interpolation | linear position between samples | 1 g arcs are parabolic; 60 s spacing visibly chords |
| Attitude | validator asserts `forward · v̂ ≥ 0.98` for every sample ≥1 m/s | engines-first deceleration and flip-and-burn ships point *anti-velocity*; the check would reject them |
| Sampling | manual, seconds | weeks at 1 s = millions of samples (tens of MB) |

Reference figures (1 g, flip at midpoint): Earth–Mars 0.5 AU ≈ 1.4 days, peak
606 km/s, ΔV 1 211 km/s; 1 AU ≈ 2.0 days, peak 857 km/s; Earth–Jupiter 4.2 AU
≈ 4.1 days, peak 1 755 km/s. Durations are fine for the timeline; distances and
speeds are what the renderer cannot take.

## Decision (proposed)

Keep the ephemeris as the single source of truth and add *descriptive* metadata
that is validated against it — not a second trajectory model.

1. Track-level `maneuvers: []`, ordered:
   ```json
   { "id": "TLI", "kind": "finite", "t_start": 9856, "t_end": 10213,
     "dv_mps": 3050, "dv_frame": "ECI", "thrust_n": 1000000, "isp_s": 421,
     "mass_kg": { "start": 115000, "end": 83000 },
     "attitude": "prograde", "note": "S-IVB restart, 5 m 57 s" }
   ```
   `kind`: `impulsive` | `finite` | `constant`. For `impulsive`, `t_end` is omitted
   and the velocity step must land on a sample boundary.
2. Optional per-sample `thrust` (bool) or `mass_kg`, so a trail can render burn
   segments; derivable from `maneuvers` when absent.
3. Events gain optional `t_end`, so a burn renders as a bar rather than a tick.
4. `attitude.mode`: `"velocity" | "antivelocity" | "fixed"` — a declared sign
   convention, so the heading check and any generator agree on which way the
   body points during a retrograde or braking burn.
5. Engine: cubic Hermite position interpolation from sample positions *and*
   velocities (velocity lerp, orientation slerp), falling back to linear when a
   neighbour has no usable velocity. This is what allows sparse sampling.
6. Per-scenario render scale: `render_scale` (metres per world unit),
   `near_m`/`far_m`, zoom range, and a logarithmic depth buffer for large scenes.
   Positions stay in metres in the data; only the render layer rescales.
7. Validator additions: maneuver ordering and window containment; impulsive
   `dv_mps` vs the measured velocity step (±1%); finite/constant arcs' measured
   acceleration vs `thrust_n / mass_kg` (±10%); Tsiolkovsky consistency when
   `isp_s` and masses are present; attitude-convention sign.

## Consequences

- Phase 2 needs items 1, 3, 4, 5 and 7 only; TLI from Phase 1 can be retrofitted
  as a `maneuvers` record, which immediately gives the HUD a ΔV readout and the
  validator a physical check on the burn.
- Brachistochrone needs items 2 and 6 plus the scale work. The data format does
  not change again.
- Estimated cost: ~150 lines across `ephemeris.js`, `validate-telemetry.js`,
  `entities.js`, `hud.js`, `timeline.js`; no new dependencies, still no build step.

## Alternatives rejected

- **A second trajectory representation** (thrust/acceleration records the runtime
  propagates): duplicates the ground truth, forces a propagator into the page, and
  breaks the "data is what you see" property.
- **Uniform 1 s sampling everywhere**: millions of samples for a brachistochrone
  and still facetted under linear interpolation.
- **Storing all positions in AU or km**: hides the unit from the renderer that
  needs metres; a scenario-level render scale is less invasive.
