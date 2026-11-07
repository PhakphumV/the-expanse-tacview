# The Expanse Tacview

A static, server-less WebGL space-object telemetry viewer built with Three.js.
It renders real orbital data — the International Space Station and China's
Tiangong (CSS) — using a **state-vector ephemeris** grounded in the CCSDS
OMM / OEM / XTCE recommendations (see **[SCHEMA.md](SCHEMA.md)** and
`docs/adr/`), plus the Moon as a moving celestial track.

This is the foundational step toward an Expanse-themed tactical viewer: a
solid, standards-driven space-telemetry layer that any future scenario (moving
objects, tracking, combat tracks) builds on top of.

## Run

Static HTML, **no build step, no server, no fetch**. Open `index.html`
directly in a modern browser (Chrome, Firefox, Safari) or drop the folder on
any static host. The dataset is embedded in `js/scenarios-data.js`.

```bash
# Optional — any static file server also works if you prefer one:
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Features

- **Real orbits — ISS (NORAD 25544) and Tiangong / CSS (NORAD 48274)**: each a
  pre-baked two-orbit LVLH ephemeris of position/velocity/orientation samples,
  propagated offline from live element sets, no runtime SGP4. HUD shows the
  active object's altitude, ground speed, and ECI position.
- **Space-object telemetry engine** (`js/ephemeris.js`): time-based
  interpolation of state-vector samples, per track.
- **Multiple scenarios & timeline events** (`js/ephemeris.js`, `js/timeline.js`):
  a SCENARIO selector switches between replayable missions; each scenario can
  carry labeled events rendered as markers on the timeline scrub bar, and every
  marker is a click-to-jump target. Events typed `phase` drive the header's
  PHASE readout, so a long mission reads as a sequence of phases rather than a
  bare clock. A scenario may also declare its own `default_speed`,
  `default_target` and framing distance.
- **Apollo 11, 1969** (`data/scenarios.json`): an eight-phase replay from launch
  to splashdown — 195 h 18 m of real mission time with the Moon on its true
  geocentric ephemeris (JPL Horizons/DE441). Phase 1 is in: `COLUMBIA` launches,
  climbs through S-IC/S-II staging, parks in a 185.5 km orbit and burns TLI onto
  the published Apollo 11 cutoff state. Remaining phases are tracked in
  `docs/apollo11-phases.md`.
- **Readable at any scale** (`js/entities.js`): bodies and spacecraft keep a
  minimum apparent size, so a 26 m vehicle and a 3 500 km Moon both stay visible
  at cislunar range instead of collapsing to a pixel.
- **Selectable target HUD** (`js/hud.js`): lists every celestial body (Earth,
  Moon) and space object (ISS, Tiangong); click to retarget the camera and see
  that target's telemetry (altitude/speed/position for objects; radius/orbit
  for bodies).
- **Gradient ribbon trails** (`js/entities.js`): each artificial space object
  leaves a bright, orientation-aware ribbon (body-roll oriented, head→tail color
  gradient) whose width scales with camera distance so it stays visible when
  zoomed out. Celestial bodies (`kind: "celestial"`, i.e. the Moon) use the same
  ribbon in a subdued form — colder, thinner, but kept in the orbital plane — so
  a body's arc never competes with a spacecraft's track.
- **Viewport** (`js/camera.js`): two modes — **Orbit** (free rotation around the
  selected target) and **Follow** (chase the selected moving object; drag to
  orbit it, zoom to pull in). Zoom via wheel, `+`/`-`/PageUp/PageDown, or the
  slider. No distracting background starfield.
- Celestial bodies: wireframe Earth (static) and the Moon, which is a celestial
  telemetry track moving along its tilted mean orbital path ring
  (`js/scene.js` + `data/scenarios.json`).
- Clean timeline: play/pause, restart, jump, scrubbing, speed (0.25x–8192x).
- **One scenario in memory at a time** (`js/scenario-loader.js`): the page boots
  from a ~1 KB manifest, then injects the `<script>` for the scenario you pick
  and releases the previous payload (and disposes the previous scene's
  geometries). Only the payload being watched is decoded into vectors.

## Project structure

```
index.html                — application entry (embeds classic scripts + data)
SCHEMA.md                 — telemetry contract (OMM/OEM/XTCE)
CONTEXT.md                — domain glossary
docs/adr/                 — architecture decision records
data/
  scenarios.json         — canonical source dataset (validated by npm test)
js/
  main.js                 — entry point, wiring, per-frame loop
  scenario-loader.js      — loads/releases one scenario payload at a time
  scene.js                — ECI scene, Earth body (no starfield)
  orbit-ring.js           — faint orbit guide ring derived from a celestial track
  ephemeris.js            — track/ephemeris engine (state queries, playback)
  entities.js             — per-track body, orbital path, ribbon trails (object vs celestial)
  spacecraft-model.js     — procedural spacecraft body (heading/orientation)
  labels.js               — billboarded on-screen labels (one per track)
  camera.js               — Orbit / Follow viewport modes around a target
  hud.js                  — selectable target list + per-target readouts
  timeline.js             — scrubber, play/pause, jump, speed, event markers
  scenarios-data.js       — generated manifest (ids, names, counts, hints)
  scenario-<id>.js        — generated per-scenario payload (tracks + events)
scripts/
  validate-telemetry.js   — validates the contract (shape, quaternions, heading)
  embed-scenarios.js      — splits data/scenarios.json into the files above
docs/
  adr/                    — architecture decision records
  apollo11-phases.md      — Apollo 11 phase plan, data anchors and provenance
```

## Development

```bash
npm test        # validate data/scenarios.json against SCHEMA.md + JS syntax
npm run embed   # regenerate js/scenarios-data.js + js/scenario-<id>.js
```

New datasets are authored as JSON against `SCHEMA.md`. `data/scenarios.json` is
the canonical source; `npm run embed` splits it into one payload per scenario
(`js/scenario-<id>.js`) plus a manifest (`js/scenarios-data.js`), so the viewer
only ever loads the scenario being watched. `npm test` fails if the generated
files drift from the canonical dataset.

## License

MIT. Ship models and telemetry are original synthetic creations.
