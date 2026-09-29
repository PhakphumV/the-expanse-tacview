# Module boundaries

The application is split into native ES modules under `js/` plus a
stylesheet under `css/`. No build step or bundler is involved; `index.html`
loads `js/main.js` with `<script type="module">`.

| Module              | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `js/main.js`                    | Entry point: wires modules together, runs the per-frame update/render loop |
| `js/core/playback.js`            | Dataset load, keyframe interpolation, integrated state, play/pause/speed/time |
| `js/core/integrator.js`          | Pure-math forward integration of position and orientation                 |
| `js/data/telemetry.js`           | Derived G-force, aspect angle, range, closure, acceleration, and attitude  |
| `js/data/lock-state.js`          | Builds lock intervals from `lock`/`unlock` events                         |
| `js/data/event-model.js`         | Pure event semantics shared by summaries, lock state, effects, and descriptions |
| `js/render/scene.js`             | Three.js scene, camera, renderer, resize                                  |
| `js/render/ship-models.js`       | Original procedural ship geometry                                         |
| `js/render/entities.js`          | Ship hull rendering, fading trails, and 2D entity labels                 |
| `js/render/weapons.js`            | Torpedo meshes and PDC tracer line segments                               |
| `js/render/effects.js`            | Procedural burst effects at intercept/hit events                          |
| `js/render/camera.js`             | Center/Chase camera, orbit controls, and chase-target cycling             |
| `js/render/presentation.js`      | Engagement summary, replay status, and range rings                        |
| `js/render/starfield.js`         | Three-layer starfield with inertial-frame parallax                        |
| `js/ui/hud.js`                    | HUD panels and lock indicator                                             |
| `js/ui/timeline.js`               | Timeline, replay controls, speed, and event markers                       |
| `js/ui/event-log.js`              | Scrolling event log with click-to-seek                                    |
| `js/ui/info-panel.js`             | Shared Summary / Events tab panel                                         |
| `js/ui/engagement-selector.js`    | Engagement dropdown and dataset error states                              |
| `js/utils/config.js`              | Shared runtime tuning for camera, starfield, telemetry, HUD, and playback |
| `js/utils/math.js`                | Three.js-independent scalar, vector, quaternion, and formatting helpers  |
| `js/utils/listeners.js`           | Listener registration scope with idempotent teardown                     |
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
main → core/playback, data/telemetry, data/lock-state, render/*, ui/*
core/playback → core/integrator, utils/math, utils/config
core/integrator → utils/math, utils/config
data/telemetry → core/playback, utils/math, utils/config
data/lock-state → core/playback, data/event-model
render/effects → core/playback, data/event-model
render/entities → core/playback, render/ship-models
render/weapons → core/playback, render/entities, utils/math
render/camera → core/playback, utils/math, utils/listeners, utils/config
render/presentation → core/playback, data/event-model, utils/math, utils/config
render/starfield → core/playback, utils/config
ui/hud → core/playback, data/telemetry, data/lock-state, utils/config
ui/timeline → core/playback, utils/math, utils/listeners, utils/config
ui/event-log → core/playback, data/event-model
ui/info-panel → ui/event-log, utils/listeners
ui/engagement-selector → core/playback
utils/*, data/event-model, render/ship-models → no dependencies
```

No circular dependencies. `playback` is the only stateful singleton that
other modules consume; everything else is a pure consumer or a renderer
that takes its dependencies via factory arguments.
