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
| 3 | Lunar orbit insertion | 075:49:50 → 100:12:00 | LOI-1 (111 × 314 km), LOI-2 (≈ 99 × 121 km), lunar orbits | Published LOI-1/LOI-2 ΔV and orbit elements; arrival state from phase 2 |
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
- MCC-2 (026:44:59) is a solved impulsive burn, 68.9 m/s, retargeting the
  reconstructed state onto the 111 km perilune at LOI-1. The real MCC-2 was
  1.04 m/s: the difference absorbs the phase error above. Recorded in the
  maneuver's `note` and in the track's `SOURCE`.
- Arrival at LOI-1: 56 km above the Moon (target 111 km), lunar-relative speed
  2.565 km/s. ΔV used at that point: 3.11 km/s.

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
