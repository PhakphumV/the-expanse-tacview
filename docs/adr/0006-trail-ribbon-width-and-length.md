# ADR-0006 — Trail ribbons: thinner for craft, length from orbit geometry

- **Status:** accepted — implemented in `js/trails.js` + `js/entities.js`
- **Date:** 2026-11-07
- **Related:** `js/entities.js` (ribbon builder), `data/scenarios.json` (celestial
  sample coverage), ADR-0001 (state vectors as render source)

## Context

Ribbons are built in `js/entities.js` from four constants:

```js
const TRAIL_SECONDS = 300;        // every track, regardless of orbit
const TRAIL_SAMPLES = 60;         // vertices along the ribbon
const WIDTH_MIN = 40;             // m
const WIDTH_MAX = 4e6;            // m
const WIDTH_DIST_SCALE = 0.02;    // width ≈ 2 % of camera distance
```

Two problems.

1. **Width.** A craft's ribbon is 2 % of the camera distance — on a 1000 px tall
   canvas a 20 px band. For a 26 m vehicle that is a fat stripe competing with
   the orbit rings.
2. **Length.** A flat 300 s means the trail's *length* depends entirely on speed,
   which is backwards: 300 s is 2,300 km in LEO (5 % of an orbit — barely a
   stub) and 300 s is 460 km in trans-lunar coast (0.03 % — invisible). The
   trail should express how far the object has come **relative to its own
   orbit**, not a fixed number of seconds.

Requested behaviour: halve the craft ribbon width, keep it proportional to the
zoom level, and size the length by object scale — celestial bodies get almost
half the orbit ring, spacecraft at least an eighth.

## Decision

### 1. Width: halve the craft factor, keep it zoom-relative

`WIDTH_DIST_SCALE` stays the mechanism (width ∝ camera distance → constant
apparent size at any zoom). Craft ribbons take half of it:

| Style | factor | apparent width | on a 1000 px canvas |
|---|---|---|---|
| `OBJECT_TRAIL` (now) | 0.02 | 2 % of view | 20 px |
| `OBJECT_TRAIL` (proposed) | 0.01 | 1 % of view | 10 px |
| `CELESTIAL_TRAIL` | 0.02 × 0.55 | ~1.1 % of view | 11 px |

Implemented as `widthScale: 1.0 → 0.5` on `OBJECT_TRAIL`, so the per-style hook
that already exists does the work and the celestial trail is untouched. The
`WIDTH_MIN` / `WIDTH_MAX` clamps stay (40 m floor keeps a 26 m craft visible at
close range; 4e6 m ceiling stops the band from swallowing a 400,000 km view).

### 2. Length: a fraction of the osculating orbit, not a fixed time

```
L_target = fraction × P(state)          P = 4a·E(e), the ellipse perimeter
fraction = 0.45   celestial
           0.125  spacecraft
L        = clamp(L_target, 1e4 m, 0.35 × track_arc_length)
```

- `P` comes from the state at the current instant: `a = 1 / (2/r − v²/µ)` and
  `e` from the angular momentum, then Ramanujan's perimeter
  `π(3(a+b) − √((3a+b)(a+3b)))` with `b = a√(1−e²)`.
- **Use the perimeter, not `2πa`.** For near-circular orbits they agree to 0.1 %
  (the Moon at e = 0.055, every LEO row), but for COLUMBIA's trans-lunar orbit
  (e = 0.977) `2πa` overstates the path by **48.8 %** — 1.80 million km instead
  of 1.21 million. That error would inflate the trail by 74,000 km.
- **Celestial** 0.45 × P is "almost half the orbit ring" (the ring drawn from
  mean elements is a near-circular body, where P ≈ 2πa).
- **Spacecraft** 0.125 × P is the requested minimum — an eighth of a revolution.
- The `0.35 × track arc` cap is a presentation guard, not physics: it stops one
  eccentric coast from owning the screen, and for the current data it does not
  bite (172,700 km vs a 151,269 km trail).

Resulting lengths, from the actual data in the repo:

| Track | a (km) | e | P (km) | P/8 (km) | P/2 (km) | trail | window at v |
|---|---|---|---|---|---|---|---|
| ISS (LEO) | 6 797 | 0.0002 | 42 708 | 5 339 | 21 354 | 5 339 km | 12 min |
| TIANHE (LEO) | 6 762 | 0.0005 | 42 485 | 5 311 | 21 242 | 5 311 km | 12 min |
| COLUMBIA, parking | 6 557 | 0.0002 | 41 196 | 5 149 | 20 598 | 5 149 km | 11 min |
| COLUMBIA, trans-lunar | 286 540 | 0.977 | 1 210 155 | 151 269 | 605 077 | 151 269 km | 27 h |
| Moon (mean ring) | 384 748 | 0.0549 | 2 415 620 | 301 953 | 1 207 810 | 1 087 029 km | 12.3 d |

The trans-lunar row is the one to look at: an eighth of a very eccentric orbit is
151,000 km — 27 hours of coast, a third of the whole visible trajectory. Either
it reads as a magnificent comet tail or it swamps the scene; the cap exists so
the answer is "tail" not "swamp", and it stays in reserve rather than trimming
today's data.

### 3. Fallbacks for states that have no orbit

Three cases need a defined answer, because `a` is meaningless or absurd:

| State | Rule |
|---|---|
| `v < 100 m/s` (on the pad, or a parked body) | time-based floor, 300 s (today's behaviour) |
| `e ≥ 1` w.r.t. Earth (escape, or near the Moon) | recompute about the **dominant body** — the one with the largest `µ/r²`: Earth or the Moon |
| `e ≥ 1` about that too, or `a` > 1e9 m | time-based floor, 300 s |

The dominant-body rule is what makes the Apollo track sane near the Moon: at
LOI the craft is hyperbolic w.r.t. Earth (`a < 0`) but in a clean lunar orbit,
so the trail is sized against the Moon's gravity instead of falling back to a
stub.

### 4. Length → time window

`L` is a distance, the renderer needs `[t−T, t]`. Solve `∫ v dt = L` backwards
from `t` by bisection (8 iterations, ≤ 8 % error), cached at 5 Hz — not per
frame.

Target length is low-passed (τ = 0.5 s of wall time) so regimes that change by
orders of magnitude — pad → ascent → orbit, orbit → TLI — glide instead of
popping. The cap and the fallbacks run *before* the filter, so the filter never
sees a discontinuity in sign.

### 5. Sampling: uniform in arc length, fixed budget

Today the ribbon places its 60 vertices uniformly in *time*, so a coast spends
its vertices on nothing and a perigee pass under-samples the fast part. Change to:

- Walk the window, accumulate distance, place **128 vertices at equal arc-length
  spacing** (41.7 km per vertex for a LEO eighth, 1 182 km across the trans-lunar
  trail, 8 493 km for the lunar 0.45-orbit — each smooth at its natural zoom).
- Keep the head vertex pinned to the object at `t`.
- Preallocate one `Float32Array` per attribute at 128 × 2 vertices; rewrite in
  place, never reallocate (`geometry.attributes.position.needsUpdate = true`).
- Fade by **arc-length fraction**, not by time, so a 13.7-day lunar trail has the
  same head-to-tail falloff as an 11-minute LEO trail.

### 6. Celestial history has to exist

Half a lunar orbit is 13.7 days of ephemeris (0.45 of it, 12.3 days), but the
tracks do not carry it:

| Track | span | needed for 0.45 · P | gap |
|---|---|---|---|
| `leo` / Moon | 3.1 h | 12.3 d | 0.9 % of the arc |
| `apollo11` / Moon | 8.2 d | 12.3 d | 67 % of the arc |

Decision: **pre-roll the samples** — extend each celestial track backwards by at
least half a period at a coarse 15-min step (~1 180 samples, ~170 KB), generated
from the same source already used for that scenario (JPL Horizons for Apollo 11,
the existing SGP4/ephemeris path for LEO). No extrapolation code, no invented
values: the trail is real ephemeris with a taper at the join.

## Implementation plan

**Phase 1 — width and sampling.** `OBJECT_TRAIL.widthScale` 1.0 → 0.5; replace
time-uniform sampling with arc-length resampling at a 128-vertex budget;
arc-length fade. Purely visual, no length change yet.

**Phase 2 — length engine.** New `js/trails.js` of pure functions —
`osculatingA(state, mu)`, `dominantBody(r, v)`, `trailLength(track, state)`,
`windowForLength(samples, t, L)` — fed by `js/entities.js`, with
`scripts/test-trails.js` added to `npm test`: circumference from a known circular
state, the pad/hyperbolic fallbacks, the cap, monotonicity of the window solver,
and the 0.45 / 0.125 fractions.

**Phase 3 — history, fade, docs.** Celestial pre-roll in `data/scenarios.json`
(regenerate + `npm run embed`), retuned gradient and celestial opacity once the
long trails are on screen, README description, and a screenshot of the new
Apollo trail.

## Implementation notes (what differed from the plan)

- **Perimeter, not circumference.** `P = 4a·E(e)` via Ramanujan, because `2πa`
  overstates COLUMBIA's e = 0.977 orbit by 48.8 %. The tests pin both the circle
  identity and that eccentric case.
- **The arc cap is craft-only.** Applied to celestial tracks it silently shortened
  the lunar arc: the Moon's track (pre-roll + replay) is 0.75 of an orbit, so a
  35 % cap would have clipped the 45 % target. Celestial trails use the fraction
  as designed; craft trails keep the guard.
- **Arc length from positions, not from velocities.** The `leo` scenario
  compresses the Moon's motion for display (period 11 150 s) while storing its
  real ~1 km/s velocities. Integrating `v` would have measured 1/200th of the
  path. Positions are the source of truth, so `windowStart` walks the samples.
- **Hermite needs a sanity check.** For the same reason, cubic Hermite through
  those samples folds the ribbon back on itself; `sampleAt` now falls back to
  linear interpolation when the tangents disagree with the chord by more than 2x.
- **A stale-cursor bug cost a debugging round.** Reusing one `{ i }` cursor across
  frames meant the first vertex of a new frame resumed at the *end* of the
  previous frame's window, so ribbons drew as short stubs (11 Mm instead of
  758 Mm). The cursor now restarts when it is ahead of the requested time.
- **Pre-roll is a script, not a data patch.** `npm run preroll`
  (`scripts/pre-roll-celestial.js`) extends a celestial track backwards — copying
  the periodic tail for `leo`, fetching JPL Horizons for `apollo11` — and is
  idempotent (it skips a track that already has negative-time samples).
- **Validator check 7 had to learn about eccentricity.** It compared every sample
  radius against `SEMI_MAJOR_AXIS` within 5 %, which the real Moon (e = 0.055,
  apogee 406 000 km) exceeds. The tolerance is now `max(5 %, 1.1·e)`.
- **`window.TacviewDebug`** exposes `{ engine, entities, camera, scene }` after a
  scenario builds, and each ribbon records its last solve in
  `userData.trail`; both exist because verifying a 1 100 Mm arc needs numbers,
  not eyeballs.

## Alternatives considered

- **Keep a flat time window, tune it per track in `meta`.** Rejected: it turns
  every new scenario into a hand-tuning exercise, and the length still means
  nothing physically.
- **Length as a fraction of the track's own arc.** Rejected as the primary rule:
  a track that starts mid-orbit would show a different trail for the same
  object. Kept only as the cap.
- **Extrapolate celestial trails past the samples.** Rejected: two-body
  propagation of the Moon drifts tens of thousands of km over 7 days; pre-roll
  data is cheaper and truthful.
- **Fixed world-space width.** Rejected: it disappears at lunar zoom and becomes
  a wall in LEO — the camera-distance-relative width already solves both.

## Risks

- **Ribbon twist.** With a 13.7-day lunar trail the ribbon's up-vector rotates
  through the orbit; the current orientation logic (body roll for craft, camera
  up for celestial) may flip mid-arc. Needs a continuity pass — carry the
  previous up-vector and flip on sign change.
- **Self-intersection near perigee** on eccentric orbits: the ribbon doubles back
  on itself. Acceptable (it is a real path), but the fade must be arc-length
  based or the doubling looks solid.
- **Window walk cost.** A lunar half-orbit window holds ~400 samples; at 60 fps
  that is 24 k iterations per second — fine, but the walk must stride over
  samples, not interpolate every one.
- **Data size.** Pre-roll adds ~190 KB per celestial track; the payload is
  already 1.6 MB, and only one scenario is resident, so this is affordable.

## Open questions (with a recommendation)

1. **Should the trans-lunar trail really be 151,000 km?** Recommendation: yes —
   implement the literal 1/8 (27 h at coast speed) and leave the 35 % cap in
   place as a guard that currently does not bite. Look at it in the browser
   before deciding whether 0.125 is too generous for eccentric orbits.
2. **Should the celestial fraction be 0.45 or exactly 0.5?** Recommendation: 0.45,
   so the trail's tail is clearly off the far side of the ring rather than
   meeting itself.
3. **Should the spacecraft fraction grow with object size** (a 26 m craft vs a
   110 m stack)? Recommendation: no — the ring is 40 % larger for a higher orbit
   anyway, and size-based growth reintroduces the tuning-by-hand problem.
