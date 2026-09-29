# Contributing

Contributions should preserve the project's role as a static, deterministic
browser replay viewer. Read `AGENTS.md` for AI-specific implementation rules
and `ARCHITECTURE.md` for system boundaries and performance targets.

## Getting started

Prerequisites:

- Git
- Node.js for the repository validation scripts
- Python 3 or another static HTTP server
- A supported modern browser with WebGL 2; see `docs/BROWSER_COMPAT.md`

The application has no install, build, or package-manager step. Three.js r128
is loaded from cdnjs, so the browser needs network access to that CDN.

```bash
git clone https://github.com/PhakphumV/the-expanse-tacview.git
cd the-expanse-tacview
python3 -m http.server 8000
```

Open `http://localhost:8000/`. On Windows, use `python -m http.server 8000` if
the `python3` command is unavailable. Do not open the page through `file://`;
the browser must fetch the engagement collection over HTTP.

## Development workflow

1. Start from an issue or a clearly scoped bug/feature. Check existing module
   ownership and related architecture decisions before changing behavior.
2. Create a focused branch from an up-to-date `main` branch. Use
   `feat/<short-kebab-name>`, `fix/<short-kebab-name>`,
   `docs/<short-kebab-name>`, or `chore/<short-kebab-name>`.
3. Make a small, reviewable change in the owning module. Keep unrelated
   cleanup separate. Make commits atomic: each commit should represent one
   independently understandable change and should leave the project coherent.
4. Update `SCHEMA.md`, `MODULES.md`, `ARCHITECTURE.md`, or relevant ADRs when
   the data contract, module boundary, coordinate convention, or architecture
   changes.
5. Run the relevant checks below and manually verify browser behavior when
   touching rendering, camera, controls, layout, or input.
6. Open a pull request against `main`. Summarize behavior changes, list
   validation performed, include screenshots for visible changes, and call
   out limitations or unverified performance claims.

Reviewers should check correctness, compatibility with existing engagements,
resource lifecycle, coordinate/unit consistency, and whether tests cover the
changed behavior. Schema or public module API changes need explicit review.

## Commit messages

Use this format:

```text
<type>(<scope>): <imperative summary>
```

Use a lowercase type and scope, a concise summary in the imperative, and no
trailing period. Scopes are recommended for subsystem changes; omit the scope
for a truly repository-wide change. Keep each commit focused and use a body
when the reason or compatibility impact is not clear from the subject.

Common types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, and `chore`.
Choose a scope that identifies the real owner, not a speculative subsystem:

| Current domain | Useful scopes | Example |
| --- | --- | --- |
| SYS-CORE replay/integration | `playback`, `integrator`, `telemetry` | `fix(playback): clamp queries at engagement bounds` |
| SYS-CAM | `camera` | `feat(camera): add target-relative orbit input` |
| SYS-RENDER | `render`, `entities`, `weapons`, `effects`, `starfield` | `perf(entities): reuse trail position buffers` |
| SYS-DATA | `data`, `schema`, `validation` | `docs(schema): clarify angular velocity units` |
| SYS-UI | `ui`, `timeline`, `hud` | `fix(timeline): keep event seek within duration` |
| Project documentation | `architecture`, `agents`, `contributing` | `docs(architecture): document module boundaries` |

These domain labels organize existing code; they do not imply that separate
SYS-* packages or services exist.

## Validation and testing

There is no configured unit-test framework, linter, formatter, TypeScript
compiler, or automated browser-test command. Do not report those checks as
passing unless such tooling is added and run. Use the repository scripts:

```bash
node scripts/validate-playback.js
node scripts/browser-smoke.js
node scripts/resource-audit.js
```

- Run `validate-playback.js` for dataset, interpolation/integration,
  determinism, event, and telemetry changes. Add or update checks when a new
  invariant is introduced.
- Run `browser-smoke.js` for its static compatibility scan; it does not launch
  a browser or test interactions.
- Run `resource-audit.js` when changing dataset size, per-entity resources,
  or frame-update work. It is a static inventory, not a benchmark.
- For camera, rendering, controls, responsive layout, or DOM behavior, serve
  the app over HTTP and verify the actual browser interaction, console, and
  relevant viewport sizes.
- For coordinate transforms, check right-handed Y-up / forward -Z behavior,
  units, quaternion order, and boundary cases. Add automated assertions where
  the behavior can be tested deterministically.
- For integration or telemetry math, validate against known values and run
  the playback validator. This is a replay viewer, not a live physics engine.
- For performance or memory work, measure representative data in a named
  browser and hardware setup. Record frame-time/heap methodology and compare
  against `docs/PERFORMANCE.md`; do not infer runtime performance from source
  scans alone.

## Code quality and performance

- Follow the surrounding JavaScript style and keep native ES modules; there is
  no configured formatter or linter to silently rewrite files.
- Keep validation at data boundaries and reuse `SCHEMA.md` rather than adding
  conflicting field/unit definitions in consumers.
- Avoid unnecessary allocations in the animation path, reuse stable buffers
  and Three.js resources, and release resources when their owning module
  replaces them. Zero-GC is a goal for hot paths, not a verified project-wide
  guarantee.
- Treat the frame-time splits in `ARCHITECTURE.md` as unprofiled targets.
  Profile before claiming a budget, heap limit, or scaling ceiling is met.
- Add no dependency, build system, TypeScript, WebGPU/TSL renderer, or model
  pipeline without a scoped design decision and a working validation path.
- Keep documentation accurate to shipped behavior; label proposals and
  unverified targets explicitly.

## Pull request checklist

- [ ] Change is limited to the issue or stated goal; commits are atomic.
- [ ] Relevant validation scripts pass; browser behavior was checked when
      applicable.
- [ ] Dataset/API/coordinate/performance documentation is updated if needed.
- [ ] Resource creation, reuse, and disposal have been considered.
- [ ] Performance and memory statements include actual measurements or are
      clearly labeled as targets.
- [ ] PR description lists checks run, screenshots for visible changes, and
      any remaining risks or unverified requirements.