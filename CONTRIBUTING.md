# Contributing

Thanks for wanting to add to this. The most valuable contribution is usually a
**scenario** — a mission, launch, transfer or docking — with real or carefully
reconstructed telemetry behind it. There are also smaller ways in: renderer
fixes, timeline/UI polish, and documentation.

Please read this page before opening a pull request. It is short on purpose.

---

## What this project is

A static, server-less Three.js viewer for space-object telemetry. One HTML page,
classic `<script>` files, one JSON dataset, no framework, no bundler, no network
calls at runtime. It must keep working when the folder is opened straight from
disk (`file://`).

Two consequences you will notice in review:

- **No build step.** Generated files are committed; the browser loads plain
  scripts in a fixed order (`index.html`).
- **Data is the product.** The scene is only as honest as the state vectors
  behind it, so provenance is treated as part of the payload, not decoration.

---

## Setup

```bash
git clone https://github.com/PhakphumV/the-expanse-tacview.git
cd the-expanse-tacview
npm test          # 10 checks, no dependencies to install
npm run embed     # regenerate the embedded payloads from data/scenarios.json
npm run serve     # optional: http://localhost:8000
```

Node is only needed for the two scripts in `scripts/`. The page itself needs
nothing.

> On this machine port 8000 is taken by a proxy, so use
> `python3 -m http.server 8123` if `npm run serve` fails.

---

## Repository map

```
index.html                    page + script load order
data/scenarios.json           the canonical dataset (edit this)
js/scenarios-data.js          generated manifest (do not edit)
js/scenario-<id>.js           generated per-scenario payloads (do not edit)
js/ephemeris.js               dataset model, interpolation, maneuver accessors
js/scenario-loader.js         loads/releases one scenario payload at a time
js/scene.js, orbit-ring.js    renderer scaffolding, guide rings
js/entities.js                per-track body, trail, path line
js/camera.js, hud.js, timeline.js, labels.js
scripts/embed-scenarios.js    dataset -> embedded payloads
scripts/validate-telemetry.js the 10 checks behind `npm test`
SCHEMA.md                     the telemetry contract
docs/telemetry-guide.md       how to author a scenario (start here)
docs/adr/                     decisions: ephemeris, combat layer, quaternions, maneuvers
```

---

## Adding a scenario

1. **Read** [`docs/telemetry-guide.md`](docs/telemetry-guide.md) §1–§7. It covers
   the data model, conventions and what the validator enforces.
2. **Generate** the samples offline. Write a throwaway Node script in `/tmp`
   (no dependencies). Keep it out of the repo — the repo's rule is "data plus a
   small runtime", not a build pipeline.
3. **Add** one entry to `data/scenarios.json`: `id`, `name`, `tracks` (and
   `events` if the mission has phases).
4. **Fill in provenance**: `epoch`, a real `SOURCE` on every track, and a `note`
   on any maneuver whose values are solved rather than published.
5. **Regenerate and validate**:

   ```bash
   npm run embed && npm test
   ```

6. **Look at it.** Open the page, pick the scenario, scrub it, click the phase
   markers, and watch every burn. Look for jumps, stuck segments, or an empty
   screen (usually a frame/scale mistake, not a typo).

If you changed the *contract* rather than just adding data — a new field, a new
meaning — add an ADR in `docs/adr/` and update `SCHEMA.md` and
`docs/telemetry-guide.md` in the same pull request.

---

## Changing the runtime

- **Classic scripts, no modules, no bundler.** Files attach to the global
  `Tacview` namespace and load in the order listed in `index.html`.
- Keep the data layer (`ephemeris.js`) free of DOM and Three.js rendering
  concerns; it is what the validator and any future tooling reuse.
- Prefer small, commented functions over cleverness; comment the *why*, not the
  *what*.
- Anything that allocates per frame (vectors, quaternions) matters: the loop
  runs at 60 fps over thousands of samples.
- UI text is plain ASCII except where the file already uses typographic
  characters (for example `ΔV`, em dashes in docs).

---

## Honesty policy

This viewer replays trajectories, so the one thing it must not do is quietly
invent physics.

- Mark synthetic data as synthetic. `SOURCE` should name the document, model or
  dataset, and say what was assumed.
- If a value is solved rather than published (a retargeting burn, a fitted
  launch phase), say so in the maneuver `note` and, if it is material, in the
  scenario notes.
- Do not present a reconstruction as if it were an authoritative ephemeris.
  Apollo 11 in this repo is a reconstruction and says so in the data.
- Do not commit data you cannot explain: every sample should have a
  reproducible origin, even if that origin is "propagated two-body from
  <anchor>".

---

## Commit and PR conventions

Messages follow the pattern already used in the history:

```
feat(apollo11): phase 2 - trans-lunar coast and MCC-2
fix(ui): zoom slider springs back to centre on release
docs(adr): assess maneuver and thrust telemetry support
style(theme): use absolute black for the background
```

- One concern per pull request; data changes and runtime changes in the same PR
  are fine when one needs the other, but say so.
- Regenerate the embedded payloads with `npm run embed` **in the same commit** as
  the dataset edit (`npm test` fails otherwise, on purpose).
- Keep `data/scenarios.json` diff readable: it is pretty-printed, two-space
  indented, and generated by `JSON.stringify(data, null, 2)` — match that.

---

## Checklist before you open the PR

- [ ] `npm run embed && npm test` — 10/10.
- [ ] Scenario loads in a browser and replays without visible jumps.
- [ ] Continuity check: for adjacent samples, `|Δr| / (½(v_i + v_i+1)·Δt) ≈ 1.0`.
- [ ] Page still loads from `file://` (classic scripts only, no `fetch`).
- [ ] Payload size is sane (see the guide's §11 — a scenario is ~150 B/sample).
- [ ] `README.md` features list and/or docs updated if behaviour changed.
- [ ] `SOURCE`/`note` provenance is present and honest.

---

## License

MIT. By contributing you agree that your contribution is licensed under the
same terms.
