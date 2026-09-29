# Module boundaries

The application is split into native ES modules under `js/` plus a
stylesheet under `css/`. No build step or bundler is involved; `index.html`
loads `js/main.js` with `<script type="module">`.

| Module              | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `js/main.js`        | Entry point: wires modules together, runs the per-frame loop       |
| `js/scene.js`       | Three.js scene, camera, renderer, resize                           |
| `js/playback.js`    | Dataset load, keyframe interpolation, integrated state, play/pause/speed/time |
| `js/integrator.js`  | Pure-math forward integration: position (`pos += vel·dt`) and orientation (exponential map from body-frame ω, with synthetic ω derivation from quaternion deltas) |
| `js/telemetry.js`   | Derived G-force, aspect angle, range, closure rate, Acceleration, Burn Direction, Heading / Pitch / Roll |
| `js/lock-state.js`  | Builds lock intervals from `lock`/`unlock` events                  |
| `js/event-model.js` | Pure event semantics shared by summaries, lock state, effects, and event descriptions |
| `js/utils/config.js` | Shared runtime tuning for camera, starfield, telemetry, HUD, and playback |
| `js/utils/math.js`  | Three.js-independent scalar, vector, quaternion, and formatting helpers |
| `js/utils/listeners.js` | Listener registration scope with idempotent teardown              |
| `js/entities.js`    | Ship hulls, fading trails, and 2D entity labels                    |
| `js/weapons.js`     | Torpedo meshes and PDC tracer line segments                        |
| `js/effects.js`     | Procedural burst effects at intercept/hit events                   |
| `js/camera.js`      | Camera mode switcher (Center of Engagement / Chase) with chase-target cycling |
| `js/starfield.js`   | Three-layer procedural starfield with inertial-frame parallax (drifts opposite to v_frame = 0.5 * (v_roci + v_zmeya)) |
| `js/hud.js`         | HUD panels and lock indicator                                      |
| `js/timeline.js`    | Timeline scrubber, play/pause, speed, event markers                |
| `js/event-log.js`   | Scrolling event log with click-to-seek                             |
| `js/info-panel.js`  | Shared Summary / Events tab panel                                  |
| `js/engagement-selector.js` | Engagement dropdown and dataset error states             |
| `css/tacview.css`   | All application styles                                             |

## Factory lifecycle

Factories receive their collaborators as arguments. The camera, HUD, timeline,
event log, presentation, and info-panel factories expose a common
`update(time)`, `reset()`, and `destroy()` lifecycle; module-specific methods
remain available for actions such as populating markers or selecting a camera
mode. `destroy()` is idempotent and releases listeners owned by the module.
The composition root calls teardown on `pagehide`.

## Dependency direction

```
main → scene, playback, telemetry, lock-state, entities, weapons,
       effects, camera, hud, timeline, event-log, info-panel,
       engagement-selector, starfield
playback → integrator, math, config
integrator → math, config
telemetry   → playback, math, config
lock-state  → playback, event-model
effects     → playback, event-model
event-log   → playback, event-model
presentation → playback, event-model, math, config
entities    → playback, ship-models
weapons     → playback, entities, math   (shares trail history)
camera      → playback, math, listeners, config
starfield   → playback, config    (reads integrated velocity for v_frame)
hud         → playback, telemetry, lock-state, config
timeline    → playback, math, listeners, config
info-panel  → event-log, listeners (re-syncs scroll on tab show)
engagement-selector → playback     (collection metadata + selection)
config, math, listeners, ship-models → no dependencies
```

No circular dependencies. `playback` is the only stateful singleton that
other modules consume; everything else is a pure consumer or a renderer
that takes its dependencies via factory arguments.
