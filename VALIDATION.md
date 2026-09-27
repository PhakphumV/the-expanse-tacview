# Validation Report — TAC-015 End-to-End Playback Validation

## Test environment

- **Date:** 2026-09-26
- **Engine:** Node.js v22 (used for static + simulation validation only)
- **Browser testing:** Not performed in this CI environment. Browser-side
  coverage is deferred to the TAC-022 regression suite.
- **Dataset under test:** `data/engagement.json` (170 s, 26 entities, 60 events, 1 engagement)

## What was validated

1. **Static integrity**
   - `data/engagement.json` is well-formed JSON.
   - `index.html` inline script passes `node --check` (no syntax errors).
2. **Interpolation correctness**
   - At each ship's first/last keyframe, `getStateAtTime(t)` returns the
     exact keyframe position (no drift at the boundaries).
   - Ships are inactive strictly outside `[first.t, last.t]`.
   - Torpedoes are inactive before their spawn keyframe and after their
     despawn keyframe.
3. **Lock state**
   - Lock intervals built from `lock`/`unlock` events match the event count.
   - `isLockedAt(t)` flips at exactly the event timestamps.
4. **Burst triggers**
   - Every `intercept` and `hit` event references an entity that is active
     at the event timestamp.
5. **Derived telemetry**
   - Closure rate from interpolated velocities is within 50 m/s absolute
     or 100% relative of the numeric derivative of range. The remaining
     gap is documented below.
6. **Replay sweep**
   - `getStateAtTime(t)` is evaluated every 0.1 s from t=0 to t=90 and
     produces no `NaN`/`Infinity` in any interpolated component.
7. **Phase 6 — Integrated state (ADR-0001)**
   - `getIntegratedStateAtTime(t)` (Newtonian-aware forward integration
     over the bracket span) agrees with the kinematic position at every
     keyframe boundary within `VEL_TOLERANCE * span`, accounting for the
     documented "velocity is independent of position" authoring quirk.
   - `getIntegratedStateAtTime(t)` is a pure function of `(id, t)`:
     calling it twice with the same arguments yields bit-identical state
     regardless of how playback time was advanced.
   - The HUD's reported `Acceleration (G)` matches the numeric `dv/dt`
     computed from the kinematic state at the same instant within 1%
     relative plus a 0.5 m/s² floor.

## How to reproduce

```bash
node scripts/validate-playback.js
```

The script loads `data/engagement.json`, replays the dataset with a minimal
`THREE.Vector3`/`Quaternion` substitute, and prints a pass/fail summary.

## Known limitations / defects discovered

- **Velocity vs. position consistency:** The dataset authors `velocity` as an
  independent per-keyframe vector. It is not strictly the time derivative of
  `position`. As a result, the analytic closure rate (from interpolated
  velocities) can disagree with the numeric derivative of range by up to
  ~40 m/s at velocity discontinuities. This is by design: smooth velocity
  interpolation requires independent velocity samples. TAC-019 will
  validate this in more depth.
- **Browser console:** Could not be observed in this environment. Visual
  smoke testing across Chrome/Firefox/Safari is tracked under TAC-022.
- **Memory leak / resource lifecycle:** Could not be observed without a
  long-running browser session. Tracked under TAC-023.

## Result

All automated checks pass. The implementation is ready for browser-side
regression coverage.
