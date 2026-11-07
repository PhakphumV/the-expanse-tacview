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
| 1 | Launch → parking orbit → TLI | 000:00:00 → 002:50:13 | `COLUMBIA` from the pad, S-IC/S-II ascent, 185 km / 32.5° parking orbit, TLI burn | Apollo 11 TLI state vector (Apollo by the Numbers / Postflight Trajectories); parking-orbit elements from the mission report |
| 2 | Trans-lunar coast | 002:50:13 → 075:49:50 | Free-return coast, MCC-2 (026:44:59), lunar SOI entry | TLI state + two-body + Moon gravity integration, targeted to the real lunar arrival geometry |
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

## Known gaps carried by the skeleton

- Celestial bodies are drawn at true scale, so at cislunar zoom the Earth and
  Moon are single-pixel dots. Phase 1 adds a minimum-apparent-size body marker.
- The HUD has no vehicle rows for a cislunar track yet (altitude above the Earth
  is meaningless in lunar space). Phase 2 adds range-rate / lunar-altitude rows.
- Data is split per scenario (`js/scenario-<id>.js` + manifest) and only the
  active payload is decoded, so adding phases does not inflate boot memory the
  way a single embedded dataset would. Each Apollo payload is expected to reach
  a few hundred KB; if one passes ~2 MB, densify less (coarser coast sampling)
  rather than splitting further.
