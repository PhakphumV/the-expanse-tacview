// js/scene.js
// Three.js scene, camera, renderer. Pure setup; no gameplay logic. The
// starfield subsystem moved to js/starfield.js in Phase 6 #33, and the
// OrbitControls creation was removed in Phase 6 #32 (the two remaining
// camera modes compute their own transforms).

const THREE = window.THREE;

export function createScene(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );
    camera.position.set(0, 120, 220);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    function render() {
        renderer.render(scene, camera);
    }

    return { scene, camera, renderer, render, onResize };
}
