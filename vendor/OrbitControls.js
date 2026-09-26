// vendor/OrbitControls.js
// Minimal OrbitControls implementation compatible with the three.js UMD
// build (r128+). Provides the API surface consumed by js/scene.js:
//   - new THREE.OrbitControls(camera, domElement)
//   - controls.target     (Vector3) — camera look-at point
//   - controls.enabled    (boolean) — disable to freeze interaction
//   - controls.update()   — call each frame, returns true if camera moved
//   - controls.dispose()  — remove event listeners
//
// Features:
//   - Left mouse drag  → rotate (orbit around target)
//   - Right mouse drag → pan (translate target in screen plane)
//   - Mouse wheel      → zoom (change radius)
//   - Touch (1 finger) → rotate, (2 fingers) → pan + zoom
//
// This is an original implementation written for this project to avoid
// a fragile CDN dependency (cdnjs no longer ships OrbitControls.js
// alongside three.js r128+; see issue #26).

(function (global) {
    'use strict';

    const MOUSE = { ROTATE: 0, DOLLY: 1, PAN: 2 };
    const TOUCH = { ROTATE: 0, PAN: 1, DOLLY_PAN: 2, DOLLY_ROTATE: 3 };

    // Two-finger gesture detection thresholds.
    const EPS = 0.000001;
    const TWO_FINGER_TOLERANCE = 10; // pixels

    class OrbitControls {
        constructor(camera, domElement) {
            this.camera = camera;
            this.domElement = domElement || document;

            // ---- Public API ----
            this.target = new global.THREE.Vector3();
            this.enabled = true;
            this.enableDamping = false;
            this.dampingFactor = 0.05;
            this.enableZoom = true;
            this.zoomSpeed = 1.0;
            this.enableRotate = true;
            this.rotateSpeed = 1.0;
            this.enablePan = true;
            this.panSpeed = 1.0;
            this.minDistance = 0;
            this.maxDistance = Infinity;
            this.minPolarAngle = 0;
            this.maxPolarAngle = Math.PI;

            // ---- Internal state ----
            this._spherical = new global.THREE.Spherical();
            this._sphericalDelta = new global.THREE.Spherical();
            this._panOffset = new global.THREE.Vector3();
            this._scale = 1;
            this._lastPosition = new global.THREE.Vector3();
            this._lastQuaternion = new global.THREE.Quaternion();

            const scope = this;

            function onContextMenu(e) { e.preventDefault(); }

            function onMouseDown(e) {
                if (!scope.enabled) return;
                e.preventDefault();
                if (e.button === 0) scope._state = MOUSE.ROTATE;
                else if (e.button === 1) scope._state = MOUSE.DOLLY;
                else if (e.button === 2) scope._state = MOUSE.PAN;
                if (scope._state !== undefined) {
                    scope._prevX = e.clientX;
                    scope._prevY = e.clientY;
                    scope.domElement.addEventListener('mousemove', onMouseMove, false);
                    scope.domElement.addEventListener('mouseup', onMouseUp, false);
                }
            }

            function onMouseMove(e) {
                if (!scope.enabled) return;
                e.preventDefault();
                const dx = e.clientX - scope._prevX;
                const dy = e.clientY - scope._prevY;
                scope._prevX = e.clientX;
                scope._prevY = e.clientY;
                const el = scope.domElement;
                if (scope._state === MOUSE.ROTATE && scope.enableRotate) {
                    scope._rotateLeft(2 * Math.PI * dx / el.clientHeight * scope.rotateSpeed);
                    scope._rotateUp(2 * Math.PI * dy / el.clientHeight * scope.rotateSpeed);
                } else if (scope._state === MOUSE.PAN && scope.enablePan) {
                    scope._pan(dx, dy);
                } else if (scope._state === MOUSE.DOLLY && scope.enableZoom) {
                    scope._dolly(dy);
                }
            }

            function onMouseUp() {
                scope.domElement.removeEventListener('mousemove', onMouseMove, false);
                scope.domElement.removeEventListener('mouseup', onMouseUp, false);
                scope._state = undefined;
            }

            function onMouseWheel(e) {
                if (!scope.enabled || !scope.enableZoom) return;
                e.preventDefault();
                e.stopPropagation();
                scope._dolly(e.deltaY);
            }

            function onTouchStart(e) {
                if (!scope.enabled) return;
                switch (e.touches.length) {
                    case 1: scope._state = TOUCH.ROTATE; break;
                    case 2:
                        if (scope.enableZoom && scope.enablePan) scope._state = TOUCH.DOLLY_PAN;
                        else if (scope.enableZoom) scope._state = TOUCH.DOLLY;
                        else if (scope.enablePan) scope._state = TOUCH.PAN;
                        break;
                    default: scope._state = undefined;
                }
                if (scope._state !== undefined) {
                    scope._prevX = (e.touches[0].pageX + (e.touches[1] ? e.touches[1].pageX : 0)) / 2;
                    scope._prevY = (e.touches[0].pageY + (e.touches[1] ? e.touches[1].pageY : 0)) / 2;
                    scope._prevDist = scope._touchDist(e.touches);
                    scope._prevFingers = scope._fingersSpread(e.touches);
                }
            }

            function onTouchMove(e) {
                if (!scope.enabled) return;
                e.preventDefault();
                if (e.touches.length === 1 && scope._state === TOUCH.ROTATE && scope.enableRotate) {
                    const dx = e.touches[0].pageX - scope._prevX;
                    const dy = e.touches[0].pageY - scope._prevY;
                    scope._prevX = e.touches[0].pageX;
                    scope._prevY = e.touches[0].pageY;
                    const el = scope.domElement;
                    scope._rotateLeft(2 * Math.PI * dx / el.clientHeight * scope.rotateSpeed);
                    scope._rotateUp(2 * Math.PI * dy / el.clientHeight * scope.rotateSpeed);
                } else if (e.touches.length === 2) {
                    const d = scope._touchDist(e.touches);
                    const f = scope._fingersSpread(e.touches);
                    if (scope._state === TOUCH.DOLLY_PAN) {
                        if (scope.enableZoom) scope._dollyDelta(scope._prevDist, d);
                        if (scope.enablePan) {
                            const dx = (e.touches[0].pageX + e.touches[1].pageX) / 2 - scope._prevX;
                            const dy = (e.touches[0].pageY + e.touches[1].pageY) / 2 - scope._prevY;
                            scope._pan(dx, dy);
                        }
                        scope._prevX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                        scope._prevY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                        scope._prevDist = d;
                        scope._prevFingers = f;
                    } else if (scope._state === TOUCH.DOLLY) {
                        scope._dollyDelta(scope._prevDist, d);
                        scope._prevDist = d;
                    } else if (scope._state === TOUCH.PAN && scope.enablePan) {
                        const dx = (e.touches[0].pageX + e.touches[1].pageX) / 2 - scope._prevX;
                        const dy = (e.touches[0].pageY + e.touches[1].pageY) / 2 - scope._prevY;
                        scope._pan(dx, dy);
                        scope._prevX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                        scope._prevY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                    }
                }
            }

            function onTouchEnd() {
                scope._state = undefined;
            }

            domElement.addEventListener('contextmenu', onContextMenu, false);
            domElement.addEventListener('mousedown', onMouseDown, false);
            domElement.addEventListener('wheel', onMouseWheel, { passive: false });
            domElement.addEventListener('touchstart', onTouchStart, { passive: false });
            domElement.addEventListener('touchmove', onTouchMove, { passive: false });
            domElement.addEventListener('touchend', onTouchEnd, false);

            this._listeners = { onContextMenu, onMouseDown, onMouseMove, onMouseUp, onMouseWheel, onTouchStart, onTouchMove, onTouchEnd };
        }

        // ---- Private helpers ----
        _rotateLeft(angle) { this._sphericalDelta.theta -= angle; }
        _rotateUp(angle) { this._sphericalDelta.phi -= angle; }
        _pan(dx, dy) {
            const el = this.domElement;
            const offset = new global.THREE.Vector3();
            const camera = this.camera;
            // Camera right and up in world space, projected to the
            // horizontal plane through the target.
            offset.copy(camera.position).sub(this.target);
            let targetDistance = offset.length();
            targetDistance *= Math.tan((camera.fov / 2) * Math.PI / 180);
            const panX = -2 * dx * targetDistance / el.clientHeight * this.panSpeed;
            const panY = 2 * dy * targetDistance / el.clientHeight * this.panSpeed;
            const x = new global.THREE.Vector3();
            const y = new global.THREE.Vector3();
            x.setFromMatrixColumn(camera.matrix, 0);
            y.setFromMatrixColumn(camera.matrix, 1);
            x.multiplyScalar(panX);
            y.multiplyScalar(panY);
            this._panOffset.add(x).add(y);
        }
        _dolly(dollyDelta) {
            if (dollyDelta > 0) this._scale /= Math.pow(0.95, this.zoomSpeed);
            else if (dollyDelta < 0) this._scale *= Math.pow(0.95, this.zoomSpeed);
        }
        _dollyDelta(prev, curr) {
            const element = this.domElement;
            const delta = prev - curr;
            if (delta > 0) this._scale *= Math.pow(0.95, this.zoomSpeed * delta / element.clientHeight);
            else if (delta < 0) this._scale /= Math.pow(0.95, this.zoomSpeed * -delta / element.clientHeight);
        }
        _touchDist(touches) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            return Math.sqrt(dx * dx + dy * dy);
        }
        _fingersSpread(touches) {
            return Math.hypot(
                touches[0].pageX - touches[1].pageX,
                touches[0].pageY - touches[1].pageY
            );
        }

        // ---- Public API ----
        update() {
            const offset = new global.THREE.Vector3();
            const camera = this.camera;
            const position = camera.position;
            offset.copy(position).sub(this.target);
            this._spherical.setFromVector3(offset);

            if (this.enableDamping) {
                this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
                this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
            } else {
                this._spherical.theta += this._sphericalDelta.theta;
                this._spherical.phi += this._sphericalDelta.phi;
            }

            // Clamp polar angle.
            this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
            this._spherical.makeSafe();
            this._spherical.radius *= this._scale;
            this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));

            // Apply pan to target.
            if (this.enableDamping === true) {
                this.target.addScaledVector(this._panOffset, this.dampingFactor);
            } else {
                this.target.add(this._panOffset);
            }

            offset.setFromSpherical(this._spherical);
            position.copy(this.target).add(offset);
            camera.lookAt(this.target);

            // Reset deltas.
            if (this.enableDamping === true) {
                this._sphericalDelta.theta *= (1 - this.dampingFactor);
                this._sphericalDelta.phi *= (1 - this.dampingFactor);
                this._panOffset.multiplyScalar(1 - this.dampingFactor);
            } else {
                this._sphericalDelta.set(0, 0, 0);
                this._panOffset.set(0, 0, 0);
            }
            this._scale = 1;

            // Detect change.
            if (this._sphericalDelta.theta === 0 && this._sphericalDelta.phi === 0 &&
                this._panOffset.lengthSq() === 0 &&
                this._scale === 1 &&
                position.distanceToSquared(this._lastPosition) < EPS &&
                8 * (1 - camera.quaternion.dot(this._lastQuaternion)) < EPS) {
                return false;
            }
            this._lastPosition.copy(position);
            this._lastQuaternion.copy(camera.quaternion);
            return true;
        }

        dispose() {
            const el = this.domElement;
            const L = this._listeners;
            el.removeEventListener('contextmenu', L.onContextMenu, false);
            el.removeEventListener('mousedown', L.onMouseDown, false);
            el.removeEventListener('wheel', L.onMouseWheel, { passive: false });
            el.removeEventListener('touchstart', L.onTouchStart, { passive: false });
            el.removeEventListener('touchmove', L.onTouchMove, { passive: false });
            el.removeEventListener('touchend', L.onTouchEnd, false);
        }
    }

    if (typeof global.THREE !== 'undefined') {
        global.THREE.OrbitControls = OrbitControls;
    }
})(typeof window !== 'undefined' ? window : globalThis);
