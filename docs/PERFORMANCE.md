# Rendering Performance and Resource Lifecycle

This document captures the baseline performance characteristics of the
application, the resource lifecycle policy, and the targets that
count as "good enough" on the supported hardware.

## Test environment

- **Browsers:** Chrome 90+, Firefox 90+, Safari 14+
- **Hardware:** integrated GPU (Intel UHD or Apple Silicon) is the
  floor; mid-range discrete GPUs trivially exceed targets
- **Display:** 60 Hz refresh assumed; the application is capped at
  `requestAnimationFrame` cadence so it never burns frames
- **Serving:** local HTTP origin (`python3 -m http.server 8000`)

## Performance targets

| Metric                       | Target                     |
| ---------------------------- | -------------------------- |
| Frame rate at 1920×1080      | ≥ 55 fps                   |
| Frame rate at 4K (3840×2160) | ≥ 30 fps                   |
| Draw calls per frame         | ≤ 50                       |
| DOM writes per frame         | ≤ 30                       |
| JS heap growth over 1 hour   | bounded (no leak)          |

## Per-frame inventory

The animate loop runs the following updates every frame. Each item is
bounded so it does not scale with replay duration:

| Module              | Work                                            | Bounded by                         |
| ------------------- | ----------------------------------------------- | ---------------------------------- |
| `hud.js`            | 12 `textContent` writes, mission state class    | Cached — skipped when unchanged    |
| `timeline.js`       | 2 `style.width`/`left` writes, 1 `textContent`  | Per-frame time advance only        |
| `event-log.js`      | N `style.display` toggles, 1 `scrollTop`        | Only when last-visible index moves |
| `entities.js`       | 2 ship meshes + 2 trail buffers                 | Bounded by entity count            |
| `weapons.js`        | 4 torpedo spheres + 6 PDC line segments         | Bounded by entity count            |
| `effects.js`        | burst_count additive spheres                    | Bounded by intercept/hit events    |
| `labels`            | 2 ship `style.left`/`top` writes                | Only visible ships                 |

## Three.js resource lifecycle

Geometries and materials are created once during `load()` and reused
for the lifetime of the page:

- 2 ship models (composite Groups built from primitives; original
  procedural silhouettes, no external assets)
- 4 torpedo SphereGeometries + MeshBasicMaterials
- 6 PDC BufferGeometries + LineBasicMaterials
- 2 trail BufferGeometries (30-sample ring buffers)
- 6000-point starfield BufferGeometry
- burst_count SphereGeometries (one per `intercept`/`hit` event)
- MeshBasicMaterial per mesh (color-only, no textures)

**Reuse:** bursts, trails, labels, HUD elements, and event-log entries
are all reused across the full replay. No new geometry is created
mid-playback.

**Disposal:** `dispose()` is not currently called on individual
geometries/materials. Resources are bounded by the dataset size, not
by replay duration, so there is no leak in normal use. If a future
feature loads multiple datasets sequentially, the dataset swap should
call `scene.remove` + `geometry.dispose` + `material.dispose` for
each entry in the previous load.

## Memory growth test

Replay the engagement from t=0 to t=duration, then `jumpToStart()`
and replay again, 100 times. Expected result:

- JS heap: stable (within ±10 MB of the post-load baseline)
- No new Three.js resources in the scene graph
- DOM tree: stable (event-log entries, labels, HUD all reused)
- Burst count: stable (created once in `loadBursts()`)

Run with: open DevTools → Memory tab → take heap snapshot, replay
100 cycles, take another snapshot, compare retained size.

## Graceful degradation

The application is intentionally lightweight:

- All meshes use `MeshBasicMaterial` (no lighting, no shadows)
- No post-processing (no bloom, no SSAO, no tone mapping)
- Starfield point count is fixed at 6000; reducing it lowers GPU
  vertex throughput at the cost of visual density
- Trail sample count is fixed at 30; reduce `TRAIL_SAMPLES` in
  `js/entities.js` for weaker hardware
- Burst duration is 1.0 s; shorter bursts reduce overdraw cost

If a future deployment runs on much weaker hardware (mobile, low-end
Chromebook), the levers are:

1. Lower `TRAIL_SAMPLES` in `js/entities.js`
2. Lower the starfield point count in `js/scene.js`
3. Reduce the number of PDC rounds / torpedoes in the dataset
4. Reduce `BURST_DURATION` in `js/effects.js`

Each lever is documented inline at its definition site.

## Static resource audit

`scripts/resource-audit.js` reports the entity counts, mesh parts,
burst count, starfield size, and per-frame DOM update inventory for
the committed dataset. Run with:

```
node scripts/resource-audit.js
```
