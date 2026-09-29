# Mission state expanded to six phase labels

The mission indicator in the HUD derives its label from the most recent event type (plus the boundary states `STANDBY` and `RESOLUTION`), producing a six-phase tactical narrative: `PURSUIT`, `LAUNCH`, `INTERCEPT`, `ROLL`, `ATTRITION`, `RESOLUTION`. The existing three-state `STANDBY` / `ENGAGEMENT` / `RESOLUTION` model is replaced because it fails to surface the tactical phases that make engagements like the Oyedeng reconstruction *readable* as a narrative.

## Considered options

- **Keep the three-state model and surface the current event type as a secondary HUD label**: minimal effort, no logic rewrites. Rejected because a secondary label feels like a debug surface; the primary indicator should itself communicate the tactical phase, not just the broad state.
- **Don't expand mission state; let the event log show phase progression on its own**: zero effort. Rejected because users looking at the scene aren't reading the event log at the moment a phase transition happens — the scene needs the indicator to change.

## Consequences

- `js/mission-state.js` becomes a phase-label derivation function rather than a coarse state machine. The `STANDBY` boundary (before the first event) and the terminal `RESOLUTION` remain; the in-between states become phase labels instead of a single `ENGAGEMENT`.
- `js/ui/hud.js` gains a phase label field next to the existing mission indicator.
- New event types added in future engagements must be classified into one of the six phases (or extend the catalogue). A `PHASE_BY_TYPE` map is the natural place to maintain the classification.
- `mission-state.js` no longer maintains a `TERMINAL_TYPES` set for the RESOLUTION boundary — the terminal event types (`intercept`, `hit`, `torpedo_intercept`, `missile_intercept`, `railgun_fire`, `zmeya_drive_disabled`) collapse into the `RESOLUTION` phase boundary check.
