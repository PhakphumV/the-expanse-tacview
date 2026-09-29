export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

export function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

export function multiplyQuaternions(a, b, out = {}) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w;
    const bx = b.x, by = b.y, bz = b.z, bw = b.w;
    out.x = aw * bx + ax * bw + ay * bz - az * by;
    out.y = aw * by - ax * bz + ay * bw + az * bx;
    out.z = aw * bz + ax * by - ay * bx + az * bw;
    out.w = aw * bw - ax * bx - ay * by - az * bz;
    return out;
}

export function normalizeQuaternion(quaternion, out = {}) {
    const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    if (length < 1e-12) {
        out.x = 0;
        out.y = 0;
        out.z = 0;
        out.w = 1;
        return out;
    }
    out.x = quaternion.x / length;
    out.y = quaternion.y / length;
    out.z = quaternion.z / length;
    out.w = quaternion.w / length;
    return out;
}

export function rotateVectorByQuaternion(vector, quaternion, out = {}) {
    const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y);
    const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z);
    const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x);
    out.x = vector.x + quaternion.w * tx + quaternion.y * tz - quaternion.z * ty;
    out.y = vector.y + quaternion.w * ty + quaternion.z * tx - quaternion.x * tz;
    out.z = vector.z + quaternion.w * tz + quaternion.x * ty - quaternion.y * tx;
    return out;
}

export function quaternionToEulerXYZ(quaternion, out = {}) {
    const x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w;
    const m11 = 1 - 2 * (y * y + z * z);
    const m13 = 2 * (x * z + y * w);
    const m21 = 2 * (x * y + z * w);
    const m32 = 2 * (y * z + x * w);
    const m33 = 1 - 2 * (x * x + y * y);
    out.x = Math.atan2(m32, m33);
    out.y = Math.asin(clamp(m13, -1, 1));
    out.z = Math.atan2(m21, m11);
    return out;
}

export function formatVector3(vector, precision = 2) {
    return '(' + vector.x.toFixed(precision) + ', ' +
        vector.y.toFixed(precision) + ', ' + vector.z.toFixed(precision) + ')';
}

export function formatTime(seconds, precision = 1, prefix = '') {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    const wholeSeconds = precision === 0 ? Math.floor(remainder) : remainder;
    const secondText = precision === 0
        ? String(wholeSeconds)
        : wholeSeconds.toFixed(precision);
    return prefix + String(minutes).padStart(2, '0') + ':' +
        (remainder < 10 ? '0' : '') + secondText;
}