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

| Module | Work | Bounded by |
| --- | --- | --- |
| `js/ui/hud.js` | 20 ship-value text updates plus lock text/class updates | Two displayed ships; values are currently assigned each frame, not cached |
| `js/ui/timeline.js` | 2 scrub style updates and 1 time-readout text update | Fixed per frame while an engagement is loaded |
| `js/ui/event-log.js` | Event visibility toggles and scroll position | Only when the last-visible event index changes |
| `js/render/entities.js` | Ship transforms and trail buffers | Bounded by active ship/entity count |
| `js/render/weapons.js` | Torpedo spheres and PDC tracer segments | Bounded by engagement entities and PDC event windows |
| `js/render/effects.js` | Burst meshes | Bounded by supported burst events with active targets |
| `js/render/entities.js` labels | Position/visibility updates for ship labels | At most two labels in the current UI |

## Three.js resource lifecycle

Scene-level geometries and materials are created once and reused for the page;
engagement-scoped resources are replaced on engagement rebuild. The committed
dataset currently creates:

- 2 ship models (19 original procedural mesh parts in composite Groups)
- 24 torpedo SphereGeometries + MeshBasicMaterials
- 100 PDC tracer segments from 20 `pdc_engagement` event windows
- 2 trail BufferGeometries (30-sample ring buffers)
- 6000-point starfield BufferGeometry
- 23 burst meshes from supported events whose target entity is active
- MeshBasicMaterial per mesh (color-only, no textures)

**Reuse:** trails, labels, HUD elements, and event-log entries are reused
across playback. Burst and tracer geometry is built for the selected engagement,
not allocated as each event is reached in time.

**Disposal:** Engagement-scoped managers remove and dispose replaced
objects when an engagement is rebuilt (`entities.js`, `weapons.js`,
`effects.js`, and `presentation.js`). Scene-level resources persist for
the lifetime of the page. The static resource audit reports expected
counts; it does not measure runtime GPU memory or prove that every new
resource is released. Keep disposal with the module that creates and owns
the resource, and verify the lifecycle when adding new Three.js objects.

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
  `js/render/entities.js` for weaker hardware
- Burst duration is 1.0 s; shorter bursts reduce overdraw cost

If a future deployment runs on much weaker hardware (mobile, low-end
Chromebook), the levers are:

1. Lower `TRAIL_SAMPLES` in `js/render/entities.js`
2. Lower the starfield point count in `js/render/starfield.js`
3. Reduce the number of PDC rounds / torpedoes in the dataset
4. Reduce `BURST_DURATION` in `js/render/effects.js`

Each lever is documented inline at its definition site.

## Static resource audit

`scripts/resource-audit.js` reports the entity counts, mesh parts,
burst count, starfield size, and per-frame DOM update inventory for
the committed dataset. Run with:

```
node scripts/resource-audit.js
```
