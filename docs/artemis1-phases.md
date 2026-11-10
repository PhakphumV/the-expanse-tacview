# Artemis I — scenario build plan

`artemis1` replays the uncrewed Artemis I flight-test mission (16 Nov – 11 Dec
2022): SLS ascent, trans-lunar injection, the outbound powered flyby, a six-day
stay in a distant retrograde orbit (DRO) about the Moon, the return powered
flyby, re-entry and splashdown — in the same state-vector ephemeris the rest of
the viewer uses. It is the first *modern / SLS-Orion* mission in the set: there
is no LM, no docking, and no landing; Orion is a single deep-space spacecraft
(crew module + European Service Module) from launch to splashdown, and the only
"landing" is the splashdown at the end.

This document is the plan. Nothing here is implemented yet; the phases are
ordered so each one is independently replayable and validated, exactly like
Apollo 11 and 13.

## Ground rules (same as the Apollo scenarios)

- **Frame.** Earth-centred ICRF, mapped straight into renderer world space.
- **Time.** `t` is GET in seconds from range zero, `2022-11-16T06:47:44Z`.
- **Provenance.** Each track carries a `SOURCE` string. Real, cited numbers are
  labelled as such; anything propagated or solved is labelled reconstructed.
  No real Artemis I state vectors are public, so *every* position/velocity is
  reconstructed to pass the published anchors below — the numbers in the
  `Real data anchor` column are the fixed points; the track between them is
  solved, not telemetry, and that is stated in `SOURCE`.
- **Honesty over polish.** Where an anchor is only a MET or a speed, not a full
  state, the trajectory is propagated and the anchor recorded in `SOURCE`.

## Mission anchors (all MET = mission elapsed time, from launch)

Compiled from the NASA *Artemis I Mission Timeline* MET tables
(https://www.nasa.gov/reference/artemis-i-mission-timeline/) and the Wikipedia
mission-profile table. MET is the `DDD/HH:MM:SS` value NASA published.

| GET | Event | Source |
|-----|-------|--------|
| 000/00:00:00 | Launch (06:47:44 UTC) | NASA MET |
| 000/00:02:12 | SRB separation | NASA MET |
| 000/00:03:11 | Service module fairing jettison | NASA MET |
| 000/00:08:03 | Core-stage MECO + CS/ICPS separation | NASA MET |
| 000/00:18:09–00:30 | Orion solar-array deploy (~12 min) | NASA MET |
| 000/00:52:56 | Perigee raise maneuver | NASA MET |
| 000/01:29:27–01:47:27 | ICPS TLI burn (18 min, RL10) | NASA MET |
| 000/01:57:36 | Orion/ICPS separation | NASA MET |
| 000/03:21:36 | ICPS disposal burn | Wikipedia (10:09:20 UTC) |
| 000/07:47:31 | Outbound TCB-1 | NASA MET |
| 001/04:47:31 | Outbound TCB-2 | NASA MET |
| 004/06:40:14 | Outbound TCB-3 | NASA MET |
| 005/00:40:14 | Outbound TCB-4 | NASA MET |
| 005/06:40:14 | Outbound powered flyby burn; closest approach 130 km, 21 Nov | NASA MET + Wikipedia |
| 006/00:40:14 | Outbound TCB-5 | NASA MET |
| 008/15:48:27 | Outbound TCB-6 | NASA MET |
| 009/15:48:27 | DRO insertion burn (25 Nov, 21:52 UTC) | NASA MET + Wikipedia |
| 010/15:48:27 | Orbital maneuver-1 | NASA MET |
| 012/15:48:27 | Orbital maneuver-2; farthest from Earth 432 210 km (~28 Nov) | NASA MET + Wikipedia |
| 014/15:49:56 | Orbital maneuver-3 | NASA MET |
| 015/15:49:56 | DRO departure burn (1 Dec, 21:53 UTC) | NASA MET + Wikipedia |
| 015/21:49:56 | Return TCB-1 | NASA MET |
| 018/10:24:00 | Return TCB-2 (Δv 0.52 m/s, published) | NASA MET (1.16 mph) |
| 019/04:24:00 | Return TCB-3 | NASA MET |
| 019/10:24:00 | Return powered flyby burn (3 min 27 s; closest approach 128 km, 5 Dec) | NASA MET + Wikipedia |
| 020/04:24:00 | Return TCB-4 | NASA MET |
| 024/14:15:49 | Return TCB-5 | NASA MET |
| 025/06:15:49 | Return TCB-6 | NASA MET |
| 025/10:55:50 | Crew module / service module separation | NASA MET |
| 025/10:59:20 | Crew-module raise burn | NASA MET |
| 025/11:15:52 | Entry interface (24 581 mph ≈ 10 988 m/s) | NASA MET + re-entry speed |
| 025/11:36:27 | Splashdown (11 Dec, 17:40:30 UTC) | NASA MET + Wikipedia |

Total GET ≈ 025/11:36:27 = 2 203 247 s (~25.5 days).

## Phase table

| # | Phase | GET range | Track content | Real data anchor | Status |
|---|-------|-----------|---------------|------------------|--------|
| 0 | Skeleton + Moon | whole mission | `artemis1.json`; Moon on its **Nov–Dec 2022** ephemeris; event timeline (all MET anchor rows above as `milestone`/`phase` events); `menu_order`, `SOURCE`, honesty notes | JPL Horizons 301 (Moon), DE441 over 16 Nov – 11 Dec 2022 | **DONE** |
| 1 | Launch, ascent, Earth orbit | 000:00:00 → 000:01:29:27 | `ORION` from the pad through SRB sep, MECO, solar-array deploy, PRM, to TLI ignition | MECO 000/00:08:03, PRM 000/00:52:56 | **DONE** |
| 2 | TLI + outbound coast | 000:01:29:27 → 005/06:40:14 | TLI 18-min burn (~3.1 km/s, ICPS RL10); Orion/ICPS sep 000/01:57:36 (event); outbound coast with TCBs to the flyby | TLI window, sep MET, TCB METs | **DONE** |
| 3 | Lunar flyby + DRO ops | 005/06:40:14 → 015/15:49:56 | Outbound powered flyby (130 km), coast, DRO insertion 009/15:48:27, OM-1/2/3, farthest 432 210 km, DRO departure | Flyby altitude, DRO in/out METs, max distance | **DONE** |
| 4 | Return coast + Earth approach | 015/15:49:56 → 025/10:55:50 | Return TCBs, return powered flyby 019/10:24:00 (128 km), return coast | Flyby altitude, return TCB METs | **DONE** |
| 5 | Separation, entry, splashdown | 025/10:55:50 → 025/11:36:27 | CM/SM sep, CM raise burn, EI at 10 988 m/s, shaped entry, splashdown | Sep/EI/splashdown METs | **DONE** |
| 6 | Validation, provenance, docs, browser QA | — | `npm test` (data 10 + trails 18), continuity + min-lunar-altitude guards, full browser replay, ADR/README | — | **DONE** |

## What is different from apollo11/13, and why it changes the build

1. **The Moon ephemeris is a new window, and there is no landing.** A different
   year is a different ephemeris, so phase 0 re-fetches Horizons (16 Nov – 11 Dec
   2022) with its own pre-roll and element check — it cannot reuse the 1969/1970
   lunar tracks. And unlike Apollo there is no descent, so the ground-span /
   landed-track logic in `entities.js` is exercised only for the splashdown (a
   "landed" Orion at ~0 m/s relative to the rotating Earth — handled as a ground
   span, and the LM trail-fade caveats still apply).

2. **The defining physics is a *distant retrograde orbit*, not a low lunar
   orbit.** DRO is a large (≈60 000–90 000 km from the Moon), ~14-day-period,
   retrograde orbit. The transfer/dominance logic must place the Moon as the
   dominant body through the DRO (the craft is well inside the lunar SOI), so
   the trail's eighth-of-orbit and transfer windows behave — but a DRO is not a
   transfer, so `Trails.isTransfer` must read it as an orbit. That is the
   mission's testable property: insert retro, hold ~6 days, depart prograde, and
   **assert the outbound leg, if left alone, stays retrograde around the Moon
   rather than escaping** (the feature that makes a DRO a parking orbit).

3. **One track from pad to splashdown.** `ORION` (crew module + service module)
   carries the whole story; the SLS/ICPS upper stage is **not** modelled as a
   track — the Orion/ICPS separation at 000/01:57:36 and the ICPS disposal burn
   are events. (The Apollo scenarios split into multiple tracks because jettisoned
   hardware mattered to the story; here the CM/SM separation at the very end is an
   event too, since we do not model a falling stage.)

4. **Entry is a skip-style return, longer than Apollo's.** The re-entry is
   24 581 mph (Mach 32) and the EI→splashdown leg is ~0:20:35 — a modern skip
   entry, not Apollo's direct −6.5° corridor. The last-mission generator's
   entry segment is hard-coded to the Apollo profile; it needs parameterising
   (EI speed, EI-to-splashdown duration, flight-path angle) before reuse.

5. **A 25.5-day mission is 3× Apollo's length.** That is most of the payload
   problem (below): the sample grid must be dense only near burns and the Moon,
   and coarse (300–600 s) on the long coasts, or the file blows the ~2 MB
   budget. It also sets a high default playback speed.

## Per-phase workflow

Extend a throwaway generator in the scratch dir (never committed) → read the
scenario through `scripts/scenario-store.js` → build samples → `store.save()` →
`npm run attitude` → `npm run embed` → `npm test` → browser check the phase →
mark the row **DONE** in this doc with the numbers achieved. The scenario stays
its own file `data/scenarios/artemis1.json`; it gets a `menu_order` value that
keeps `leo` first so the viewer still boots into the light mission.

## Estimated payload

Total GET 2 203 247 s. Dense at 1–2 s only through ascent, TLI, the two ~3-min
flyby burns, DRO in/out and entry (~2 000 samples); DRO (6 d) and the long
coasts at 300–600 s. Estimate **≈6 000–7 000 craft samples** (~155 B each)
**≈1.0–1.2 MB** plus the Moon's ~900-s grid — inside the ~2 MB budget. If a
phase would push past, decimate a coastal stretch rather than densify.

## Open questions (each with a recommendation)

1. **Default playback speed.** **RESOLVED: 512x like Apollo.** The user chose the
   512x default; a 25.5-day mission is long to play end-to-end, but scrubbing the
   detail-track window covers it. (Option to raise later.)

2. **Whether to model the `ICPS` stage as a separate track.** **RESOLVED:** single
   `ORION` track only — the Orion/ICPS separation (000/01:57:36) and the ICPS
   disposal burn (000/03:21:36) are events, not a track.

3. **MET wall-clock mismatch (~44 min).** NASA's published METs and the
   wall-clock UTC dates disagree by ~44 minutes (NASA's table puts the outbound
   flyby at 005/06:40:14; UTC date math gives ~005/05:56). Recommend using the
   **NASA MET table as the single GET clock** (self-consistent) and noting the
   discrepancy in `SOURCE` rather than "fixing" it.

4. **Orion spacecraft model.** The viewer already has per-vehicle models; add
   an `ORION` (CM cone + ESM cylinder + four solar-array wings) in
   `spacecraft-model.js`, extend the track-id dispatch. Also add the `ICPS`
   (a slim stage with an RL10 nozzle) if Q2 is approved. Recommend doing both in
   the phase where the track first appears.
