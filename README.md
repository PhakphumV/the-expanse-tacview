# The Expanse Tacview

A static, server-less WebGL space-object telemetry viewer built with Three.js.
It renders real orbital data — the International Space Station and China's
Tiangong (CSS) — using a **state-vector ephemeris** grounded in the CCSDS
OMM / OEM / XTCE recommendations (see **[SCHEMA.md](SCHEMA.md)** and
`docs/adr/`), plus the Moon as a celestial body.

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
  carry labeled events rendered as markers on the timeline scrub bar (e.g. an
  upcoming Apollo 11 / Apollo 13 scenario with its mission events — real
  NASA/SPICE trajectory data planned for a future session).
- **Selectable target HUD** (`js/hud.js`): lists every celestial body (Earth,
  Moon) and space object (ISS, Tiangong); click to retarget the camera and see
  that target's telemetry (altitude/speed/position for objects; radius/orbit
  for bodies).
- **Gradient ribbon trails** (`js/entities.js`): each spacecraft leaves an
  orientation-aware ribbon (body-roll oriented, head→tail color gradient) whose
  width scales with camera distance so it stays visible when zoomed out.
- **Viewport** (`js/camera.js`): two modes — **Orbit** (free rotation around the
  selected target) and **Follow** (chase the selected moving object; drag to
  orbit it, zoom to pull in). Zoom via wheel, `+`/`-`/PageUp/PageDown, or the
  slider. No distracting background starfield.
- Celestial bodies: wireframe Earth and Moon (with its mean orbital path ring)
  in the ECI scene (`js/scene.js`).
- Clean timeline: play/pause, restart, jump, scrubbing, speed (0.25x–512x).

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
  scene.js                — ECI scene, Earth + Moon bodies (no starfield)
  ephemeris.js            — track/ephemeris engine (state queries, playback)
  entities.js             — per-track object, orbital path, gradient ribbon
  spacecraft-model.js     — procedural spacecraft body (heading/orientation)
  labels.js               — billboarded on-screen labels (one per track)
  camera.js               — Orbit / Follow viewport modes around a target
  hud.js                  — selectable target list + per-target readouts
  timeline.js             — scrubber, play/pause, jump, speed, event markers
  scenarios-data.js       — generated from data/scenarios.json (do not edit)
scripts/
  validate-telemetry.js   — validates the contract (shape, quaternions, heading)
```

## Development

```bash
npm test        # validate data/scenarios.json against SCHEMA.md + JS syntax
```

To regenerate `js/scenarios-data.js` from `data/scenarios.json` after editing the
data:

```bash
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("data/scenarios.json","utf8"));fs.writeFileSync("js/scenarios-data.js","// Generated from data/scenarios.json (canonical source). Do not edit by hand.\nwindow.TacviewData = "+JSON.stringify(d)+";\n")'
```

New datasets are authored as JSON against `SCHEMA.md`; `data/scenarios.json` is the
canonical source and `js/scenarios-data.js` is the embedded static copy.

## License

MIT. Ship models and telemetry are original synthetic creations.
