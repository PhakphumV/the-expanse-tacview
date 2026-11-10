# ADR-0007 — Per-vehicle low-poly spacecraft models

- **Status:** accepted
- **Date:** 2026-11-10
- **Related:** `js/spacecraft-model.js` (model builders), `js/entities.js`
  (track → model dispatch, per-model apparent-size floor), `docs/spacecraft-preview.html`
  (working preview grid)

## Context

The viewer drew every artificial object with one generic body — a box hull,
a nose cone, and two solar wings — that conveyed only heading/orientation, not
what the object was. At close zoom the ISS and the Apollo CSM were
indistinguishable. Three real vehicles are tracked:

- ISS (`leo`), Tiangong / CSS (`leo`),
- Apollo CSM + LM (`COLUMBIA`, `ODYSSEY`), the bare Service Module
  (`apollo13`), and the Lunar Module (`EAGLE`, `AQUARIUS`).

The renderer has **no lights at all** — every material is `MeshBasicMaterial` —
so shape must come from silhouette and flat colour, and the models must stay
low-poly (they are scaled up from orbital range).

## Decision

1. **One builder per vehicle, dispatched by track id.** `createSpacecraftModel(trackId)`
   returns a dedicated low-poly group; an unknown id falls back to the original
   generic hull so nothing renders empty. Dispatch is case-insensitive and
   whitespace-normalised (handles `SERVICE MODULE`).

2. **Each model keeps the viewer's body convention:** forward = −Z, up = +Y, so
   the sample quaternion (which maps `[0,0,-1]` onto velocity) orients it
   correctly with no extra wiring.

3. **Each model reports its true span in `userData.extent`.** `entities.js`
   now uses that value (falling back to `MODEL_EXTENT = 26`) as the divisor in
   the apparent-size floor, so a 88 m ISS stays readable from farther out than
   a 9 m LM — matching their real sizes. `MODEL_EXTENT` remains the default for
   the generic fallback.

4. **Colour carries identity, not just detail.** Solar arrays are one blue,
   station modules white, Apollo silver/white with a dark heat-shield band,
   the LM descent stage and footpads gold.

## Consequences

- Vehicles are recognisable at close zoom and contribute a stronger silhouette
  read at the minimum apparent size without extra triangles.
- The generic hull is retained as a fallback; it is not removed, so a future
  scenario that adds an unsupported track still renders.
- The free-standing `docs/spacecraft-preview.html` grid lets a future model
  change be reviewed without wiring up a scenario.
