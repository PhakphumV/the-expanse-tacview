# Regression Test Checklist

Run this checklist after any change that touches the rendering pipeline,
dataset loading, playback engine, UI controls, or event model. Each test
documents the user-visible flow being verified.

**Target browsers:** Chrome 90+, Firefox 90+, Safari 14+.
**Serving:** `python3 -m http.server 8000` from the repo root, then open
`http://localhost:8000/`.

Pass criteria for each test:
- No console errors (warnings allowed).
- Visible state matches the expected result.

Mark each cell with: ✓ pass, ✗ fail, or N/A. For failures, file an
issue with reproduction steps.

## 1. Initial load

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Page loads without console errors           |        |         |        |
| 2 | WebGL canvas renders the starfield          |        |         |        |
| 3 | ROCI and ZMEYA meshes appear                |        |         |        |
| 4 | Torpedo and PDC meshes appear               |        |         |        |
| 5 | HUD panels populate (no "---" stuck)        |        |         |        |
| 6 | Mission panel shows `STANDBY` at t=0        |        |         |        |
| 7 | Timeline renders with event markers         |        |         |        |
| 8 | Event log populates with all 18 events      |        |         |        |
| 9 | Info panel shows Summary tab by default     |        |         |        |
| 10| Help overlay opens via `?` key              |        |         |        |
| 11| Engagement dropdown lists the dataset entry |        |         |        |

## 2. Playback

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Play button toggles to `Pause` and back     |        |         |        |
| 2 | Spacebar toggles play/pause                 |        |         |        |
| 3 | Time advances during playback at 1x         |        |         |        |
| 4 | 0.25x speed slows playback correctly        |        |         |        |
| 5 | 2x and 4x speeds speed up playback          |        |         |        |
| 6 | Mission state transitions to `ENGAGEMENT`   |        |         |        |
| 7 | Mission state transitions to `RESOLUTION`   |        |         |        |

## 3. Seeking

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Click anywhere on scrub bar seeks           |        |         |        |
| 2 | Drag scrub bar continuously seeks           |        |         |        |
| 3 | Scrubbing forward works past midpoint       |        |         |        |
| 4 | Scrubbing backward works                    |        |         |        |
| 5 | `Home` / `0` keys jump to t=0               |        |         |        |
| 6 | `End` key jumps to t=duration               |        |         |        |
| 7 | `R` key restarts playback                   |        |         |        |
| 8 | `Left` / `J` keys step to previous event    |        |         |        |
| 9 | `Right` / `L` keys step to next event       |        |         |        |
| 10| Clicking event-log entry seeks to that time |        |         |        |

## 4. Camera modes

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Orbit mode allows mouse drag rotation       |        |         |        |
| 2 | Orbit mode allows scroll zoom               |        |         |        |
| 3 | Chase mode follows ROCI                     |        |         |        |
| 4 | Top mode auto-frames both ships             |        |         |        |
| 5 | `1` key switches to Orbit                   |        |         |        |
| 6 | `2` key switches to Chase                   |        |         |        |
| 7 | `3` key switches to Top                     |        |         |        |
| 8 | Mode buttons highlight active mode          |        |         |        |

## 5. Weapon and effect rendering

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Torpedo meshes fade in at launch            |        |         |        |
| 2 | Torpedo meshes fade out at despawn          |        |         |        |
| 3 | PDC tracers render between PDC events       |        |         |        |
| 4 | Burst effects at `intercept` events         |        |         |        |
| 5 | Burst effects at `hit` events (red)         |        |         |        |
| 6 | Burst position matches the affected entity  |        |         |        |

## 6. UI synchronization

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | HUD values update with playback time        |        |         |        |
| 2 | Event log auto-scrolls to current event     |        |         |        |
| 3 | Timeline event markers show at correct x    |        |         |        |
| 4 | Marker tooltips show structured fields      |        |         |        |
| 5 | Mission state changes when scrubbing past first/last event | | | |
| 6 | Lock indicator turns ON during lock window  |        |         |        |
| 7 | Lock indicator turns OFF after unlock       |        |         |        |

## 7. Trails / labels / info panel

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Trails button toggles ship trails on/off    |        |         |        |
| 2 | `T` key toggles trails                      |        |         |        |
| 3 | Entity labels visible above ships           |        |         |        |
| 4 | Labels hidden when ship inactive            |        |         |        |
| 5 | Events tab shows log; click seeks replay    |        |         |        |
| 6 | Tab switch keeps replay time and camera     |        |         |        |

## 8. Engagement switching

| # | Test                                        | Chrome | Firefox | Safari |
| - | ------------------------------------------- | ------ | ------- | ------ |
| 1 | Switching engagement pauses and resets to T+00:00 |  |         |        |
| 2 | Timeline duration/markers match selection   |        |         |        |
| 3 | Event log shows only selected engagement    |        |         |        |
| 4 | No stale trails/weapons/effects after switch|        |         |        |
| 5 | Camera mode preserved across a switch       |        |         |        |

## 9. Browser-specific defects

Any defects discovered while running this checklist are recorded below
with reproduction steps.

| Date | Browser | Defect | Reproduction | Workaround |
| ---- | ------- | ------ | ------------ | ---------- |
|      |         |        |              |            |

## Automation

What this repo can run automatically (no browser required):

- `node scripts/validate-playback.js` — telemetry consistency, dataset
  shape, all JS module syntax.
- `node scripts/browser-smoke.js` — static analysis for browser
  compatibility.

What must be run manually with a real browser:

- Everything in sections 1–7 above.
