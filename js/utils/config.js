// Shared application tuning. Update values here before creating module
// instances; runtime consumers read this object rather than local copies.
export const CONFIG = {
    camera: {
        centerBaseHeight: 80,
        centerRangeScale: 0.05,
        centerMinHeight: 60,
        centerBackOffset: 1,
        chaseOffset: { x: 0, y: 12, z: 40 },
        orbitPitchLimit: Math.PI / 2 - 0.01,
        minOrbitDistanceScale: 0.01,
        maxOrbitDistanceScale: 100,
        rotationSensitivity: 0.005,
        zoomSensitivity: 0.001,
        damping: 0.12,
    },
    starfield: {
        layers: [
            { count: 1500, radius: 400, size: 1.0, parallax: 0.5 },
            { count: 2500, radius: 700, size: 0.85, parallax: 0.2 },
            { count: 2000, radius: 1100, size: 0.7, parallax: 0.05 },
        ],
    },
    rangeRing: {
        radiusMeters: 10000,
        segments: 64,
    },
    telemetry: {
        gravity: 9.8,
        burnThresholdMps2: 0.5,
    },
    hud: {
        numericPrecision: 2,
        anglePrecision: 1,
    },
    playback: {
        speedOptions: [0.25, 0.5, 1, 2, 4],
        minSpeed: 0.25,
        maxSpeed: 4,
        defaultSpeed: 1,
    },
};