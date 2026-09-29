# Optional additive angular_velocity field, versionless, with synthetic fallback

The keyframe schema gains an optional `angular_velocity: [wx, wy, wz]` field (body-frame angular velocity in rad/s) without a schema version bump. Datasets that omit it continue to work; the integrator computes a synthetic angular velocity from quaternion deltas between adjacent keyframes when the field is absent.

## Considered options

- **Add an explicit `schema_version` field and bump to "1.1.0"**: rejected because the contract is already "unknown fields are ignored" — explicit versioning would force every existing engagement to declare a version it never needed, and would couple dataset authoring to the playback engine's release cadence.
- **Require `angular_velocity` on every ship keyframe**: rejected because the existing Oyedeng dataset (`roci-vs-zmeya-oyedeng`, 170 s, 26 entities, 60 events) encodes the defensive roll through orientation keyframes only, and re-authoring the data is invasive. The synthetic fallback produces correct roll behavior on the existing data without touching the file.
- **Slerp-only fallback when `angular_velocity` is absent**: rejected because the defensive roll on the existing dataset would be visibly slower and less accurate under slerp than under forward integration from a derived angular velocity. The whole point of the Phase 6 pivot is to make the roll read as a tactical coverage-management maneuver.

## Consequences

- `SCHEMA.md` adds `angular_velocity` to the keyframe shape with a one-line "optional; integrator derives from orientation deltas when absent" note.
- `js/core/integrator.js` exposes both the explicit angular velocity path and the synthetic derivation; `js/core/playback.js` picks based on keyframe shape.
- A future engagement author can opt into the explicit field for higher-fidelity rolls at higher keyframe cadences without breaking older datasets.
- Future "posture change" maneuvers (yaw flips, sustained burns while rolling) are natural extensions of the explicit field; no schema change needed.
