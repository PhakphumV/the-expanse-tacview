# Phase 6 Roadmap — Spaceflight Realism

## Goal

Land the Phase 6 pivot from kinematic keyframes to **Newtonian-aware playback**, delivering the visual and tactical feel of *The Expanse* — sustained high-G burns, retrograde braking, defensive roll, and inertial-frame starfield parallax — without converting the project into a live simulator. Phase 6 finishes the core vision: a polished, browser-only **reference tactical replay viewer** with no backend, no live ingest, and no authoring toolchain.

## Open issues being resolved

| Issue | Title | Resolved by |
|---|---|---|
| #30 | Implement ship heading & roll orientation | ADR 0002 |
| #31 | Implement real Newtonian spaceflight physics | ADR 0001, ADR 0002 |
| #32 | Rework camera system around the center of engagement | PR 2 |
| #33 | Rework background starfield for brachistochrone travel illusion | ADR 0004 |

## Locked decisions

| # | Decision | Source |
|---|---|---|
| Q1 | Newtonian-aware interpreter (keyframes are source of truth; integration drives drift/HUD/cameras) | ADR 0001 |
| Q2 | Optional additive `angular_velocity` field on keyframes | ADR 0002 |
| Q3 | Two camera modes (Center of Engagement + Chase); chase target is user-selectable IFF, `C` cycles; engagement may declare `chase_target` default | PR 2 |
| Q4 | Inertial-frame parallax for the starfield | ADR 0004 |
| Q5 | Per-frame time integration (`position += velocity * dt`); drift at keyframe boundaries is intentional | ADR 0001 |
| Q6 | Body-frame angular velocity vector `[wx, wy, wz]` (rad/s) for the new field | ADR 0002 |
| Q7 | Three new first-class HUD fields: `Acceleration` (G), `Burn Direction` (FWD/BRK/IDLE), `Roll` (°) | PR 1 |
| Q8 | Inertial frame = unweighted mean of two ships' velocities | ADR 0004 |
| Q9 | Extend existing `scripts/validate-playback.js` in place (one consolidated report in `VALIDATION.md`) | PR 1 |
| Q10 | Burn Direction = derived from `acceleration · velocity` with thresholds (no schema field) | PR 1 |
| Q11 | No explicit schema version; unknown fields are ignored | ADR 0002 |
| Q12 | Two-PR sequencing: PR 1 = #30 + #31 (engine pivot), PR 2 = #32 + #33 (consumer features) | this doc |
| Q13 | Post-Phase-6 vision = reference tactical replay viewer only (no multi-engagement library, no authoring toolchain, no live ingest) | this doc |
| Q14 | Mission state expanded from 3 states to 6 phase labels | ADR 0003 |
| Q15 | Missing `angular_velocity` falls back to synthetic-from-orientation-deltas (zero data migration) | ADR 0002 |

## Sequence

### PR 1 — Engine pivot (issues #30 + #31)

- **New module**: `js/core/integrator.js` — pure math: forward Euler for position (`p += v * dt`), quaternion derivative for orientation (`qdot = 0.5 * ω ⊗ q` with body-frame `ω`), synthetic `ω` derivation from quaternion deltas when `angular_velocity` is absent.
- **Modify** `js/core/playback.js` — expose `getIntegratedStateAtTime(t)` alongside the existing kinematic `getStateAtTime(t)`. Ship renderers, HUD, and consumers move to integrated state.
- **Modify** `js/data/telemetry.js` — derive `Acceleration` (G), `Burn Direction` (FWD/BRK/IDLE via `acc · velocity` thresholds), `Roll` (° from orientation quaternion → Euler roll). The existing `velocity`, `range`, `closure rate`, `aspect angle`, `G-force` continue to work.
- **Modify** `js/render/ship-models.js` — read integrated state from playback for ship transforms; the visual position is now the integrated position.
- **Modify** `js/mission-state.js` — expand from 3 states (`STANDBY`/`ENGAGEMENT`/`RESOLUTION`) to 6 phase labels (`PURSUIT`/`LAUNCH`/`INTERCEPT`/`ROLL`/`ATTRITION`/`RESOLUTION`) via a `PHASE_BY_TYPE` map keyed off event type.
- **Modify** `js/ui/hud.js` — add the three new first-class HUD fields (`Acceleration`, `Burn Direction`, `Roll`); add the phase label next to the existing mission indicator.
- **Schema**: add optional `angular_velocity: [wx, wy, wz]` (rad/s) to `SCHEMA.md` keyframe shape with the synthetic-fallback note. The existing `data/engagement.json` is **not** modified — the synthetic derivation handles the defensive roll on Roci.
- **Validation**: extend `scripts/validate-playback.js` with three new checks:
  1. Integrated position at `t=X` matches keyframe position within tolerance when starting from the prior keyframe's velocity (drift check).
  2. Scrub-then-forward equals continuous-forward (determinism).
  3. HUD-derived `Acceleration` matches `Δv/Δt` from adjacent keyframes within tolerance.
- **Docs**: append a "Physics engine" section to `VALIDATION.md` summarising the new checks and the intentional-drift rationale; link ADR 0001 and ADR 0002.

### PR 2 — Consumer features (issues #32 + #33)

- **Modify** `js/render/camera.js` — remove `Orbit` and `Tactical Top-Down` modes; add `Center of Engagement` (auto-frames both ships) and `Chase` (follows one ship at close range). Chase target cycles via `C`; if the engagement declares a `chase_target` key, use that as the default.
- **Modify** `js/render/scene.js` and `js/render/starfield.js` — implement inertial-frame starfield parallax. Each frame, compute `v_frame = 0.5 * (v_roci + v_zmeya)` from playback's integrated state and drift particles opposite to `v_frame`; fall back to the most recent `v_frame` outside the active window.
- **Modify** `js/main.js` — remove `OrbitControls` from the camera switcher; the Center of Engagement mode replaces the previous top-down framing.

## QA checklist (Phase 6 closeout)

- [ ] Play from `T+00:00` to `T+170.0` with no console errors.
- [ ] Forward and backward scrubbing at 0.25x, 0.5x, 1x, 2x, 4x produce identical scene state.
- [ ] Roci's velocity climbs during the high-G burn phase (HUD `Acceleration` reads positive).
- [ ] Roci's `Burn Direction` reads `FWD` during pursuit, `BRK` during any retrograde phase, `IDLE` between.
- [ ] Roci's `Roll` field shows a continuous rotation during the PDC defense window.
- [ ] Center of Engagement camera frames both ships throughout the replay.
- [ ] Chase camera cycles between roci and zmeya when `C` is pressed.
- [ ] Starfield drift reads as linear acceleration toward an interception point, not orbiting a fixed center.
- [ ] Mission indicator transitions through `STANDBY → PURSUIT → LAUNCH → INTERCEPT → ROLL → ATTRITION → RESOLUTION` in order.
- [ ] No drift in keyframe-vs-integrated position exceeds the documented tolerance at any boundary.
- [ ] `node scripts/validate-playback.js` exits clean with the three new checks.

## Files touched (summary)

- **New**: `CONTEXT.md`, ADRs, `docs/PHASE-6-ROADMAP.md` (this file), `js/core/integrator.js`.
- **Modified (PR 1)**: `js/core/playback.js`, `js/data/telemetry.js`, `js/render/ship-models.js`, `js/ui/hud.js`, `SCHEMA.md`, `scripts/validate-playback.js`, `VALIDATION.md`.
- **Modified (PR 2)**: `js/render/camera.js`, `js/render/scene.js`, `js/render/starfield.js`, `js/main.js`.
- **Untouched**: `data/engagement.json` (synthetic `ω` fallback handles the existing dataset).

## Out of scope (per Q13)

- Multi-engagement library / catalogue UI.
- Authoring toolchain (CLI or GUI for producing `engagement.json`).
- Live or streaming telemetry ingest.
- New engagements beyond the existing `roci-vs-zmeya-oyedeng`.
- A full orbital-mechanics simulator.

## How this maps to issues

- Closes **#30** (orientation) — `js/core/integrator.js` provides quaternion derivative from `angular_velocity` (or synthetic from orientation deltas).
- Closes **#31** (Newtonian physics) — `js/core/integrator.js` provides per-frame position integration; HUD gains `Acceleration` and `Burn Direction`.
- Closes **#32** (cameras) — `js/render/camera.js` rewires to Center of Engagement + Chase; engagement may declare `chase_target`.
- Closes **#33** (starfield) — `js/render/starfield.js` implements inertial-frame parallax.

All four issues close when both PRs merge. Phase 6 is the ceiling for the project's current vision; subsequent work would require a fresh roadmap pass.
