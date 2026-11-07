# ADR-0005 — Spacecraft HUD plates with Doppler-tinted frames

- **Status:** proposed
- **Date:** 2026-11-07
- **Related:** `js/labels.js`, `js/hud.js`, `css/tacview.css`
- **Preview:** [`docs/hud-plate-preview.html`](../hud-plate-preview.html) — open it
  directly from disk (no server) and drag the closing-rate slider.

## Context

Each track currently gets a bare text label (`js/labels.js`, 52 lines) — the
object name in a small box. It identifies nothing else: no state, no sense of
which object is under control, and at cislunar range several craft read as
identical dots.

The request: give every spacecraft a **replaceable-looking HUD plate** — a
rectangle with a retro green CRT treatment — and, once a spacecraft is
*selected*, tint the **other** plates using the Doppler effect as the reference:
blue when closing, red when receding.

There is one hard physical fact to settle first.

## The Doppler shift is invisible at these speeds

For a line-of-sight speed `v_r`, β = v_r/c, the observed wavelength relates as
λ_obs/λ_emit = √((1+β)/(1−β)) (receding → longer, redder). At a 550 nm line:

| Case | v_r | β | Δλ |
|---|---|---|---|
| LEO pass (400 km) | 7.8 km/s | 2.6e-5 | **0.014 nm** |
| Trans-lunar coast | 3.0 km/s | 1.0e-5 | 0.006 nm |
| Apollo TLI cutoff | 10.8 km/s | 3.6e-5 | 0.020 nm |
| Earth's orbital speed (reference) | 29.8 km/s | 9.9e-5 | 0.055 nm |

Human hue discrimination in adjacent patches is roughly **1–6 nm**. A real shift
here is 1–2 % of one just-noticeable difference: **physically invisible**. To see
550 nm read as visibly red you would need β ≈ 0.011 — about **3,270 km/s**, or
1.1 % of c.

So the colour cannot be a rendered spectrum. It must be a **stylised indicator
whose sign and monotonicity are physical, and whose gain is not.** That
distinction goes in the docs and on the plate itself (see "Honesty" below).

## Decision

### 1. Plates are DOM, not sprites

Keep the existing DOM-overlay approach and grow `js/labels.js` into a plate
renderer:

- Text stays crisp at any zoom, no texture atlas, no per-frame canvas work.
- CSS carries the CRT look (scanlines, glow, brackets) — cheap and tweakable.
- Position updates go through `transform: translate3d()` only, never
  `left`/`top`, so a 60 fps update never triggers layout.

### 2. Plate anatomy

```
┌ COLUMBIA ─────────────── TARGET ┐
│ ALT 1 234 km   VEL 2.41 km/s    │
│ RNG RATE -0.86 km/s  ▲ CLOSING  │
└─────────────────────────────────┘
```

- Header row: name (`OBJECT_NAME`), right-aligned tag (`TARGET`, `CLOSING`,
  `OPENING`).
- Readout rows: `ALT`, `VEL`, and — once a target exists — `RNG RATE`. Rows only
  appear in **full** mode; a **compact** plate is name-only.
- Compact when: the plate is small on screen (< 60 px wide), the object is
  behind the camera, or the plate count exceeds the LOD budget. Full when:
  selected, or within 260 px of the camera and facing it.
- A 3 px phosphor dot marks the anchor point; the plate sits at (+12, −12) px
  from it. Phase 3 adds a 14 px leader line.

### 3. CRT palette (default green)

| Token | Value | Use |
|---|---|---|
| `--hud-green` | `#39ff6a` | border, brackets, anchor dot |
| `--hud-green-dim` | `#1f8f3d` | inner bevel, scanline tint |
| `--hud-text` | `#d8ffe4` | values |
| `--hud-label` | `#6bff96` | row labels, name |
| `--hud-bg` | `rgba(0, 24, 10, 0.55)` | plate fill |
| `--hud-close` | `#59b6ff` | approaching (blue shift) |
| `--hud-recede` | `#ff6a55` | receding (red shift) |

Treatment: 1 px solid border, 2 px corner L-brackets (pseudo-elements),
`repeating-linear-gradient` scanlines at 22 % black, `text-shadow: 0 0 6px`
at ~35 % of the current colour, `font: 10–11px Orbitron` (the app typeface), uppercase,
`letter-spacing: .07em`, no border radius. A 3 s 2 %-opacity flicker animation,
disabled under `prefers-reduced-motion`.

### 4. Selection behaviour

| State | Selected plate | Other spacecraft | Celestial tracks |
|---|---|---|---|
| No spacecraft selected (default, target = Earth) | — | green | dim green, no Doppler |
| Spacecraft selected | green + `TARGET`, Doppler suppressed | **Doppler tinted** + `▲ CLOSING` / `▼ OPENING` | dim green, no Doppler |

The selected plate stays green so the reference frame is unambiguous — the
Doppler tint is always measured *from* that object.

### 5. The observer is the selected spacecraft

`r_rel = r_target − r_observer`, `v_rel = v_target − v_observer`,
`v_r = (r_rel · v_rel) / |r_rel|`, positive = receding.

The alternative (observer = camera) is more literally "what your eye sees", but
in an orbiting scene it makes the colour flicker with camera moves and has no
mission meaning. Selected-craft-relative answers "is that thing coming at me from
the target I care about", which is what the tint should mean.

### 6. The colour ramp (stylised, documented)

```
t  = clamp(|v_r| / V_REF, 0, 1) ** 0.45      V_REF = 12 000 m/s (meta.doppler_ref_mps)
v_r < 0  →  mix(neutral, --hud-close,  t)    neutral = #8899a6
v_r > 0  →  mix(neutral, --hud-recede, t)
```

`V_REF = 12 km/s` puts a LEO pass at t = 0.82, a trans-lunar coast at 0.54, and
a midcourse trim at 0.10 — visible without saturating everything. The 0.45 gamma
lifts slow encounters off neutral. Effective gain over a literal spectral shift
is ~270× (full saturation at 12 km/s, where the true shift is 0.022 nm vs the
~6 nm needed to read as a hue change).

`js/doppler.js` holds this as pure functions (`radialVelocity`, `shiftNorm`,
`tint`) with no DOM and no THREE, so Node tests it directly.

### 7. Honesty

- README and the plate's own tooltip say **"stylised Doppler indicator"**.
- The *number* on the plate is real: `RNG RATE` is the true radial velocity, and
  full mode may show the true `Δλ` (e.g. `0.014 nm`) next to it.
- Never print a wavelength as if it were the colour. The colour is the
  exaggerated channel; the numbers are the measurement.

## Layout, culling and cost

- One DOM element per track, reused across frames (never recreated).
- Per frame: project → `translate3d` (60 Hz). Text and colour throttled to 10 Hz
  and only written on change.
- Greedy vertical de-overlap: sort by screen `y`, push each plate down by
  `height + 2` if it would collide with the previous one.
- Cap: 24 plates. Beyond that, priority = selected → largest apparent size →
  nearest; the rest are hidden. `contain: layout style paint` on the plate.
- Hide entirely when: `pos.z > 1` (behind camera), outside the viewport by
  > 80 px, or the track has no state at the current time.

## Implementation plan

**Phase 1 — plate renderer and CRT look.** Rewrite `js/labels.js` into a plate
component (header, dot, compact/full modes), add the CSS tokens and treatment,
stacking and culling, and a `H` key / button to toggle plates. All plates green.

**Phase 2 — Doppler tinting.** `js/doppler.js` (pure math), selection wiring
through `hud.getTarget()`/`cameraCtl.getTarget()`, tinted frames plus
`CLOSING`/`OPENING` tags and `RNG RATE` for non-selected craft, `TARGET` tag for
the selected one. Add `scripts/test-doppler.js` to `npm test` (sign convention,
clamping, zero-motion neutrality, symmetry).

**Phase 3 — polish.** Scanlines/flicker with reduced-motion respect, leader
lines, priority culling, per-scenario `meta.doppler_ref_mps`, README section and
a screenshot, `docs/hud-plate-preview.html` refreshed to match what ships.

## Alternatives considered

- **Three.js sprites / canvas textures** — one texture per plate, redrawn on
  change. Rejected: worse text fidelity, more GPU state changes, and the CRT
  treatment is far easier in CSS.
- **A true spectral render** — multiply the object colour by the real shift.
  Rejected: the shift is imperceptible (above), so it would be a decoration that
  claims physics it does not have.
- **Observer = camera** — rejected in §5.
- **Doppler on celestial tracks too** — rejected: the Moon plate would drift
  colour with the scenario's epicycles and add noise without information.

## Consequences

- `js/labels.js` grows from 52 lines to roughly 250, and becomes the only place
  that knows about screen-space layout.
- Every scenario automatically gets plates; no schema change. Optional new
  `meta.doppler_ref_mps` (defaults to 12 000).
- A new pure module (`js/doppler.js`) joins `npm test`, so the colour logic is
  covered without a browser.
- The green default means the HUD is legible on any scenario without
  configuration; the Doppler layer is opt-in by selecting a spacecraft.

## Open questions (with a recommendation)

1. **Should the tint appear only when a spacecraft is selected, or also when
   Earth is the target (Doppler from Earth's centre)?** Recommendation: only
   when a spacecraft is selected — "by default green" is the requested baseline
   and Earth-relative Doppler is mostly a proxy for orbit phase.
2. **Should plate text follow the tint, or only the frame?** Recommendation:
   frame, brackets, dot and tag carry the colour; numeric values stay
   `--hud-text` so contrast never drops with a red tint.
3. **How much readout in full mode?** Recommendation: `ALT`, `VEL`, `RNG RATE`,
   and `Δλ` only for the selected target, to keep multi-craft scenes readable.
