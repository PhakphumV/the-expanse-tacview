// js/ship-models.js
// Procedural tactical ship silhouettes built from Three.js primitives.
// Original/synthetic designs inspired by generic corvette vs destroyer
// archetypes. No copyrighted show assets are imported or reproduced.

const THREE = window.THREE;

function makePart(geom, color, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: !!opts.transparent,
        opacity: opts.opacity !== undefined ? opts.opacity : 1,
    });
    return new THREE.Mesh(geom, mat);
}

function makeEmissive(color, size = 1) {
    const geom = new THREE.SphereGeometry(size, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    return new THREE.Mesh(geom, mat);
}

// ROCI — fast attack corvette silhouette.
// Long narrow hull, pointed bow, twin engine nacelles flanking the stern,
// tall sensor mast with dish, and two dorsal PDC turrets (forward/aft).
export function createRociModel() {
    const group = new THREE.Group();
    const hullColor = 0x3a7bd5;

    // Main hull
    group.add(makePart(new THREE.BoxGeometry(8, 6, 36), hullColor));

    // Bow taper (forward = -Z)
    const bow = makePart(new THREE.ConeGeometry(4, 10, 4), hullColor);
    bow.rotation.x = Math.PI / 2;
    bow.position.z = -23;
    group.add(bow);

    // Twin engine nacelles flanking rear
    const nacelleGeom = new THREE.CylinderGeometry(1.5, 1.5, 8, 8);
    const leftNacelle = makePart(nacelleGeom, hullColor);
    leftNacelle.rotation.x = Math.PI / 2;
    leftNacelle.position.set(-5, 0, 16);
    group.add(leftNacelle);

    const rightNacelle = makePart(nacelleGeom, hullColor);
    rightNacelle.rotation.x = Math.PI / 2;
    rightNacelle.position.set(5, 0, 16);
    group.add(rightNacelle);

    // Sensor mast
    const mast = makePart(new THREE.CylinderGeometry(0.3, 0.3, 5, 6), hullColor);
    mast.position.set(0, 5.5, 0);
    group.add(mast);

    // Sensor dish (IFF-readable light blue)
    const dish = makePart(new THREE.SphereGeometry(0.8, 8, 8), 0x88ccff);
    dish.position.set(0, 8, 0);
    group.add(dish);

    // Dorsal PDC turrets
    const turretGeom = new THREE.SphereGeometry(1, 8, 8);
    const turretFwd = makePart(turretGeom, 0x222222);
    turretFwd.position.set(0, 4, -10);
    group.add(turretFwd);

    const turretAft = makePart(turretGeom, 0x222222);
    turretAft.position.set(0, 4, 10);
    group.add(turretAft);

    // Engine glow (additive blue plumes)
    const glow1 = makeEmissive(0x88ccff, 1.2);
    glow1.position.set(-5, 0, 21);
    group.add(glow1);

    const glow2 = makeEmissive(0x88ccff, 1.2);
    glow2.position.set(5, 0, 21);
    group.add(glow2);

    return group;
}

// ZMEYA — heavy destroyer silhouette.
// Wider angular hull, wedge bow, large central engine block, dorsal fin,
// nose-mounted weapon, and flanking side weapon mounts.
export function createZmeyaModel() {
    const group = new THREE.Group();
    const hullColor = 0xd53a3a;

    // Main hull
    group.add(makePart(new THREE.BoxGeometry(14, 8, 32), hullColor));

    // Angular bow wedge
    group.add(makePart(new THREE.BoxGeometry(12, 6, 10), hullColor).translateZ(-20));

    // Bow point (forward = -Z)
    const bowPoint = makePart(new THREE.ConeGeometry(6, 8, 4), hullColor);
    bowPoint.rotation.x = Math.PI / 2;
    bowPoint.position.z = -28;
    group.add(bowPoint);

    // Central engine block (large cylinder at stern)
    const engineBlock = makePart(new THREE.CylinderGeometry(5, 5, 6, 8), hullColor);
    engineBlock.rotation.x = Math.PI / 2;
    engineBlock.position.z = 18;
    group.add(engineBlock);

    // Dorsal fin
    const fin = makePart(new THREE.BoxGeometry(0.5, 5, 14), hullColor);
    fin.position.set(0, 6.5, 0);
    group.add(fin);

    // Nose-mounted weapon
    const noseWeapon = makePart(new THREE.CylinderGeometry(0.8, 0.8, 5, 6), 0x222222);
    noseWeapon.rotation.x = Math.PI / 2;
    noseWeapon.position.set(0, 1, -24);
    group.add(noseWeapon);

    // Flanking side weapon mounts
    const sideWeaponGeom = new THREE.CylinderGeometry(0.6, 0.6, 3, 6);
    const leftWeapon = makePart(sideWeaponGeom, 0x222222);
    leftWeapon.rotation.x = Math.PI / 2;
    leftWeapon.position.set(-7, 0, -5);
    group.add(leftWeapon);

    const rightWeapon = makePart(sideWeaponGeom, 0x222222);
    rightWeapon.rotation.x = Math.PI / 2;
    rightWeapon.position.set(7, 0, -5);
    group.add(rightWeapon);

    // Engine glow (additive red plume)
    const glow = makeEmissive(0xff6644, 2.5);
    glow.position.set(0, 0, 22);
    group.add(glow);

    return group;
}
