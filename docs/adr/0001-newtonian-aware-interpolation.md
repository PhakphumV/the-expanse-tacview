# Newtonian-aware interpolation over live simulation

The playback engine reads keyframe telemetry as the source of truth, but integrates position from velocity and orientation from angular velocity each frame to produce visible drift, retrograde braking, sustained-burn HUD, and PDC roll coverage. The dataset is *not* an initial condition for a free-running simulation; it is the script the engine plays back.

## Considered options

- **Live physics simulation**: keyframes become initial conditions; ships become dynamic bodies that the user flies in real time. Rejected because the project is positioned as a *reference tactical replay viewer* — a polished, browser-only tool for showcasing pre-authored engagements. A live sim would require live controls, thrust inputs, and a fundamentally different identity. The drift, momentum, and burn behaviors of the source material (e.g. the Oyedeng pursuit) can be reproduced under Newtonian-aware interpolation at far lower cost.
- **Parallel integrated state for HUD only** (hybrid): keyframes remain kinematic for rendering; integration runs alongside for HUD values. Rejected because the visual *position* of the ship should reflect the same drift the HUD reports — otherwise viewers will see a stationary Roci whose velocity display climbs, which reads as a bug rather than a feature.

## Consequences

- Keyframe positions will drift from the integrated trajectory between keyframe spans. This is intentional and matches the existing "velocity is independent of position" authoring rule in `VALIDATION.md`. The validator must check the integrated position against the next keyframe within a documented tolerance rather than expecting exact agreement.
- The integrator lives in `js/core/integrator.js` as a pure-math module consumed by `js/core/playback.js`. Other modules read state from playback as before.
- Adding "thrust the ship" controls later would require revisiting this decision.
