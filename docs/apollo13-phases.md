# Apollo 13 — scenario build plan

`apollo13` replays Odyssey and Aquarius from launch to splashdown (11–17 April
1970) in the same state-vector ephemeris the rest of the viewer uses. It is the
first *abort* mission in the set: the flight is not a landing profile with a
detour, so several of the assumptions baked into `apollo11` (a free-return TLI, a
single craft, a planned lunar orbit) do not hold.

This document is the plan. Nothing here is implemented yet; the phases are ordered
so each one is independently replayable and validated, exactly like Apollo 11.

## Ground rules (same as Apollo 11)

- **Frame.** Earth-centred ICRF, mapped straight into renderer world space.
- **Time.** `t` is GET in seconds from range zero, `1970-04-11T19:13:00Z`.
- **Provenance.** Each track carries a `SOURCE` string. Real, cited numbers are
  labelled as such; anything propagated or shaped is labelled reconstructed.
- **Honesty over polish.** Where no authoritative state vector exists, the track is
  propagated from the nearest real anchor and the anchor is recorded.

## Phase table

| # | Phase | GET range | Track content | Real data anchor |
|---|-------|-----------|---------------|------------------|
| 0 | Skeleton | 000:00:00 → 142:54:41 | Moon on its April 1970 ephemeris; launch, TLI, accident, PC+2, EI and splashdown events | JPL Horizons 301 (Moon), DE441, over the 11–17 April 1970 window |
| 1 | Launch → parking orbit | 000:00:00 → 002:35:46 | `ODYSSEY` from the pad; S-IC, S-II with the **early centre-engine cutoff**, S-IVB to a 185 km orbit | CECO at −132.36 s from nominal, outboards +34.53 s, 223 ft/s under-speed at OECO, S-IVB +9.3 s |
| 2 | TLI → hybrid coast | 002:35:46 → 055:54:53 | TLI 3 181 m/s over 350.7 s, then MCC-2 at 030:40:50 (0.15 m/s) onto the **hybrid** trajectory | Table 1 of the Apollo 13 GNC paper (AIAA/NTRS 20090026451) |
| 3 | The accident | 055:54:53 | Event only: tank 2 explodes, fuel cells 1 and 3 die, buses A/B drop out | NSSDCA chronology to the millisecond (55:54:53.182 accelerometer, 1.17 g on X) |
| 4 | Free-return burn | 061:29:43.5 → 061:30:17.7 | DPS-1 on the LM descent engine, 11.5 m/s over 34.2 s, puts the stack back on a free return | Table 1 (`DPS-1 / MCC-4`), LM DPS |
| 5 | Lunar flyby and PC+2 | 077:27 → 079:32:02.8 | Pericynthion passage, then DPS-2 at pericynthion + 2 h: 262.3 m/s over 263.8 s | Table 1 (`DPS-2 / PC+2`) |
| 6 | Return coast | 079:32 → 138:01:48 | MCC-5 at 105:18:28 (2.4 m/s), MCC-7 at 137:39:51 (0.9 m/s, EI−5 h), barbecue roll | Table 1 |
| 7 | Separation, entry, splashdown | 138:01:48 → 142:54:41 | SM jettison, LM jettison at 141:30:00, EI at 400 000 ft on a −6.49° corridor, splashdown 3.5 nm from Iwo Jima | Table 1; splashdown T+142:54:41 = 18:07:41 UTC |

## What is different from apollo11, and why it changes the build

1. **The Moon ephemeris has to be re-fetched.** `apollo11` uses a Horizons 301
   track over July 1969. April 1970 is a different window on the same body, so
   phase 0 cannot reuse the existing lunar samples: it needs its own 900 s grid,
   its own pre-roll for the trail window, and its own element check. This is
   cheaper than it sounds — `scripts/pre-roll-celestial.js` and the celestial
   validator already take a scenario id.

2. **The TLI is not a free return, and that is a testable property.** Apollo 13's
   TLI put the stack on a *hybrid* trajectory: if nobody did anything after it, the
   vehicle would **miss** the Earth. The free-return burn at 061:30 is what brings
   it back. The reconstruction should reproduce both halves of that: propagate from
   TLI with no burns and record that the return misses (by how much, at what
   geocentric radius); then apply DPS-1 and record that the return now grazes the
   entry corridor. That pair is the most interesting thing this scenario can show,
   and it is a validation check, not a visual.

3. **One track until 141:30, three after.** Odyssey and Aquarius are a single
   stack: docked from launch, through the accident, the burn, the flyby and the
   coast. They separate only at LM jettison (141:30:00), and the SM is discarded at
   138:01:48 — 3.5 hours earlier, still attached to the LM's docking tunnel. So:
   - `ODYSSEY` — CM+SM+LM stack from 0 to 138:01:48;
   - `SERVICE MODULE` — drifts from 138:01:48 (the damaged module, the one the
     crew photographed);
   - `AQUARIUS` — LM, still holding the CM until 141:30:00, then drifting on its
     own (it re-entered over Fiji the next day, which is out of scope: the track can
     stop a few minutes after jettison).
   Position and velocity of the three must agree exactly at each separation epoch,
   and each separation is a small impulsive push (0.15 m/s CM, 0.20 m/s LM per
   Table 1; the LM separation was actually tunnel pressure, not RCS).

4. **The burns are LM DPS burns, not SPS burns.** DPS-1 and DPS-2 have to be
   expressed with the LM engine's mass flow and thrust, and they act on the whole
   stack (~45 t with the CM attached), which changes the implied acceleration
   against `apollo11`'s LM-only values. The maneuver schema already allows
   `thrust_n`, `isp_s` and `mass_kg`; the numbers just have to be the stack's.

5. **The accident is telemetry, not dynamics.** Nothing about the trajectory
   changes at 55:54:53 — the stack keeps coasting. What changed was power, oxygen
   and the mission plan. So phase 3 is an *event* with a description and, if we
   want it visible, a HUD row that reports the loss (a "SYSTEMS" row is out of
   scope for now). It must not fabricate a jolt.

6. **The entry is shorter.** EI at 142:40:46 and splashdown at 142:54:41 is 835 s,
   against Apollo 11's 930 s, on a −6.49° corridor. The shaped-entry code from
   phase 7 of `apollo11` should take a parameterised duration and flight-path angle
   rather than hard-coded anchors.

## Per-phase workflow (unchanged)

1. Extend the offline generator (kept out of the repo; it only writes
   `data/scenarios/apollo13.json`).
2. `npm run embed` to regenerate the per-scenario payload; `npm test` to run the
   ten data checks and the trail maths.
3. Browser check at 127.0.0.1 with a spare port (`8000` is taken by a proxy on
   this host): the phase readout, the HUD rows, the trail at the seam.
4. Update this file: mark the phase DONE, record the numbers actually achieved and
   any deviation from the published ones.

## Estimated payload

The mission is 142:54:41 = 514,481 s, shorter than Apollo 11's 703,115 s, with
six burns and three tracks:

| Track | Samples | Rate |
|---|---|---|
| `moon` | ~1 900 | 900 s, including pre-roll |
| `ODYSSEY` | ~2 900 | 1–2 s through the burns, 300 s on the long coasts, 5 s in the entry |
| `SERVICE MODULE` | ~60 | 60 s drift |
| `AQUARIUS` | ~60 | 60 s after jettison |
| **total** | **~4 900** | ≈ 0.8 MB, well inside the ~2 MB budget |

The saving against `apollo11` is the two coasts: Apollo 11 needed 10 s sampling
through the lunar-orbit work, Apollo 13 coasts for days at a time.

## Open questions to settle before phase 1

- **Closest lunar approach.** TLI targeted a 60 nm (111 km) pericynthion, but the
  flown trajectory passed about 254 km above the far side. Which number is the
  reconstruction's target? Recommendation: solve TLI for the flown 254 km, and note
  the 111 km as the plan.
- **Where the hybrid trajectory is defined.** MCC-2 (0.15 m/s) is what made the
  trajectory hybrid; whether the reconstruction should start from a free-return TLI
  and then apply MCC-2 (which is what actually happened), or target the hybrid
  directly. Recommendation: the former — it keeps the "miss without the burn"
  property testable.
- **LM power-up.** Between the accident and the LM jettison the stack is flown on
  the LM's systems. That has no effect on the trajectory, so it belongs in `SOURCE`
  prose rather than in telemetry.
