# ADR-0003 — Per-sample quaternion for spacecraft attitude

- Status: accepted
- Date: 2026-11

## Context

Neither OMM nor the CCSDS ephemeris messages (OEM/OPM) carry spacecraft
attitude/orientation, which the viewer needs to show heading and orientation
in 3D.

## Decision

Store a **unit quaternion `[x, y, z, w]` on every ephemeris sample**, rotating
the inertial reference frame into the body frame, with a documented body-axis
convention on the track (`attitude.frame`, `attitude.forward`, `attitude.up`).

## Consequences

- The renderer applies the quaternion directly to the body mesh (matrix from
  quaternion) for orientation.
- Heading is a single deterministic derivation: the `forward` axis rotated by
  the quaternion.
- Matches the engine's existing slerp interpolation model, so continuous
  interpolation is free.
- Avoids the gimbal-lock and axis-ordering ambiguity of Euler angles.
