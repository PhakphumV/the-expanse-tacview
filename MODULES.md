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

## Dependency direction

```
main → scene, playback, telemetry, lock-state, entities, weapons,
       effects, camera, hud, timeline, event-log, info-panel,
       engagement-selector, starfield
playback → integrator        (forward integration primitives)
telemetry   → playback
lock-state  → playback, event-model
effects     → playback, event-model
event-log   → playback, event-model
presentation → playback, event-model
entities    → playback
weapons     → playback, entities   (shares trail history)
camera      → playback
starfield   → playback           (reads integrated velocity for v_frame)
hud         → playback, telemetry, lock-state
timeline    → playback
info-panel  → event-log            (re-syncs scroll on tab show)
engagement-selector → playback     (collection metadata + selection)
```

No circular dependencies. `playback` is the only stateful singleton that
other modules consume; everything else is a pure consumer or a renderer
that takes its dependencies via factory arguments.
