# AI Agent Instructions

These instructions apply to the repository. Follow them alongside the user's
request and any more specific instructions in the edited directory.

## Project reality

- This is a browser-only tactical replay viewer for authored telemetry, not a
  live simulator, backend, or ACMI importer.
- The application uses native JavaScript ES modules, HTML/CSS, and Three.js
  r128 `WebGLRenderer`, loaded as the `window.THREE` global by `index.html`.
- There is no TypeScript compiler, build step, package manager, WebGPU/TSL
  renderer, or external model-loading pipeline in the current project. Do not
  write instructions or code that assumes those systems exist.
- `main.js` composes the application. `playback.js` owns active dataset,
  engagement, time, and entity state. Respect the dependency directions in
  `MODULES.md` and the current implementation described in `ARCHITECTURE.md`.

## Non-negotiable domain rules

- Preserve replay determinism and authored keyframes as the source of truth.
  Integrated motion between keyframes is a display/playback policy, not an
  autonomous physics simulation; documented drift at keyframe boundaries is
  intentional. Check ADR-0001, ADR-0002, and `VALIDATION.md` before changing it.
- Follow `SCHEMA.md`: time is seconds, position is meters, velocity is m/s,
  orientation is a unit quaternion in `[x, y, z, w]` order, and optional
  body-frame angular velocity is rad/s.
- Spatial coordinates are right-handed, Y-up, and forward is -Z. Keep world,
  ship-local, and camera-relative values distinct. Apply orientation
  transformations exactly once and normalize authored quaternions when
  accepting or producing transformed data.
- Do not invent six-degree-of-freedom forces, RCS/fuel consumption, dynamic
  origin translation, or center-of-mass behavior. Those are not implemented;
  treat them as separate features requiring explicit design and tests.
- Keep telemetry validation and event meanings aligned with `SCHEMA.md` and
  `scripts/validate-playback.js`; avoid duplicating authoritative data rules
  in UI consumers.

## Implementation constraints

- Start from the module that owns the behavior. Make the smallest coherent
  change, preserve established APIs, and avoid unrelated cleanup.
- Pass collaborators into module factories as the existing code does. Do not
  create circular imports, hidden global state, or an event bus for synchronous
  calls that can remain direct.
- Keep frame-hot work bounded. Prefer reused buffers/scratch values and the
  integrator's output parameters when appropriate. Reuse Three.js resources;
  dispose replaced GPU resources at their owner boundary.
- Minimize garbage collection pressure, but do not claim zero allocations or
  zero-GC behavior without runtime profiling. `resource-audit.js` inventories
  static resource counts; it is not a heap or frame-time profiler.
- Existing performance targets are in `docs/PERFORMANCE.md` and
  `ARCHITECTURE.md`. Treat unprofiled per-module budgets as targets, not
  measured results. Do not introduce arbitrary entity limits without data and
  an explicit compatibility decision.
- Follow the surrounding JavaScript style. Do not add TypeScript, a bundler,
  dependencies, shaders, or a framework unless the task calls for that
  architecture and the change includes the required setup and validation.
- Keep comments focused on non-obvious behavior. Update the owning docs when a
  change alters the schema, module boundary, coordinate convention, or
  performance/resource contract.

## Verification

Choose checks that cover the changed behavior; these existing commands are the
project baseline:

```bash
node scripts/validate-playback.js
node scripts/browser-smoke.js
node scripts/resource-audit.js
```

`validate-playback.js` checks dataset shape, module syntax, integration,
telemetry, events, and deterministic state. `browser-smoke.js` is a static
compatibility scan, not an interactive browser test. For rendering, input,
resize, or DOM behavior, serve the repository over HTTP and test the actual
browser path. For performance or memory claims, record the browser, hardware,
dataset, and measurement method; static audits alone are insufficient.

Before reporting completion, state which checks ran and disclose unavailable
or unverified checks. See `CONTRIBUTING.md` for the contributor workflow and
commit format.