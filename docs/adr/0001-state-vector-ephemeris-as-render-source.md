# ADR-0001 — State-vector ephemeris is the ground-truth render source

- Status: accepted
- Date: 2026-11

## Context

The viewer must render both stable orbit objects and maneuvering "space moving"
objects over time. Two candidate models exist:

1. **OMM mean elements** (CCSDS 502.0-B-3) + runtime SGP4 propagation.
2. **State-vector ephemeris** (OEM/OPM) — contiguous position + velocity
   (+ orientation) samples, interpolated between.

## Decision

Use a **state-vector ephemeris** as the ground-truth render data. The OMM
mean-elements block is an optional <em>nominal-orbit descriptor</em> used as
provenance for coast segments — never render data. The ephemeris is not
required to derive from the mean-elements block; coast segments may be
pre-propagated via SGP4, maneuver segments ingest their samples from actual
trajectory/telemetry. Samples are delivered pre-baked; no propagator runs in
the client.

## Consequences

- Correct for both stable orbits and maneuvering objects with a single
  mechanism.
- No runtime SGP4 dependency; the viewer stays dependency-free and lean.
- Mean elements are preserved as metadata for authenticity, but can never be
  mistaken for the source of motion.
