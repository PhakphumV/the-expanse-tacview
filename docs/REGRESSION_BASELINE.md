# Regression Baseline — TAC-035

This document captures the project's behaviour at a fixed point in time so
that any future cleanup or refactor can prove it has not changed the
runtime output. Run the commands in [Re-verification](#re-verification)
after every cleanup PR and diff the result against the values recorded
here.

## Snapshot

| Field | Value |
| ----- | ----- |
| Date  | 2026-09-28 |
| Branch | `main` |
| HEAD commit | `fddb152` (workspace mirror of `origin/main`) |
| Node | v26.8.1 |
| `data/engagement.json` SHA-256 | `39d006d97f7e983915ee661e9b94926786d4cfb55ab332efc5c14aeee843960c` |
| `data/example.json`   SHA-256 | `0b45eeb8bb97e995052e939ffb14df9be71c9a3b0a83c28dc0cc58c8840d5434` |

If either SHA changes without a documented dataset update, treat that as
a regression and re-baseline in the same PR.

## Dataset summary (`data/engagement.json`)

| Field | Value |
| ----- | ----- |
| Engagements | 1 |
| Engagement `id` | `roci-vs-zmeya-oyedeng` |
| Engagement `label` | Roci vs Zmeya — Oyedeng Pursuit |
| Duration | 170 s |
| Entities (total) | 26 |
| &nbsp;&nbsp;ships | 2 (`roci`, `zmeya`) |
| &nbsp;&nbsp;torpedoes | 24 (`zmeya_torp_01`..`22`, `roci_torp_01`..`02`) |
| &nbsp;&nbsp;`pdc_round` | 0 (PDC rounds are synthesized by the renderer; see `SCHEMA.md` §Entity object) |
| Events (total) | 60 |

## Event-type counts (60 total)

| Type | Count |
| ---- | ----- |
| `pursuit_start` | 1 |
| `intercept_course` | 1 |
| `high_g_burn` | 2 |
| `missile_lock` | 1 |
| `zmeya_barrage_launch` | 1 |
| `roci_torpedo_launch` | 2 |
| `torpedo_intercept` | 2 |
| `pdc_auto_track` | 1 |
| `pdc_engagement` | 20 |
| `defensive_roll_start` | 1 |
| `missile_intercept` | 20 |
| `pdc_jammed` | 1 |
| `pdc_coverage_shift` | 1 |
| `all_missiles_destroyed` | 1 |
| `lock` | 1 |
| `railgun_fire` | 1 |
| `zmeya_drive_disabled` | 1 |
| `unlock` | 1 |
| `engagement_resolution` | 1 |

## Key event timestamps

| Event | t (s) |
| ----- | ----- |
| `pursuit_start` | 0 |
| `intercept_course` | 8 |
| `lock` (radar lock-on) | 142 |
| `railgun_fire` | 146 |
| `engagement_resolution` | 156 |

These are the mission-state transition points the HUD must reach and
match against after a refactor.

## HUD snapshots at key timestamps

Values are computed by linearly interpolating `position` / `velocity`
between adjacent keyframes for the two ships, then deriving `range`
(euclidean distance) and `closure` (range-rate, positive = closing).
This matches the math exercised by `scripts/validate-playback.js` checks
#5, #6, and #13.

| t (s) | range (km) | closure (m/s) | notes |
| ----- | ---------- | ------------- | ----- |
| 0.0   | 0.3        | -1.0          | `pursuit_start` |
| 8.0   | —          | —             | `intercept_course` (event, no range snapshot change) |
| 30.0  | 0.2        | -5.5          | mid-pursuit |
| 85.0  | 0.1        | -0.1          | sustained close engagement |
| 142.0 | —          | —             | radar `lock` |
| 146.0 | —          | —             | `railgun_fire` |
| 156.0 | —          | —             | `engagement_resolution` (mission state → RESOLUTION) |
| 169.9 | 0.0        | -0.0          | final frame before loop wrap |

The ship pair starts and ends in close-quarters regime (sub-kilometre)
throughout the 170 s window — closure is consistently slightly negative
because the dataset is an in-system encounter rather than a long burn.

## Automated baseline output

### `node scripts/validate-playback.js`

```
Validating data/engagement.json

✓ 1. Collection shape conforms to schema
✓ 2. JS module syntax

Engagement [roci-vs-zmeya-oyedeng]
✓ [roci-vs-zmeya-oyedeng] 3. Engagement shape conforms to schema
✓   [roci-vs-zmeya-oyedeng] 4. Orientation continuity at keyframe boundaries
✓   [roci-vs-zmeya-oyedeng] 5. Velocity from position vs keyframe velocity
✓   [roci-vs-zmeya-oyedeng] 6. Closure rate vs numeric dRange/dt
✓   [roci-vs-zmeya-oyedeng] 7. G-force physically reasonable (|dv/dt|/9.8)
✓   [roci-vs-zmeya-oyedeng] 8. Derived telemetry in physical range
✓   [roci-vs-zmeya-oyedeng] 9. Lock/unlock events form valid closed intervals
✓   [roci-vs-zmeya-oyedeng] 10. Burst events at known entity positions
✓   [roci-vs-zmeya-oyedeng] 11. Integrated position match within span tolerance
✓   [roci-vs-zmeya-oyedeng] 12. Scrub-then-forward determinism (pure getIntegratedStateAtTime)
✓   [roci-vs-zmeya-oyedeng] 13. HUD acceleration matches numeric dv/dt
✓   [roci-vs-zmeya-oyedeng] 14. Burn direction classifies FWD/BRK/IDLE from acc·v

14 passed, 0 failed
```

The terminal line count must read exactly **14 passed, 0 failed** after
every refactor.

### `node scripts/browser-smoke.js`

```
browser-smoke: no compatibility issues found
```

The output must contain the exact string `no compatibility issues found`
with no preceding error lines after every refactor.

## Re-verification

After any cleanup PR that touches the rendering pipeline, dataset
loading, playback engine, UI controls, or event model, run:

```bash
node scripts/validate-playback.js   # expect: 14 passed, 0 failed
node scripts/browser-smoke.js       # expect: no compatibility issues found
sha256sum data/engagement.json data/example.json
```

Then diff:

1. The terminal summary line counts against the **Automated baseline
   output** section above. Any drop in the `passed` count, or any
   non-zero `failed`, is a regression.
2. The dataset SHA-256 values against the **Snapshot** table. Any change
   without a documented dataset update is a regression.
3. The HUD snapshots at the timestamps in the **HUD snapshots at key
   timestamps** table against a fresh computation from the refactored
   playback. Any change in `range` or `closure` larger than 1% (rounding
   jitter) is a regression.
4. The visual smoke checks in `docs/REGRESSION_CHECKLIST.md` against a
   browser. This step requires a human; it cannot be automated.

## Out of scope

Reference screenshots are recorded manually during the visual smoke
check (see `docs/REGRESSION_CHECKLIST.md`) and are not stored in the
repository. Storing image diffs would require an external visual-diff
service which is not in scope for this baseline.
