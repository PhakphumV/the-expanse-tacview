# Domain glossary

Terms used consistently across the codebase and docs. Keep these meanings
stable.

- **track** — a single space object's telemetry record: provenance metadata
  (identification, reference frame, time system, optional mean elements) plus
  a time-ordered ephemeris. A dataset is a list of tracks.
- **ephemeris** — the ordered series of state samples that is the ground-truth
  render data for a track. Propulsion-agnostic: it stores where the object is
  and where it is going at each sample and never assumes *why* it moved.
- **ephemeris sample** — one entry in an ephemeris: `t`, `position`,
  `velocity`, and `orientation` (unit quaternion).
- **mean-elements block** — the optional OMM mean-elements descriptor on a
  track. Nominal-orbit provenance for coast segments; never used as render
  data. An ephemeris may be derived from it but is not required to be.
- **epoch** — the moment t=0 for a track's ephemeris. Recorded in the OMM
  block (`EPOCH`, ISO 8601 / UTC).
- **attitude** — the orientation of the spacecraft body relative to the
  inertial frame, stored as a per-sample unit quaternion, with a documented
  body-axis convention (`attitude.frame`, `forward`, `up`).
- **heading** — the direction the spacecraft's forward body axis points,
  derived from the attitude quaternion.
- **ECI / TEME** — the Earth-centered inertial frame in which track positions
  and velocities are authored. The renderer treats it as world-space.
- **viewpoint** — the camera. The viewer offers Orbit (free), Follow (locked
  to a track), and Inertial (fixed to ECI) modes.

Out of scope (removed in the 2026-11 restructure): the combat/engagement layer
— event types, lock state, mission state, weapons, effects, and the
multi-engagement list. See `docs/adr/0002-remove-combat-engagement-layer.md`.
