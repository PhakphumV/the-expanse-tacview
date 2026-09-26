# Module boundaries

The application is split into native ES modules under `js/` plus a
stylesheet under `css/`. No build step or bundler is involved; `index.html`
loads `js/main.js` with `<script type="module">`.

| Module              | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `js/main.js`        | Entry point: wires modules together, runs the per-frame loop       |
| `js/scene.js`       | Three.js scene, camera, renderer, OrbitControls, starfield, resize |
| `js/playback.js`    | Dataset load, keyframe interpolation, play/pause/speed/time         |
| `js/telemetry.js`   | Derived G-force, aspect angle, range, closure rate                 |
| `js/lock-state.js`  | Builds lock intervals from `lock`/`unlock` events                  |
| `js/entities.js`    | Ship hulls, fading trails, and 2D entity labels                    |
| `js/weapons.js`     | Torpedo meshes and PDC tracer line segments                        |
| `js/effects.js`     | Procedural burst effects at intercept/hit events                   |
| `js/camera.js`      | Camera mode switcher (Orbit / Chase / Top-Down)                    |
| `js/hud.js`         | HUD panels and lock indicator                                      |
| `js/timeline.js`    | Timeline scrubber, play/pause, speed, event markers                |
| `js/event-log.js`   | Scrolling event log with click-to-seek                             |
| `js/minimap.js`     | 2D overview canvas                                                 |
| `css/tacview.css`   | All application styles                                             |

## Dependency direction

```
main → scene, playback, telemetry, lock-state, entities, weapons,
       effects, camera, hud, timeline, event-log, minimap
telemetry   → playback
lock-state  → playback
entities    → playback
weapons     → playback, entities   (shares trail history)
effects     → playback
camera      → playback
hud         → playback, telemetry, lock-state
timeline    → playback
event-log   → playback
minimap     → playback
```

No circular dependencies. `playback` is the only stateful singleton that
other modules consume; everything else is a pure consumer or a renderer
that takes its dependencies via factory arguments.
