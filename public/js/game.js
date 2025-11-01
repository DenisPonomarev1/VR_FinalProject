// First-person controls with simple wall collisions (no physics lib needed)
AFRAME.registerComponent('fp-controls', {
  schema: {
    speed:  { type: 'number', default: 3.5 }, // m/s
    radius: { type: 'number', default: 0.35 } // player "capsule" radius (2D circle)
  },

  init() {
    // --- Key handling ---
    this.keys = {};
    window.addEventListener('keydown', e => this.keys[e.code] = true);
    window.addEventListener('keyup',   e => this.keys[e.code] = false);

    // --- Wall setup ---
    this.walls = [];
    this.refreshWalls();

    // 🩵 FIX: ensure we re-scan for solids after all entities are fully loaded
    this.el.sceneEl.addEventListener('loaded', () => {
      // Give A-Frame a small delay to attach late children (like tunnels)
      setTimeout(() => {
        this.refreshWalls();
        console.log("🔁 Walls refreshed after full scene load:", this.walls.length);
      }, 200);
    });
  },

  // Collect all walls with class="solid"
  refreshWalls() {
    const solids = Array.from(document.querySelectorAll('.solid'));
    this.walls = solids.map(el => {
      const pos = el.object3D.position;
      const w   = parseFloat(el.getAttribute('width'))  || 0.001;
      const d   = parseFloat(el.getAttribute('depth'))  || 0.001;
      return {
        x: pos.x,
        z: pos.z,
        hx: w * 0.5,  // half-width
        hz: d * 0.5   // half-depth
      };
    });
    console.log("✅ Walls registered:", this.walls.length);
  },

  tick(time, deltaMs) {
    const dt = Math.min(0.05, deltaMs / 1000); // clamp for stability
    const speed = this.data.speed;

    const o3d  = this.el.object3D;
    const pos  = o3d.position;
    const yaw  = THREE.MathUtils.degToRad(this.el.getAttribute('rotation').y);

    // Build local movement vectors
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right   = new THREE.Vector3(forward.z, 0, -forward.x).negate(); 

    // Read input
    let dir = new THREE.Vector3(0,0,0);
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.add(right);

    if (dir.lengthSq() === 0) return;

    dir.normalize().multiplyScalar(speed * dt);

    // Proposed move
    const targetX = pos.x + dir.x;
    const targetZ = pos.z + dir.z;
    const r = this.data.radius;

    const resolved = this.resolveCollision(pos.x, pos.z, targetX, targetZ, r);
    pos.x = resolved.x;
    pos.z = resolved.z;
  },

  // Collision resolution: circle (player) vs AABB (walls)
  resolveCollision(currX, currZ, nextX, nextZ, radius) {
    const intersectsAny = (x, z) => {
      for (const w of this.walls) {
        if (Math.abs(x - w.x) <= (w.hx + radius) &&
            Math.abs(z - w.z) <= (w.hz + radius)) {
          return true;
        }
      }
      return false;
    };

    // Try full move first, then axis slides
    if (!intersectsAny(nextX, nextZ)) return {x: nextX, z: nextZ};
    if (!intersectsAny(nextX, currZ)) return {x: nextX, z: currZ};
    if (!intersectsAny(currX, nextZ)) return {x: currX, z: nextZ};

    // Fully blocked — stay put
    return {x: currX, z: currZ};
  }
});


