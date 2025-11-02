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

// === Interactive Door Component (explicit separate colliders) ===
AFRAME.registerComponent('interactive-door', {
    schema: {
        openAngle: { type: 'number', default: -90 },
        duration:  { type: 'number', default: 1000 }
    },

    init() {
        this.isOpen = false;

            // --- CLOSED COLLIDER ---
            this.closedCollider = document.createElement('a-box');
            this.closedCollider.setAttribute('width', '3');
            this.closedCollider.setAttribute('height', '2.4');
            this.closedCollider.setAttribute('depth', '0.05');
            this.closedCollider.setAttribute('position', `0.002 1.2 -13.971`);
            this.closedCollider.setAttribute('class', 'solid');
            this.closedCollider.setAttribute('material', 'opacity:0; transparent:true');
            this.closedCollider.setAttribute('visible', 'false');  
            this.el.sceneEl.appendChild(this.closedCollider);

            // --- OPEN COLLIDER ---
            this.openCollider = document.createElement('a-box');
            this.openCollider.setAttribute('width', '0.05');
            this.openCollider.setAttribute('height', '2.4');
            this.openCollider.setAttribute('depth', '3');
            this.openCollider.setAttribute('position', `1.57 1.2 -15.0`);
            this.openCollider.setAttribute('material', 'opacity:0; transparent:true');
            this.openCollider.setAttribute('visible', 'false');  
            this.el.sceneEl.appendChild(this.openCollider);




    // Initially, open collider disabled
    this.openCollider.removeAttribute('class');

    // --- Door click listener ---
    this.el.addEventListener('click', () => this.toggleDoor());
},

toggleDoor() {
    this.isOpen = !this.isOpen;
    const toRot = this.isOpen ? this.data.openAngle : 0;

    // Animate the hinge rotation
    this.el.setAttribute('animation__rot', {
        property: 'rotation',
        to: `0 ${toRot} 0`,
        dur: this.data.duration,
        easing: 'easeInOutQuad'
    });

  // Swap colliders by attaching / detaching from scene
    if (this.isOpen) {
        // Door open: remove closed collider, add open collider
        if (this.closedCollider.parentElement) {
            this.closedCollider.parentElement.removeChild(this.closedCollider);
        }
    if (!this.openCollider.parentElement) {
        this.el.sceneEl.appendChild(this.openCollider);
    }
    this.openCollider.setAttribute('class', 'solid');
    console.log('Door opened → open collider active');
    } else {
        // Door closed: remove open collider, add closed collider
    if (this.openCollider.parentElement) {
        this.openCollider.parentElement.removeChild(this.openCollider);
    }
    if (!this.closedCollider.parentElement) {
        this.el.sceneEl.appendChild(this.closedCollider);
    }
    this.closedCollider.setAttribute('class', 'solid');
    console.log('Door closed → closed collider active');
    }

  // Refresh wall data after animation completes
    const rig = this.el.sceneEl.querySelector('[fp-controls]');
    if (rig && rig.components['fp-controls']) {
        setTimeout(() => rig.components['fp-controls'].refreshWalls(), this.data.duration);
    }
}

});





