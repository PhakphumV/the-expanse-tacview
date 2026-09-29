# Starfield parallax anchored to the ships' unweighted velocity mean

The starfield subsystem drifts opposite to the unweighted velocity mean of the two active ships at the current playback time: `v_frame = 0.5 * (v_roci + v_zmeya)`. This produces the "brachistochrone illusion" — apparent long-distance linear acceleration toward an interception point — regardless of which camera mode is active.

## Considered options

- **Camera-anchored infinite starfield**: stars are static in world space; apparent motion is purely the result of camera/ship translation. Rejected because the illusion collapses when the camera isn't locked to a ship (e.g. under Center of Engagement mode during a standoff), and the user explicitly asked for the illusion to be camera-independent.
- **Speed-weighted centroid**: `v_frame = (|v_roci|*v_roci + |v_zmeya|*v_zmeya) / (|v_roci| + |v_zmeya|)`. Rejected because it adds complexity for negligible perceptual benefit; in the canonical Oyedeng scenario (Roci on a sustained 8 G burn, Zmeya coasting at 0.3 G) the two formulas agree to within a fraction of a percent.
- **Locked to Roci's velocity only**: rejected because Zmeya's motion has no parallax cue under this model, breaking the illusion when the camera centers on her.

## Consequences

- `js/render/starfield.js` reads the integrated velocity of both ships each frame, not just the camera's velocity.
- The illusion is correct only when at least one ship is active in the playback window. Outside the engagement (before `t=0`, after `t=duration`), the frame is undefined; the starfield falls back to the most recent frame.
- If a future engagement has more than two ships, the formula generalizes to the unweighted mean of all active ships' velocities.
- The starfield's parallax layer count and per-layer tuning (density, size, drift scale) is a separate decision; preserve the current implementation unless density proves insufficient for the brachistochrone illusion to read clearly.
