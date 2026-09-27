// js/integrator.js
// Pure-math forward integration utilities for Newtonian-aware playback.
//
//   Position:     forward Euler from velocity.
//   Orientation:  quaternion derivative from body-frame angular velocity.
//   Synthetic ω:  derive a body-frame angular velocity from the quaternion
//                 delta between two keyframes (used when angular_velocity
//                 is absent on every keyframe of an entity — see ADR-0002).
//
// Pure math by design — no THREE dependency. Source objects (p, v, q, qA,
// qB) are read for their x/y/z/w components; out objects are written
// in-place. This keeps the integrator portable: the browser passes
// THREE.Vector3 / THREE.Quaternion, Node tests pass plain Vec3 / Quat
// stubs. The integrator never mutates its inputs.

// Standard gravity used for G-force display.
export const G = 9.80665;

// Integrate position forward by dt seconds at velocity v.
//   p, v:  read .x / .y / .z
//   out:   written with .x / .y / .z; created if absent.
export function integratePosition(p, v, dt, out) {
    if (!out) out = { x: 0, y: 0, z: 0 };
    out.x = p.x + v.x * dt;
    out.y = p.y + v.y * dt;
    out.z = p.z + v.z * dt;
    return out;
}

// Integrate orientation forward by dt seconds using body-frame angular
// velocity ω = (wx, wy, wz).
//
//   Quaternion derivative (body-frame convention):
//     dq/dt = 0.5 * q ⊗ (0, ω_body)
//
// Closed-form solution for one step (exact, no linearization):
//     dq = exp(0.5 * dt * (0, ω_body))
//     q(t+dt) = q ⊗ dq
//
// Where exp of a pure quaternion (0, θx, θy, θz) is
//     ( sin(|θ|/2) * θx/|θ|, sin(|θ|/2) * θy/|θ|, sin(|θ|/2) * θz/|θ|, cos(|θ|/2) ).
//
// This is per-frame time-stepping with the exact ODE solution. Forward
// Euler on the quaternion ODE has O((ω·dt)²) error that becomes visible
// at half-revolution-scale rotations; the exponential map is exact.
//
//   q, out:  read / write .x / .y / .z / .w
export function integrateOrientation(q, wx, wy, wz, dt, out) {
    if (!out) out = { x: 0, y: 0, z: 0, w: 1 };
    if (dt === 0) {
        out.x = q.x; out.y = q.y; out.z = q.z; out.w = q.w;
        return out;
    }

    // Build the rotation increment dq = exp(0.5 * dt * (0, ω)).
    const halfDt = 0.5 * dt;
    const vx = halfDt * wx;
    const vy = halfDt * wy;
    const vz = halfDt * wz;
    const vmag = Math.sqrt(vx * vx + vy * vy + vz * vz);

    let dx, dy, dz, dw;
    if (vmag < 1e-9) {
        // Tiny rotation: linear approximation is accurate here.
        dx = vx;
        dy = vy;
        dz = vz;
        dw = 1;
    } else {
        const sinV = Math.sin(vmag);
        const cosV = Math.cos(vmag);
        const k = sinV / vmag;
        dx = k * vx;
        dy = k * vy;
        dz = k * vz;
        dw = cosV;
    }

    // q' = q ⊗ dq.
    // Hamilton product with q = (qx, qy, qz, qw), dq = (dx, dy, dz, dw):
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const nx = qw * dx + qx * dw + qy * dz - qz * dy;
    const ny = qw * dy - qx * dz + qy * dw + qz * dx;
    const nz = qw * dz + qx * dy - qy * dx + qz * dw;
    const nw = qw * dw - qx * dx - qy * dy - qz * dz;

    const norm = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    if (norm < 1e-12) {
        out.x = 0; out.y = 0; out.z = 0; out.w = 1;
        return out;
    }
    out.x = nx / norm;
    out.y = ny / norm;
    out.z = nz / norm;
    out.w = nw / norm;
    return out;
}

// Derive an effective body-frame angular velocity ω from the orientation
// delta between two quaternion samples qA at time tA and qB at time tB.
// Returns [wx, wy, wz].
//
// Algorithm:
//   delta = qA⁻¹ ⊗ qB     (the rotation that takes A's frame to B's,
//                          expressed in A's body frame)
//   θ     = 2 * acos(delta.w)        in [0, π]
//   axis  = delta.xyz / sin(θ/2)     in A's body frame
//   ω_body = axis * θ / (tB - tA)
//
// For an entity whose keyframes encode a continuous rotation across
// adjacent samples, this is the constant angular velocity that would take
// qA to qB over that span. Per ADR-0002, this lets existing datasets
// render a continuous roll without re-authoring the data.
//
//   qA, qB: read .x / .y / .z / .w
//   out:    [wx, wy, wz] written; created if absent.
export function deriveAngularVelocity(qA, qB, tA, tB, out) {
    if (!out) out = [0, 0, 0];
    const dt = tB - tA;
    if (dt <= 0) {
        out[0] = 0; out[1] = 0; out[2] = 0;
        return out;
    }

    // qA⁻¹ for a unit quaternion is (-qx, -qy, -qz, qw).
    const aInvx = -qA.x, aInvy = -qA.y, aInvz = -qA.z, aInvw = qA.w;

    // delta = qB ⊗ qA⁻¹.
    // Hamilton product qB ⊗ aInv:
    const bx = qB.x, by = qB.y, bz = qB.z, bw = qB.w;
    const dx = bw * aInvx + bx * aInvw + by * aInvz - bz * aInvy;
    const dy = bw * aInvy - bx * aInvz + by * aInvw + bz * aInvx;
    const dz = bw * aInvz + bx * aInvy - by * aInvx + bz * aInvw;
    const dw = bw * aInvw - bx * aInvx - by * aInvy - bz * aInvz;

    // Renormalize to compensate for accumulated numerical drift.
    const dnorm = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
    if (dnorm < 1e-12) {
        out[0] = 0; out[1] = 0; out[2] = 0;
        return out;
    }
    const ndx = dx / dnorm;
    const ndy = dy / dnorm;
    const ndz = dz / dnorm;
    const ndw = dw / dnorm;

    // Choose the short rotation direction (|angle| <= π).
    let w = ndw;
    if (w > 1) w = 1;
    if (w < -1) w = -1;
    const angle = (w >= 0)
        ? 2 * Math.acos(w)
        : -2 * Math.acos(-w);

    if (Math.abs(angle) < 1e-9) {
        out[0] = 0; out[1] = 0; out[2] = 0;
        return out;
    }

    const halfAngle = angle / 2;
    const sinHalf = Math.sin(halfAngle);
    if (Math.abs(sinHalf) < 1e-9) {
        out[0] = 0; out[1] = 0; out[2] = 0;
        return out;
    }

    // delta.xyz is already in A's body frame.
    const axisX = ndx / sinHalf;
    const axisY = ndy / sinHalf;
    const axisZ = ndz / sinHalf;

    out[0] = axisX * angle / dt;
    out[1] = axisY * angle / dt;
    out[2] = axisZ * angle / dt;
    return out;
}
