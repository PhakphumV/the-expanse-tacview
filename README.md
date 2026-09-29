# The Expanse Tacview

A static, single-file WebGL telemetry viewer built with Three.js, inspired
by the *Expanse* universe. This project is an original, synthetic
visualization. **All ship models and telemetry data are original creations
and are not reproductions or extracts from any copyrighted source
material.**

## How to run

No build step. Serve the repository root over HTTP (so `fetch` can load
the dataset) and open `index.html` in a modern browser.

```bash
# Any static server works; e.g. Python:
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Opening `index.html` directly via `file://` will fail because the browser
will block `fetch('data/engagement.json')`.

## Features

- Three.js r128 scene with procedural starfield, ship hulls (blue
  Rocinante, red Zmeya), torpedoes, PDC tracers, and impact bursts.
- Keyframe-driven playback engine with play/pause, scrubbing, and
  0.25x–4x speed control.
- Tactical HUD per ship (velocity, G-load, range, closure rate, aspect
  angle) and an event-driven radar lock indicator.
- Timeline with event markers, scrolling event log (click to seek),
  ship/torpedo trails (toggleable with `T`), and entity labels.
- Two camera modes: Center dynamically frames active ships; Chase follows
  the selected ship and allows cycling targets with `C`.
- HUD panels docked at the bottom of the viewport and a tabbed
  Summary / Events panel for engagement stats and the event log.

## Dataset

- The application loads **`data/engagement.json`** on startup. The file
  is a collection of one or more engagements; the **Engagement** dropdown
  in the timeline bar switches between them without a page reload.
- The full telemetry contract (collection wrapper, units, coordinate
  system, entity lifecycle, event types) is documented in
  **[SCHEMA.md](SCHEMA.md)**.
- A minimal reference dataset lives at `data/example.json`.

## Project structure

```
index.html              — application entry (HTML, CSS, JS)
SCHEMA.md               — telemetry contract
VALIDATION.md           — validation report and repro steps
README.md               — this file
LICENSE                 — MIT license
data/
  engagement.json       — primary replay dataset
  example.json          — minimal reference dataset
scripts/
  validate-playback.js  — Node validation harness
```
