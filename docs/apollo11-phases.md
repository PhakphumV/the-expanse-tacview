# Apollo 11 — scenario build plan

The `apollo11` scenario replays Apollo 11 from launch to splashdown (16–24 July
1969) in the same state-vector ephemeris the rest of the viewer uses. It is
built one mission phase at a time, and each phase is independently replayable
and validated.

## Ground rules

- **Frame.** Every track is Earth-centred ICRF (`REF_FRAME: "ICRF"`), mapped
  straight into renderer world space (the viewer has no frame transform). Lunar
  phases are computed Moon-centred and then transformed, so the engine stays
  single-frame.
- **Time.** `t` is GET (ground elapsed time) in seconds from launch,
  `1969-07-16T13:32:00Z`. The scenario declares `duration_s` = splashdown so the
  replay ends at a real milestone.
- **Provenance.** Each track carries a `SOURCE` string naming where its numbers
  came from. Only real, cited data is labelled as such; anything interpolated or
  propagated is labelled reconstructed.
- **Honesty over polish.** Where an authoritative state vector exists (JPL
  Horizons for the Moon; published TLI / entry states for the vehicle) it is used
  verbatim. Where it does not, the track is propagated from the nearest real
  anchor and the anchor is recorded.

## Phases

| # | Phase | GET range | Track content | Real data anchor |
|---|-------|-----------|---------------|------------------|
| 0 | Scenario skeleton | 000:00:00 → 195:18:35 | Moon only, real ephemeris; 12 phase/milestone events | JPL Horizons 301 (Moon), DE441, 15-min steps |
| 1 | Launch → parking orbit → TLI | 000:00:00 → 002:50:13 | `COLUMBIA` from the pad, S-IC/S-II ascent, 185 km / 32.5° parking orbit, TLI burn | Apollo 11 TLI state vector (Apollo by the Numbers / Postflight Trajectories); parking-orbit elements from the mission report | DONE |
| 2 | Trans-lunar coast | 002:50:13 → 075:49:50 | Free-return coast, MCC-2 (026:44:59), lunar SOI entry | TLI state + two-body + Moon gravity integration, targeted to the real lunar arrival geometry | DONE |
| 3 | Lunar orbit insertion | 075:49:50 → 100:39:53 | LOI-1 (111 × 314 km), LOI-2 (≈ 92 × 122 km), lunar orbits to separation | Published LOI-1/LOI-2 ΔV and orbit elements; arrival state from phase 2 | DONE |
| 4 | Undocking → DOI → PDI → landing | 100:12:00 → 102:45:40 | `EAGLE` becomes its own track: undocking, separation, descent orbit (15 × 111 km), powered descent | Separation 100:39:53, DOI 101:36:14, PDI 102:33:05, touchdown 102:45:40 | DONE |
| 5 | Surface stay and EVA | 102:45:40 → 124:22:01 | `EAGLE` parked (zero relative velocity), EVA events | EVA start 109:07:33, first step 109:24:15 | DONE |
| 6 | Ascent → rendezvous → docking → LM jettison | 124:22:01 → 130:09:00 | `EAGLE` lift-off and ascent (593 s, 18.6 km cutoff, 18.0 × 86.6 km), TPI + braking, docking, jettison; `COLUMBIA` extended through the rendezvous | Liftoff 124:22:01, docking 128:03:00, jettison 130:09:00 | DONE |
| 7 | TEI → trans-Earth coast → entry → splashdown | 130:09:00 → 195:18:35 | TEI burn (solved), 2.5-day coast, entry interface at 400 000 ft, shaped entry, splashdown | TEI 135:22:42, entry state at EI (400 kft), splashdown 195:18:35 | DONE |

## Per-phase workflow

1. Extend the offline generator (kept out of the repo; it only writes
   `data/scenarios.json` and the embedded `js/scenarios-data.js`).
2. Add the phase's samples with a sample rate matched to the dynamics — dense
   during burns and the descent, sparse on the coasts.
3. Add the phase's burn/milestone events at their real GETs, with a `phase`
   event marking each phase start so the header readout and the timeline jump
   targets stay in sync.
4. `npm test` — shape, ordering, unit quaternions, heading (idle samples are
   exempt), celestial orbits, scenario fields.
5. Replay in a browser: scrub the phase, check the trail geometry, the trail
   colour (bright for vehicles, subtle for the Moon), and the HUD readouts.

## Phase 1 notes (implemented)

- `COLUMBIA` covers 000:00:00 → 002:50:13 at mixed sample rates: 2 s through the
  ascent and the TLI burn, 10 s on the parking-orbit coast (1 450 samples).
- Anchors that are real: the TLI cutoff state (r 6 711.964 km, v 10 834.3 m/s,
  fpa 7.367°, i 31.383°), the staging times (S-IC cutoff 000:02:42, S-II cutoff
  000:09:18), orbit insertion 000:11:49, TLI ignition 002:44:16 and cutoff
  002:50:13.
- Built around those anchors: the ascent is a gravity-turn profile tuned to the
  published staging altitudes (66.6 km at S-IC cutoff, 184 km at S-II cutoff)
  and shaped onto the insertion state; the 185.5 km circular parking orbit and
  the 8.9 m/s² constant-thrust TLI burn are two-body integrations, trimmed onto
  the published cutoff state over the burn (162 km / 29 m/s of correction).
- Caveats: the launch site's inertial position is a free parameter (the pad
  implies ≈18° geocentric latitude, not the real 28.6°N — invisible on an
  untextured Earth), and the burn model is constant prograde thrust rather than
  the real pitch programme, so its thrust integral (3.18 km/s) exceeds the
  published ΔV.

## Phase 2 notes (implemented)

- Coast from TLI cutoff to LOI-1: 10 520 samples on `COLUMBIA`, integrated with
  Earth + Moon gravity (the Moon read from the scenario's own ephemeris).
  Sampling: 120 s mid-course, 30 s inside 100 000 km of the Moon, 5 s inside
  30 000 km — safe now that interpolation is cubic Hermite (ADR-0004 item 5).
- The Phase-1 reconstruction's inertial longitude was unconstrained (free pad
  position), so the whole `COLUMBIA` track is rotated 111° about Earth's spin
  axis to line up with the real intercept. Ascent, parking orbit and TLI arc
  rotate rigidly; staging altitudes and the TLI state are unchanged.
- MCC-2 (026:44:59) is a solved impulsive burn, 64.0 m/s (radial −44.3, transverse
  +46.2), retargeting the reconstructed state onto a 111 km perilune at LOI-1.
  The real MCC-2 was 1.04 m/s: the difference absorbs the phase error above.
  Recorded in the maneuver's `note` and in the track's `SOURCE`.
- Arrival at LOI-1: perilune exactly 111 km with zero radial velocity (the solve
  constrains both), lunar-relative speed 2.533 km/s. ΔV used at that point:
  3.11 km/s.

### Phase 2 repair (found while starting phase 3)

The committed phase-2 tail was wrong: the coast flew **through** the Moon
(minimum lunar altitude −752 km at GET 75.653 h) and the "+56 km" in the notes
above was measured on the far side, on the way out. The track simply continued
through the body because nothing stops an integrator at the surface, and none of
the validators check for an impact.

Phase 3 re-integrated the coast from the same TLI cutoff state with MCC-2 solved
for *both* conditions — perilune 111 km and zero radial velocity at the real
LOI-1 time — which produced the 64.0 m/s burn above. The coast samples
(10,520 → 8,700) were replaced; ascent, parking orbit and TLI are untouched.

## Phase 3 notes (implemented)

- LOI-1 (075:49:50) is a 291 s finite retrograde SPS burn. A finite burn cannot
  start *at* perilune: at 2.53 km/s the craft is still near escape speed, so
  291 s of thrust carries it hundreds of km outward and the resulting periapsis
  falls below the surface. The real burn straddled perilune, so the generator
  solves the delta-v **and** the ignition offset together: **862.2 m/s**
  (published 887.8) ignited **158 s before perilune**, giving 106.8 × 318.8 km
  against the published 111 × 314 km.
- LOI-2 (080:11:36) is an 18 s finite retrograde burn, **50.3 m/s** (published
  56.0) onto 91.7 × 121.5 km (published ≈ 99.5 × 121.5).
- Lunar orbits run to separation (100:39:53) at 90 s sampling, 20 s between the
  burns, 2 s through LOI-1 and 1 s through LOI-2. Perilune drifts from 106.8 km
  down to 91.5 km by separation under Earth's third-body perturbation — real
  missions trimmed for this; the reconstruction does not.
- Validator changes this phase forced:
  - a retrograde finite burn is measured by *speed* change, like a prograde one
    (the old check compared vectors and read 57 m/s for a 50 m/s burn);
  - a finite burn's dv gets a 15 % band (LOI-1 shows 770 m/s across an 862 m/s
    burn because gravity also changes the speed over 291 s);
  - velocity changes are measured in the frame of the dominant body, so a lunar
    burn is not polluted by the Moon's own 1 km/s motion.

## Phase 4 notes (implemented)

- `EAGLE` is now its own track, 360 720 → 369 946 s (1 614 samples): undocking,
  a 0.9 m/s separation burn, a 57 min coast, DOI and the descent.
- `COLUMBIA` is extended to touchdown (9 039 samples) so the CSM keeps orbiting
  while the LM descends.
- Undocking is a 0.15 m/s radial nudge (the real undocking was a spring push, not
  a burn). DOI is 22.8 m/s retrograde, solved so the altitude **at PDI** is the
  published 15.2 km — published is 23.2 m/s; the solve absorbs the orbit phase.
- The powered descent is **shaped, not flown by a guidance loop**: altitude and
  downrange follow a cubic (altitude) and an exponential (horizontal velocity)
  profile between the published anchors, positions are built on the great circle
  above a reconstructed landing site, and velocities come from central
  differences so position and velocity always agree. The implied thrust is
  checked: 1.82 km/s integrated, peak 3.16 m/s² (LM capability ~4.4 m/s²),
  touchdown sink rate 0.78 m/s. It lands where it aims, but it is not a flown
  descent, and the site's longitude is not the real Tranquility Base — both are
  recorded in the track's `SOURCE`.
- Timing anchors this phase made concrete: separation 100:39:53, DOI 101:36:14,
  PDI 102:33:05 (15.2 km, 1 690 m/s relative), touchdown 102:45:40. Downrange
  flown during the descent is 532 km.
- Validator changes forced by lunar-frame data:
  - burn directions are resolved in the **dominant body's** RTN frame, not
    Earth's — a radial-out nudge away from the Moon is nearly perpendicular to
    Earth's radial direction;
  - the Moon's coarse 15-minute grid is interpolated when building that frame.
    A nearest-sample lookup is stale by up to 900 km, which rotated a correct
    burn direction by 20° and failed it.
- Sampling: 10 s through the lunar coasts, 0.002–0.02 s brackets around the
  impulsive burns (gravity would otherwise eat a 0.15 m/s burn inside a 0.05 s
  bracket), 1 s through the descent, then a 6 s landed hold.

## Phase 5 notes (implemented)

- `EAGLE` is parked from touchdown to liftoff (369 940 → 447 721 s, 130 samples at
  600 s). Its position rides the Moon's translation and its velocity is the Moon's
  velocity, so the lunar-relative speed is exactly zero — that is what "stationary
  on the surface" means in an Earth-centred track.
- The Moon is modelled as **translating only** (there is no lunar rotation in this
  ephemeris), so the site holds a fixed inertial direction and a landed attitude is
  not definable. Recorded in the track's `SOURCE` rather than faked.
- `COLUMBIA` keeps orbiting overhead for the 21.6 h (433 samples at 180 s), so the
  CSM is still there when you scrub through the EVA.
- Payload discipline: the scenario was at 1.98 MB, so COLUMBIA's 90 s lunar-orbit
  stretch was decimated to 180 s (still ~40 samples per orbit under Hermite) and
  the extension runs at 180 s. Net payload 1.99 MB for 12 732 samples.
- Two HUD fixes this phase made obvious:
  - speed is reported **lunar-relative** inside the Moon's sphere of influence; a
    landed LM used to read 1.000 km/s (the Moon's own motion) instead of 0.000;
  - a landed vehicle reads `ON SURFACE` instead of `BELOW 0 km`, which is what
    round-off produced when the altitude sat a few metres under the radius.
- The EVA events (109:07:33 start, 109:24:15 first step) have existed since phase 0;
  they now have four hours of parked telemetry underneath them.


## Phase 6 notes (implemented)

- **Ascent is integrated, not shaped.** RK4 with Earth + Moon gravity, the engine
  on a pitch programme `theta = 90 deg * (u/pitchFrac)^shape`, and three knobs
  (burn length, pitch fraction, pitch exponent) solved for three targets: perilune
  18 km, apolune 87 km, altitude at cutoff 18 km. Result: 593 s, 1.90 km/s of
  thrust, cutoff at **18.6 km and 1.687 km/s**, orbit **18.0 × 86.6 km** — the
  published insertion is 18 × 87 km at ~1.69 km/s.
- **The pitch exponent is what keeps the insertion low.** With a linear programme
  (`shape = 1`) the same two orbit targets are met by *lofting*: cutoff at 58 km,
  then climbing to 87 km and coming back down. Sweeping the exponent and keeping
  the solution with the lowest cutoff is what puts the engine cutoff at 18 km,
  where Apollo's was.
- **Rendezvous is solved, not animated.** Two impulses: TPI 67.5 m/s at 124:38:34
  (`t = 448 674`) and a braking burn 65.4 m/s at 128:00:00, found with a 6×6
  Newton so `EAGLE` arrives at `COLUMBIA`'s reconstructed position *and* velocity
  at docking. Miss at 128:03:00: **232 m, 0.33 m/s**. The TPI epoch was scanned
  (2–130 min after insertion × 1–15 min before docking) for the cheapest transfer.
- **Why 133 m/s instead of Apollo's ~55 m/s.** The real rendezvous was four small
  burns over 3.5 h; this is two large ones, because a two-impulse model must buy
  the whole phase difference at once. The `TPI` maneuver note records it.
- **Docking through jettison is one object.** From 128:03 `EAGLE` copies
  `COLUMBIA`'s own samples (same knots, so the engine's interpolation agrees at
  every instant: measured separation 0.000 km, relative speed 0.00 m/s). At
  130:09 a 0.6 m/s retrograde push separates them; the gap grows to 4.6 km by
  130:25 and 12.4 km at the end of the track.
- **Hermite, not linear, when sampling `COLUMBIA`.** The first attempt interpolated
  the CSM's 180 s grid linearly and put the docked LM **5 km** off the CSM it was
  supposed to be attached to: a linear chord across a 180 s lunar-orbit step is
  ~5.6 km short of the real arc. The generator now uses the same cubic Hermite the
  engine uses.
- **New schema field: `gravity_loss_mps`.** A launch burn's thrust integral always
  exceeds the speed it gains (1 920 vs 1 650 m/s here): the validator used to
  compare `dv_mps` with the samples straight and would fail a perfectly good
  ascent. It now compares against `dv_mps - gravity_loss_mps`, and the field is
  validated (non-negative, below `dv_mps`).
- **Payload.** Phase 6 added ~1 030 `EAGLE` samples and 126 `COLUMBIA` samples, so
  `COLUMBIA`'s 10 s coast grid inside 30 000 km was thinned to 20 s (9 147 →
  6 984 samples; Hermite through the sample velocities is unchanged to metres).
  Payload went 1.99 MB → **1.85 MB** for 11 742 samples.


## Phase 7 notes (implemented)

- **TEI is solved against the entry corridor, not guessed.** Two constraints (the
  craft is 121.92 km up at 195:03:05 — 400 000 ft — and descending at -6.5 deg) and
  three unknowns, so the burn takes the Gauss-Newton **minimum-norm** step: the
  cheapest of the family that satisfies both. It converges in 20 iterations to
  122 km / -6.51 deg / 11.03 km/s: the published entry state, to within 0.75 km.
- **Why 1 562 m/s instead of the flown ~998 m/s.** This reconstruction's lunar
  phase is not Apollo's (its orbit is 92 x 122 km, not a 111 km circle), so the
  burn has to absorb that difference to hit the same corridor at the same second.
  A two-component solve in the coast's plane was tried first: it needed only
  705 m/s but *missed* the corridor entirely — 353 000 km above the Earth with a
  positive flight path angle — which is exactly what a minimum-norm solve exists to
  avoid. The maneuver note records the number and its reason.
- **The coast is integrated on a fixed 60 s step and sampled coarser.** A first
  attempt stepped at the sampling cadence (900 s between samples), which near Earth
  moves 10 000 km per step and lost 1.5 km/s of speed: the entry interface read
  9.5 km/s instead of 11.0. Sampling and integration cadence are now separate.
- **The entry is shaped from velocity anchors, not from a deceleration bump.** An
  earlier version integrated a lognormal 5.8 g deceleration profile, but the
  *shallow* start (11 km/s at -6.5 deg is 1 245 m/s of vertical speed) meant the
  craft hit the ground in 160 s. The entry now integrates a vertical-speed profile
  (1 245 m/s at the interface down to a 9 m/s chute descent) and a horizontal-speed
  profile (10.9 km/s to walking pace), with altitude and downrange as the integrals.
  Result: 2 627 km of downrange, peak deceleration **5.22 g** at 130 s (published
  5.8 g), splashdown at 12.5 m/s. The first anchor is taken from the real
  interface state so the seam with the coast is exact; the integral scale is baked
  into the later anchors instead of multiplying the profile, which would have left
  a 145 m/s step at the join.
- **New event:** ENTRY INTERFACE at 195:03:05 (a milestone, so the header keeps the
  RETURN / ENTRY phase).
- **Payload:** 537 new COLUMBIA samples (coast at 15 to 900 s, entry at 5 s),
  1.85 MB → **1.95 MB** for 12 317 samples. The mission is complete: the track now
  spans 000:00:00 to 195:18:35.

## Known gaps carried by the skeleton

- Celestial bodies and spacecraft are drawn at true scale but floored at a
  minimum apparent size (≈1.2% of the view), so at cislunar zoom they stay
  visible instead of collapsing to a pixel.
- The HUD has no vehicle rows for a cislunar track yet (altitude above the Earth
  is meaningless in lunar space). Phase 2 adds range-rate / lunar-altitude rows.
- Data is split per scenario (`js/scenario-<id>.js` + manifest) and only the
  active payload is decoded, so adding phases does not inflate boot memory the
  way a single embedded dataset would. Each Apollo payload is expected to reach
  a few hundred KB; if one passes ~2 MB, densify less (coarser coast sampling)
  rather than splitting further.
