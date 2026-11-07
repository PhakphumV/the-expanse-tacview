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
| 4 | Undocking → DOI → PDI → landing | 100:12:00 → 102:45:40 | `EAGLE` becomes its own track: undocking, separation, descent orbit (≈ 15 × 111 km), powered descent | Separation 100:39:53, touchdown 102:45:40 (JPL/NASA mission summary); descent ΔV budget |
| 5 | Surface stay and EVA | 102:45:40 → 124:22:01 | `EAGLE` parked (zero velocity, real landing site), EVA events | EVA start 109:07:33, first step 109:24:15 |
| 6 | Ascent → rendezvous → docking → LM jettison | 124:22:01 → 130:09:00 | Ascent to 18 × 87 km, rendezvous with `COLUMBIA`, docking, jettison | Liftoff 124:22:01, docking 128:03:00 |
| 7 | TEI → trans-Earth coast → entry → splashdown | 130:09:00 → 195:18:35 | TEI burn, 3-day coast, final midcourse, entry interface at 400 000 ft, splashdown | TEI 135:22:42, entry state at EI (400 kft), splashdown 195:18:35 |

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
