// js/spacecraft-model.js
// A single, small procedural spacecraft body. It exists mainly to convey
// heading and orientation: a long hull (forward = -Z), a nose marker, and
// two solar-array wings. Original synthetic shape, no external assets.
//
// Classic-script module: attaches Tacview.createSpacecraftModel.

(function (global) {
    'use strict';
    const THREE = global.THREE;

    function mesh(geom, color) {
        return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color }));
    }

    function createSpacecraftModel() {
        const group = new THREE.Group();
        const bodyColor = 0x9db2d0;
        const accent = 0xffb454;

        // Main hull (long, forward = -Z).
        group.add(mesh(new THREE.BoxGeometry(5, 4, 26), bodyColor));

        // Nose marker at the front so heading reads clearly.
        const nose = mesh(new THREE.ConeGeometry(2.2, 6, 4), accent);
        nose.rotation.x = Math.PI / 2;
        nose.position.z = -16;
        group.add(nose);

        // Solar-array wings across Y (yaw axis), so roll is visible.
        const wingGeom = new THREE.BoxGeometry(2, 0.4, 22);
        const left = mesh(wingGeom, 0x22427a);
        left.position.set(10, 0, 0);
        group.add(left);
        const right = mesh(wingGeom, 0x22427a);
        right.position.set(-10, 0, 0);
        group.add(right);

        return group;
    }

    global.Tacview = global.Tacview || {};
    global.Tacview.createSpacecraftModel = createSpacecraftModel;
})(window);
