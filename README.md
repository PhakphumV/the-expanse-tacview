# The Expanse Tacview

A static, server-less WebGL space-object telemetry viewer built with Three.js.
It replays real orbital data — low Earth orbit, and the Apollo 11 and Apollo 13
missions — from a **state-vector ephemeris** grounded in the CCSDS
OMM / OEM / XTCE recommendations (see **[SCHEMA.md](SCHEMA.md)** and
`docs/adr/`), with the Moon as a moving celestial track.

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

## Core features

- **Space-object telemetry engine** (`js/ephemeris.js`): time-based
  interpolation of state-vector samples, per track. Position interpolation is
  cubic Hermite, so sparse coast sampling still draws smooth arcs.
- **Multiple scenarios & timeline events** (`js/ephemeris.js`, `js/timeline.js`):
  a SCENARIO selector switches between replayable missions; each scenario can
  carry labeled events rendered as pins on a full-width scrub track — each pin has
  a tick at its exact time and is a 16 x 20 px click target, and events that land
  within a few pixels of each other take different colours instead of stacking.
  Events typed `phase` drive the header's PHASE readout, so a long mission reads
  as a sequence of phases rather than a bare clock. A second, **detail** track sits
  above the overview: a fixed 20-minute window (±10) centred on the playhead with a
  line at every whole minute and a timestamp every five, which you drag left or
  right to scrub precisely, with the events inside that window drawn as lines in the
  same colour as their pin above. Dragging it pauses playback and resumes on release, so the
  engine cannot fight the pointer. A scenario may also declare its own `default_speed`,
  `default_target` and framing distance.
- **Attitude** (`scripts/apply-burn-attitude.js`): samples carry a quaternion, and
  the model turns to the burn attitude before ignition and back after cutoff — a
  retrograde burn flies tail-first, so LOI-1 is a visible 180° turnaround (1.5 °/s,
  sampled at 5 s through the slew). Cruise attitude follows the velocity. The HUD's
  `ROT` row reports the rate in degrees per second.
- **Maneuvers** (`SCHEMA.md`, ADR-0004): each track can carry ordered burn
  records — impulsive, finite or constant-thrust — with Δv, thrust, mass and
  attitude. The samples stay the ground truth and `npm test` checks the declared
  burns against them; the HUD shows cumulative ΔV and burn spans render as bars
  on the timeline.
- **Explosion events** (`js/explosion.js`): a `type: "explosion"` event draws a
  low-poly orange sphere at the host track's position — faceted, unlit, popping
  to full size almost instantly and fading out over its `duration_s`, leaving
  nothing behind. Radius and duration are scenario data (`radius_m`,
  `duration_s`); the effect never perturbs the trajectory.
- **Typeface**: Orbitron (Google Fonts, SIL OFL 1.1), self-hosted from
  `vendor/orbitron/` so the page still works from `file://` with no network. The
  latin subset is a variable font (wght 400–700) with equal advance widths, so
  live readouts don't jitter as digits change.
- **Readable at any scale** (`js/entities.js`): bodies and spacecraft keep a
  minimum apparent size, so a 26 m vehicle and a 3 500 km Moon both stay visible
  at cislunar range instead of collapsing to a pixel.
- **Selectable target HUD** (`js/hud.js`): lists every celestial body (Earth,
  Moon) and space object (ISS, Tiangong); click to retarget the camera and see
  that target's telemetry (altitude/speed/position for objects; radius/orbit
  for bodies).
- **Gradient ribbon trails** (`js/entities.js`, math in `js/trails.js`): each
  artificial space object leaves a bright, orientation-aware ribbon (body-roll
  oriented, head→tail color gradient) whose width scales with camera distance, so
  the band keeps its apparent size at any zoom. Trail **length comes from the
  object's own orbit** (ADR-0006): an eighth of the orbit for a craft (5 339 km
  in LEO), 0.45 of it for a celestial body — almost half the ring — with vertices
  spread by arc length rather than by time. On a **transfer trajectory** (an open
  or near-escape arc, e ≥ 0.9, about the dominant body) the window is capped at
  the last 60 minutes instead, so a trans-lunar coast shows a 7 000 km tail rather
  than 27 hours of ribbon. The cap is applied as a length through the same
  low-pass as the orbit rule, so it eases in and out instead of snapping, and the
  ribbon tapers to 35 % width over its last half so the far end fades rather than
  ending in a cut.
  Celestial bodies (`kind: "celestial"`, i.e. the Moon) use the same ribbon in a
  subdued form — colder, thinner, but kept in the orbital plane — so a body's arc
  never competes with a spacecraft's track.
- **Viewport** (`js/camera.js`): two modes — **Orbit** (free rotation around the
  selected target) and **Follow** (chase the selected moving object; drag to
  orbit it, zoom to pull in). Both can **pan** as well as orbit: right-drag in
  Orbit, Shift-drag in Follow, or the numpad — 4/6 left-right, 8/2 up-down — with
  the step scaled to the view distance. The pan offset survives playback and the
  target moving, and it resets when you select a new target. Wheel and
  `+`/`-`/PageUp/PageDown zoom by a fixed step. The zoom rail on the left edge is **vertical** and momentary: hold the
  thumb up to zoom in or down to zoom out, faster the further it is pushed, and it
  springs back to the centre tick (no zoom) when released — one gesture works from
  a 50 m close-up to the lunar orbit. **Flip** (button or `F`) rolls the view 180°
  so the scene reads upside down, for matching a printed chart or an inverted
  reference frame; labels stay upright because they are DOM, not scene geometry.
  Orbit guide rings and object path lines are dashed, with the dash pattern
  rescaled to the camera distance so it reads at every scale. A landed vehicle
  draws **no trail** — a parked object's samples are the body's own translation,
  which reads as a 300 000 km streak — and after liftoff its ribbon starts at the
  liftoff instant rather than reaching back over the parked hours.
- **Steady readouts**: elapsed/remaining time, the timeline clock and every HUD
  value use tabular figures in a fixed-width, right-aligned box, and the phase
  label sits on its own header row. Without that, a proportional display face
  plus a changing digit count made the numbers (and their neighbours) twitch at
  512x playback.
- **Guide overlay** (`?` or the `?` button): what each panel shows, what the HUD
  rows mean, and the full shortcut list. Esc or a backdrop click closes it.
- Celestial bodies: wireframe Earth (static) and the Moon, which is a celestial
  telemetry track moving along its tilted mean orbital path ring
  (`js/scene.js` + the scenario store).
- Clean timeline: play/pause, restart, jump, scrubbing, speed (0.25x–8192x).
- **One scenario in memory at a time** (`js/scenario-loader.js`): the page boots
  from a ~1 KB manifest, then injects the `<script>` for the scenario you pick
  and releases the previous payload (and disposes the previous scene's
  geometries). Only the payload being watched is decoded into vectors.

## Scenarios

Three missions ship with the viewer, selected from the header's SCENARIO menu.
Each is one JSON file in `data/scenarios/`, validated by `npm test` and split into
its own payload by `npm run embed`.

| id         | Scenario                     | Mission time | Tracks                                  | Events |
| ---------- | ---------------------------- | ------------ | --------------------------------------- | ------ |
| `leo`      | Low Earth Orbit              | 3 h 6 m      | ISS, Tiangong, Moon                     | 0      |
| `apollo11` | Apollo 11 — Lunar Landing    | 195 h 19 m   | Columbia, Eagle, Moon                   | 25     |
| `apollo13` | Apollo 13 — Abort Mission    | 142 h 55 m   | Odyssey, Aquarius, Service Module, Moon | 15     |

### Low Earth Orbit (`leo`)

The pure tracking view. ISS (NORAD 25544) and Tiangong / CSS (NORAD 48274), each
a pre-baked two-orbit LVLH ephemeris of position/velocity/orientation samples,
propagated offline from live element sets — no runtime SGP4 — plus the Moon on a
celestial track completing one revolution per replay. No events, so the timeline
is a bare scrubber; the HUD shows the active object's altitude, ground speed and
ECI position.

### Apollo 11 — Lunar Landing (`apollo11`)

An eight-phase replay from launch to splashdown — 195 h 18 m of real mission time
with the Moon on its true geocentric ephemeris (JPL Horizons/DE441). All eight
phases are in: launch, ascent, parking orbit, TLI, the trans-lunar coast with
MCC-2, lunar orbit insertion (LOI-1 into 111 × 314 km, LOI-2 to ~92 × 122 km),
the LM's own descent — undocking, DOI, powered descent and touchdown — the
surface stay through the EVA, and the ascent back off the Moon: lift-off, an
integrated 593 s climb to 18 × 87 km, a solved two-impulse rendezvous, docking at
128:03, the LM jettison at 130:09, and the trip home: a solved trans-Earth
injection at 135:22:42, a 2.5-day coast, entry at 400 000 ft and splashdown at
195:18:35. Phase-by-phase detail is in `docs/apollo11-phases.md`.

### Apollo 13 — Abort Mission (`apollo13`)

The first abort mission in the set. Launch through TLI and the hybrid
trans-lunar coast to the oxygen-tank rupture at 55:54 GET — rendered as an
explosion event on the Odyssey track — then the two LM descent-engine burns that
turn the trajectory back to Earth, the 254 km lunar flyby, MCC-5 and MCC-7, the
jettisons of the service module and Aquarius into their own drift tracks, and the
entry and Pacific splashdown. Four tracks and 15 events; the reconstruction
deviations from the published numbers are listed in `docs/apollo13-phases.md`.

## Project structure

```
index.html                — application entry (embeds classic scripts + data)
CONTRIBUTING.md           — how to contribute, add a scenario, review checklist
SCHEMA.md                 — telemetry contract (OMM/OEM/XTCE)
CONTEXT.md                — domain glossary
docs/telemetry-guide.md   — authoring guide: data model, recipes, validation, traps
docs/adr/                 — architecture decision records
data/
  scenarios/<id>.json    — canonical source, one file per scenario (validated by npm test)
js/
  main.js                 — entry point, wiring, per-frame loop
  scenario-loader.js      — loads/releases one scenario payload at a time
  scene.js                — ECI scene, Earth body (no starfield)
  orbit-ring.js           — faint orbit guide ring derived from a celestial track
  ephemeris.js            — track/ephemeris engine (state queries, playback)
  entities.js             — per-track body, orbital path, ribbon trails (object vs celestial)
  trails.js               — trail length/window maths (pure, tested in Node)
  spacecraft-model.js     — procedural spacecraft body (heading/orientation)
  explosion.js            — low-poly fireball for `explosion` events
  labels.js               — billboarded on-screen labels (one per track)
  camera.js               — Orbit / Follow viewport modes around a target
  hud.js                  — selectable target list + per-target readouts
  timeline.js             — scrubber, play/pause, jump, speed, event markers
  scenarios-data.js       — generated manifest (ids, names, counts, hints)
  scenario-<id>.js        — generated per-scenario payload (tracks + events)
scripts/
  validate-telemetry.js   — validates the contract (shape, quaternions, heading)
  scenario-store.js       — reads/writes the one-file-per-scenario store
  embed-scenarios.js      — splits data/scenarios/*.json into the files above
docs/
  adr/                    — architecture decision records
  apollo11-phases.md      — Apollo 11 phase plan, data anchors and provenance
  apollo13-phases.md      — Apollo 13 (abort mission) phase plan and provenance
```

## Development

```bash
npm test        # validate data/scenarios/*.json against SCHEMA.md + JS syntax
npm run embed   # regenerate js/scenarios-data.js + js/scenario-<id>.js
```

New datasets are authored as JSON against `SCHEMA.md`, one file per scenario in
`data/scenarios/`; that store is
the canonical source; `npm run embed` splits it into one payload per scenario
(`js/scenario-<id>.js`) plus a manifest (`js/scenarios-data.js`), so the viewer
only ever loads the scenario being watched. `npm test` fails if the generated
files drift from the canonical dataset.

## Contributing

Want to add your own scenario, or your own telemetry? Start with
**[CONTRIBUTING.md](CONTRIBUTING.md)** (setup, workflow, honesty rules) and
**[docs/telemetry-guide.md](docs/telemetry-guide.md)** (the data model, a
verified minimal example, generation recipes, and the ten automated checks).
The contract itself is [SCHEMA.md](SCHEMA.md); the reasoning behind it is in
[`docs/adr/`](docs/adr/).

## License

MIT. Ship models and telemetry are original synthetic creations.
