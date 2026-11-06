# The Expanse Tacview

A static, server-less WebGL space-object telemetry viewer built with Three.js.
It renders real orbital data — starting with the International Space Station —
using a **state-vector ephemeris** grounded in the CCSDS OMM / OEM / XTCE
recommendations (see **[SCHEMA.md](SCHEMA.md)** and `docs/adr/`).

This is the foundational step toward an Expanse-themed tactical viewer: a
solid, standards-driven space-telemetry layer that any future scenario (moving
objects, tracking, combat tracks) builds on top of.

## Run

Static HTML, **no build step, no server, no fetch**. Open `index.html`
directly in a modern browser (Chrome, Firefox, Safari) or drop the folder on
any static host. The dataset is embedded in `js/iss-data.js`.

```bash
# Optional — any static file server also works if you prefer one:
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Features

- **Real ISS orbit** (NORAD 25544): a pre-baked two-orbit LVLH ephemeris of
  position/velocity/orientation samples — propagated offline, no runtime
  SGP4. The HUD shows altitude, ground speed, and ECI position.
- **Space-object telemetry engine** (`js/ephemeris.js`): time-based
  interpolation of state-vector samples.
- **Three viewport modes** (`js/camera.js`): Orbit (free), Follow (locked
  behind the object's velocity, showing heading), Inertial (fixed ECI framing).
- **Orbital path + trail**: full two-orbit path line and a short fading trail.
- Clean timeline: play/pause, restart, jump, scrubbing, speed (0.25x–8x).

## Project structure

```
index.html              — application entry (embeds classic scripts + data)
SCHEMA.md               — telemetry contract (OMM/OEM/XTCE)
CONTEXT.md              — domain glossary
docs/adr/               — architecture decision records
data/
  iss.json              — canonical source dataset (validated by npm test)
js/
  main.js               — entry point, wiring, per-frame loop
  scene.js              — ECI scene, starfield, Earth reference
  ephemeris.js          — track/ephemeris engine (state queries, playback)
  entities.js           — tracked object, orbital path, trail
  spacecraft-model.js   — procedural spacecraft body (heading/orientation)
  labels.js             — billboarded on-screen label
  camera.js             — Orbit / Follow / Inertial viewport modes
  hud.js                — altitude, ground speed, ECI position readouts
  timeline.js           — scrubber, play/pause, jump, speed
  iss-data.js           — generated from data/iss.json (do not edit by hand)
scripts/
  validate-telemetry.js — validates the contract (shape, quaternions, heading)
```

## Development

```bash
npm test        # validate data/iss.json against SCHEMA.md + JS syntax
```

To regenerate `js/iss-data.js` from `data/iss.json` after editing the data:

```bash
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("data/iss.json","utf8"));fs.writeFileSync("js/iss-data.js","// Generated from data/iss.json (canonical source). Do not edit by hand.\nwindow.TacviewData = "+JSON.stringify(d)+";\n")'
```

New datasets are authored as JSON against `SCHEMA.md`; `data/iss.json` is the
canonical source and `js/iss-data.js` is the embedded static copy.

## License

MIT. Ship models and telemetry are original synthetic creations.
