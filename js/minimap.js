// js/minimap.js
// Bottom-left overview canvas: top-down plot of ship and torpedo positions
// framed from the dataset's keyframe bounds.

export function createMinimap(playbackEngine) {
    const canvas = document.getElementById('minimap');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    let bounds = null;

    function computeBounds() {
        const ents = playbackEngine.getEntities();
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const id in ents) {
            const kfs = ents[id].keyframes;
            for (const k of kfs) {
                if (k.pos.x < minX) minX = k.pos.x;
                if (k.pos.x > maxX) maxX = k.pos.x;
                if (k.pos.z < minZ) minZ = k.pos.z;
                if (k.pos.z > maxZ) maxZ = k.pos.z;
            }
        }
        const pad = 20;
        bounds = {
            minX: minX - pad, maxX: maxX + pad,
            minZ: minZ - pad, maxZ: maxZ + pad,
        };
    }

    function project(x, z) {
        const u = (x - bounds.minX) / (bounds.maxX - bounds.minX);
        const v = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ);
        return [u * w, v * h];
    }

    function draw(t) {
        if (!bounds) return;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);

        const stateMap = playbackEngine.getStateAtTime(t);
        const ships = ['roci', 'zmeya'];
        ships.forEach(function (id) {
            const s = stateMap[id];
            if (s && s.active) {
                const [px, py] = project(s.position.x, s.position.z);
                ctx.fillStyle = id === 'roci' ? '#3a7bd5' : '#d53a3a';
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = '10px monospace';
                ctx.fillText(id.toUpperCase(), px + 6, py + 4);
            }
        });

        const ents = playbackEngine.getEntities();
        for (const id in ents) {
            if (ents[id].type === 'torpedo') {
                const s = stateMap[id];
                if (s && s.active) {
                    const [px, py] = project(s.position.x, s.position.z);
                    ctx.fillStyle = '#ffaa00';
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    return { computeBounds, draw };
}
