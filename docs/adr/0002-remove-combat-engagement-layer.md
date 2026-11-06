# ADR-0002 — Remove the combat/engagement layer

- Status: accepted
- Date: 2026-11

## Context

The prior "The Expanse Tacview" was a combat demo: named ships (Roci/Zmeya),
torpedoes, PDC rounds, burst effects, lock/mission state, an event log, and a
multi-engagement selector. The project is being restructured as an orbital
space-telemetry foundation (leading toward The Expanse universe in the future).

## Decision

Delete the combat/engagement layer from the tree: event model, lock state,
mission state, weapons, effects, presentation summary, engagement selector,
and their stale docs. The dataset top-level concept changes from `engagements`
to **tracks** (a track = one space object's ephemeris). The git history
preserves the removed code for future reference.

## Consequences

- The repo becomes the telemetry foundation, not a parked pile of unused
  combat code.
- Module count drops from 19 to ~9; wiring in `main.js` simplifies.
- A future Expanse-themed scenario can re-introduce combat tracks on top of
  the same ephemeris foundation without migrating the old one-off code.
