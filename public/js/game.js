AFRAME.registerComponent('fp-controls', {
    schema: {
        speed:  { type: 'number', default: 3.5 },
        radius: { type: 'number', default: 0.35 }
    },

    init() {
        console.log('[fp] init()');
        this.head = this.el.querySelector('[camera]');

        // keyboard
        this.keys = {};
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup',   e => this.keys[e.code] = false);

        // left-stick movement
        this.joy = { x: 0, y: 0 };

        // right-stick turn amount (continuous)
        this.turnX = 0;               
        this.turnSpeed = THREE.MathUtils.degToRad(120); 

        // walls
        this.walls = [];
        this.refreshWalls();
        this.el.sceneEl.addEventListener('solids-changed', () => this.refreshWalls());

        this.groundRaycaster = new THREE.Raycaster();
        this.groundMeshes = [];

        this.lastPadLog = 0;

        this.el.sceneEl.addEventListener('loaded', () => {
        // LEFT HAND = move
        const leftHand = this.el.sceneEl.querySelector('#leftHand');
        if (leftHand) {
            leftHand.addEventListener('thumbstickmoved', evt => {
            const dz = 0.15;
            const x = Math.abs(evt.detail.x) > dz ? evt.detail.x : 0;
            const y = Math.abs(evt.detail.y) > dz ? evt.detail.y : 0;
            this.joy.x = x;
            this.joy.y = y;
            });

            leftHand.addEventListener('axismove', evt => {
            if (!evt.detail || !evt.detail.axis) return;
            const dz = 0.15;
            const ax = evt.detail.axis;
            const x = Math.abs(ax[0]) > dz ? ax[0] : 0;
            const y = Math.abs(ax[1]) > dz ? ax[1] : 0;
            this.joy.x = x;
            this.joy.y = y;
            });
        }

        // RIGHT HAND = smooth turn
        const rightHand = this.el.sceneEl.querySelector('#rightHand');
        if (rightHand) {
            console.log('[fp] ✅ found #rightHand, attaching smooth turn listeners');

            rightHand.addEventListener('thumbstickmoved', evt => {
            const dz = 0.15;
            const x = Math.abs(evt.detail.x) > dz ? evt.detail.x : 0;
            this.turnX = x;   // just store it, no snapping
            });

            rightHand.addEventListener('axismove', evt => {
            if (!evt.detail || !evt.detail.axis) return;
            const ax = evt.detail.axis;
            const dz = 0.15;
            const x = Math.abs(ax[0]) > dz ? ax[0] : 0;
            this.turnX = x;
            });
        } else {
            console.warn('[fp] ❌ did NOT find #rightHand — check your HTML id');
        }

        // --- TERRAIN FOLLOW SETUP ---

        // Helper to add all meshes from a root node
        const addMeshesFrom = (root) => {
            if (!root) return;
            root.traverse(obj => {
            if (obj.isMesh) {
                this.groundMeshes.push(obj);
            }
            });
        };

        // 1) Environment ground (yavapai)
        const env = document.querySelector('#marsEnv');
        if (env && env.object3D) {
            addMeshesFrom(env.object3D);
        }

        // 2) Olympus Mons – wait for model to load
        const olympus = document.querySelector('#olympusMons');
        if (olympus) {
            // If the mesh is already there (sometimes it is):
            const existing = olympus.getObject3D('mesh');
            if (existing) {
            addMeshesFrom(existing);
            }

            // Also listen for model-loaded in case it wasn't ready yet
            olympus.addEventListener('model-loaded', (e) => {
            console.log('[fp] olympus model-loaded, adding meshes');
            addMeshesFrom(e.detail.model);
            console.log('[fp] terrain meshes total:', this.groundMeshes.length);
            });
        }

        console.log('[fp] initial terrain meshes:', this.groundMeshes.length);

        setTimeout(() => {
            this.refreshWalls();
        }, 200);
      });
},
    refreshWalls() {
        const solids = Array.from(document.querySelectorAll('.solid'));
        this.walls = solids.map(el => {
        const pos = el.object3D.position;
        const w   = parseFloat(el.getAttribute('width'))  || 0.001;
        const d   = parseFloat(el.getAttribute('depth'))  || 0.001;
        return {
            x: pos.x,
            z: pos.z,
            hx: w * 0.5,
            hz: d * 0.5
        };
        });
        console.log('[fp] refreshWalls ->', this.walls.length, 'walls');
    },

    updateHeightOnTerrain() {
        if (!this.groundMeshes || this.groundMeshes.length === 0) return;

        const pos = this.el.object3D.position;

        // Cast from above player down to find ground
        const origin = new THREE.Vector3(pos.x, pos.y + 20, pos.z);
        const dir    = new THREE.Vector3(0, -1, 0);

        this.groundRaycaster.set(origin, dir);

        // true = recursive, so it checks children meshes too
        const hits = this.groundRaycaster.intersectObjects(this.groundMeshes, true);
        if (!hits || hits.length === 0) return;

        const hitY = hits[0].point.y;

        // Offset so the rig origin (feet) sits slightly above the surface
        const footOffset = 0.0;   // try 0.05 if you see clipping
        pos.y = hitY + footOffset;
    },



    tick(time, deltaMs) {
        const dt    = Math.min(0.05, deltaMs / 1000);
        const speed = this.data.speed;
        const pos   = this.el.object3D.position;

        // 1) apply smooth turn from right stick
        if (this.turnX !== 0) {
        // turn right stick right → rotate rig right (negative Y is right in your snap version)
        this.el.object3D.rotation.y += -this.turnX * this.turnSpeed * dt;
        }

        // 2) now compute movement direction based on rig + head
        const rigRotY  = this.el.object3D.rotation.y;
        const headRotY = this.head ? this.head.object3D.rotation.y : 0;
        const yaw = rigRotY + headRotY;

        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right   = new THREE.Vector3(forward.z, 0, -forward.x).negate();

        let dir = new THREE.Vector3();

        // keyboard
        if (this.keys['KeyW'] || this.keys['ArrowUp'])    dir.add(forward);
        if (this.keys['KeyS'] || this.keys['ArrowDown'])  dir.sub(forward);
        if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dir.sub(right);
        if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.add(right);

        // left-stick movement (already stored)
        let joyX = this.joy.x;
        let joyY = this.joy.y;

        // optional: still poll gamepads to catch desktop pads
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of pads) {
        if (!gp || !gp.connected || !gp.axes) continue;
        const axX = gp.axes[2] !== undefined ? gp.axes[2] : gp.axes[0];
        const axY = gp.axes[3] !== undefined ? gp.axes[3] : gp.axes[1];
        const dz  = 0.15;
        const x   = Math.abs(axX) > dz ? axX : 0;
        const y   = Math.abs(axY) > dz ? axY : 0;
        if (x !== 0 || y !== 0) {
            joyX = x;
            joyY = y;
            break;
        }
        }

        // apply joystick to movement
        if (joyY !== 0) {
        dir.add(forward.clone().multiplyScalar(-joyY));
        }
        if (joyX !== 0) {
        dir.add(right.clone().multiplyScalar(joyX));
        }

        if (dir.lengthSq() === 0) return;

        dir.normalize().multiplyScalar(speed * dt);

        const targetX = pos.x + dir.x;
        const targetZ = pos.z + dir.z;
        const r       = this.data.radius;

        const resolved = this.resolveCollision(pos.x, pos.z, targetX, targetZ, r);

        pos.x = resolved.x;
        pos.z = resolved.z;

        // Follow the terrain height
        this.updateHeightOnTerrain();
    },

    

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

        if (!intersectsAny(nextX, nextZ)) return {x: nextX, z: nextZ};
        if (!intersectsAny(nextX, currZ)) return {x: nextX, z: currZ};
        if (!intersectsAny(currX, nextZ)) return {x: currX, z: nextZ};
        return {x: currX, z: currZ};
    }
});

// Mineral analysis texts for the lab console
const MINERAL_ANALYSIS_TEXT = {
    basalt: (
    'Basalt is a dark, fine-grained volcanic rock rich in iron and magnesium, about 90% of Mars is covered by basalts\n' +
    'On Mars, many lava plains and much of the crust are basaltic, showing that the planet once had\n' +
    'widespread volcanic eruptions and a hot, active interior.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: dark gray to black\n' +
    '- Density: ~2.8–3.0 g/cm³\n' +
    '- Hardness: ~6 on the Mohs scale\n' +
    '- Texture: fine-grained, often with tiny crystals\n' +
    '- Main minerals: pyroxene, plagioclase feldspar, olivine'
    ),

    dunite: (
    'Dunite is an ultramafic igneous rock made mostly of the mineral olivine.\n' +
    'On Mars, olivine-rich dunite points to material that formed deep in the mantle or in very primitive lavas,\n' +
    'preserving clues about the planet’s early interior and limited water-driven alteration.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: olive green to dark green-brown\n' +
    '- Density: ~3.2–3.4 g/cm³\n' +
    '- Hardness: ~6.5–7 on the Mohs scale\n' +
    '- Texture: coarse to granular, dominated by olivine crystals\n' +
    '- Main minerals: >90% olivine, with minor pyroxene and spinel'
    ),

    hematite: (
    'Hematite is an iron oxide mineral (Fe₂O₃) that gives Mars much of its rusty-red color.\n' +
    'On Mars, coarse hematite often forms in the presence of liquid water, such as in lakes,\n' +
    'groundwater systems, or hot springs. Its presence is a strong clue that some regions once\n' +
    'had standing or slowly moving water and more active chemical weathering.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: metallic gray to reddish-brown\n' +
    '- Streak: reddish\n' +
    '- Density: ~5.0–5.3 g/cm³\n' +
    '- Hardness: ~5.5–6.5 on the Mohs scale'
),

gypsum: (
        'Gypsum is a hydrated calcium sulfate mineral (CaSO₄·2H₂O) that almost always forms in the presence of water.\n' +
        'On Mars, gypsum veins and layers suggest that mineral-rich water once moved through cracks and sediments,\n' +
        'then slowly evaporated, leaving behind these bright deposits.\n\n' +
        'Key physical properties:\n' +
        '- Typical color: white to translucent, sometimes pale yellow or gray\n' +
        '- Hardness: ~2 on the Mohs scale (very soft — you can scratch it with a fingernail)\n' +
        '- Density: ~2.3 g/cm³\n' +
        '- Often forms veins, nodules, or layered deposits from evaporating water'
    )

};


AFRAME.registerSystem('inventory', {
    init: function () {
        this.collected = new Set();
        this._notifTimeout = null;
    },

    has: function (id) {
        return this.collected.has(id);
    },

    add: function (id) {
        if (this.collected.has(id)) {
                this.showNotification('Already collected: ' + this.prettyName(id));
                return false;
        }

        this.collected.add(id);
        this.updatePanel();
        this.showNotification('Collected: ' + this.prettyName(id) + ' rock');

        // Notify the scene so other components (like the shelf) can react
        if (this.el) {                 // <-- this.el is the <a-scene> for systems
            this.el.emit('inventory-changed', {
                collected: Array.from(this.collected)
            });
        }

        return true;
},



    prettyName: function (id) {
        if (!id) return '';
        return id.charAt(0).toUpperCase() + id.slice(1);
    },

    getListString: function () {
        if (this.collected.size === 0) return '(none)';
        return Array.from(this.collected)
                    .map(id => this.prettyName(id))
                    .join(', ');
    },

    updatePanel: function () {
        const listEl = document.querySelector('#inventoryList');
        if (!listEl) return;
        listEl.setAttribute('text', 'value', 'Collected: ' + this.getListString());
    },

    showNotification: function (msg) {
        const notif = document.querySelector('#notificationText');
        if (!notif) return;

        notif.setAttribute('text', 'value', msg);
        notif.setAttribute('visible', true);

        if (this._notifTimeout) {
            clearTimeout(this._notifTimeout);
        }
        this._notifTimeout = setTimeout(() => {
            notif.setAttribute('visible', false);
        }, 1500);
    }
});


AFRAME.registerComponent('interactive-door', {
    schema: {
        openAngle:   { type: 'number', default: -90 },
        duration:    { type: 'number', default: 1000 },

        // absolute world positions & sizes for AABB colliders (axis-aligned)
        closedPos:   { type: 'vec3', default: { x: 0.002, y: 1.2,  z: -13.971 } },
        openPos:     { type: 'vec3', default: { x: 1.57,  y: 1.2,  z: -15.0   } },
        closedSize:  { type: 'vec3', default: { x: 3.0,   y: 2.4,  z: 0.05    } },
        openSize:    { type: 'vec3', default: { x: 0.05,  y: 2.4,  z: 3.0     } }
    },

    init() {
        this.isOpen = false;

        // CLOSED collider (bar across the doorway)
        this.closedCollider = document.createElement('a-box');
        this.closedCollider.setAttribute('ignore-raycast', '');
        this.closedCollider.setAttribute('width',  this.data.closedSize.x);
        this.closedCollider.setAttribute('height', this.data.closedSize.y);
        this.closedCollider.setAttribute('depth',  this.data.closedSize.z);
        this.closedCollider.setAttribute('position',
        `${this.data.closedPos.x} ${this.data.closedPos.y} ${this.data.closedPos.z}`);
        this.closedCollider.setAttribute('class', 'solid');
        this.closedCollider.setAttribute('material', 'opacity:0; transparent:true');
        this.closedCollider.setAttribute('visible', 'false');
        this.el.sceneEl.appendChild(this.closedCollider);

        // OPEN collider (thin post to one side)
        this.openCollider = document.createElement('a-box');
        this.openCollider.setAttribute('width',  this.data.openSize.x);
        this.openCollider.setAttribute('height', this.data.openSize.y);
        this.openCollider.setAttribute('depth',  this.data.openSize.z);
        this.openCollider.setAttribute('position',
        `${this.data.openPos.x} ${this.data.openPos.y} ${this.data.openPos.z}`);
        this.openCollider.setAttribute('material', 'opacity:0; transparent:true');
        this.openCollider.setAttribute('visible', 'false');
        // not 'solid' initially
        this.el.sceneEl.appendChild(this.openCollider);
        //Only the button works, not the click
        //this.el.addEventListener('click', () => this.toggleDoor());

        this.el.addEventListener('toggle-door', () => this.toggleDoor());
    },

    toggleDoor() {
        this.isOpen = !this.isOpen;
        const toRot = this.isOpen ? this.data.openAngle : 0;

        this.el.setAttribute('animation__rot', {
        property: 'rotation',
        to: `0 ${toRot} 0`,
        dur: this.data.duration,
        easing: 'easeInOutQuad'
        });

        if (this.isOpen) {
        this.closedCollider.removeAttribute('class');     // not solid
        this.openCollider.setAttribute('class', 'solid'); // now solid
        } else {
        this.openCollider.removeAttribute('class');
        this.closedCollider.setAttribute('class', 'solid');
        }

        // tell fp-controls to rebuild AABBs
        this.el.sceneEl.emit('solids-changed');
    }
});

AFRAME.registerComponent('door-button', {
    schema: {
        target: { type: 'selector' }  // the hinge entity, e.g. #outerDoorHinge
    },

    init: function () {
        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        if (!this.data.target) return;
        console.log('[door-button] toggling', this.data.target.id); //debugging
        this.data.target.emit('toggle-door');
    }
});


AFRAME.registerComponent('ignore-raycast', {
    init() {
        this.el.object3D.traverse(o => { o.raycast = () => null; });
    }
});

AFRAME.registerComponent('scene-link', {
    schema: {
        href: { type: 'string' }
    },
    init() {
        this.el.addEventListener('click', () => {
        if (!this.data.href) return;
        // Go to another HTML page (relative to current one)
        window.location.href = this.data.href;
        });
    }
});

AFRAME.registerComponent('rock-grabbable', {
    schema: {
        rockId: { type: 'string', default: 'rock' }
    },

    init: function () {
        this.isHeld = false;
        this.hasBeenCollected = false;

        // Access the inventory system attached to the scene
        this.inventory = this.el.sceneEl.systems['inventory'];

        // Prefer right hand, then left, then camera as fallback
        this.hand = document.querySelector('#rightHand')
                || document.querySelector('#leftHand')
                || document.querySelector('#camera');

        this.camera = document.querySelector('#camera');
        this.scene  = this.el.sceneEl;

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        // First time we click it, mark as collected in inventory
        if (!this.hasBeenCollected && this.inventory) {
            const added = this.inventory.add(this.data.rockId);
            if (added) {
                this.hasBeenCollected = true;
                // Hide the floating hint above the rock
                const hint = this.el.querySelector('.collect-hint');
                if (hint) hint.setAttribute('visible', false);
            }
        }

        // Then toggle pick up / drop behaviour
        if (!this.isHeld) {
            this.pickUp();
        } else {
            this.drop();
        }
    },

    // Attach rock to hand and keep it just in front of controller
    pickUp: function () {
        if (!this.hand) { return; }

        this.hand.appendChild(this.el);

        // local offset from the hand: 30cm in front
        this.el.setAttribute('position', '0 0 -0.3');
        this.el.setAttribute('rotation', '0 0 0');

        this.isHeld = true;
    },

    // Drop rock on the ground in front of the camera (e.g., inside the hub)
    drop: function () {
        if (!this.camera) { return; }

        const camObj = this.camera.object3D;

        // Direction the camera is facing
        const forward = new THREE.Vector3(0, 0, -1);
        const camQuat = new THREE.Quaternion();
        camObj.getWorldQuaternion(camQuat);
        forward.applyQuaternion(camQuat);
        forward.setLength(1.0); // 1 meter ahead

        const camPos = new THREE.Vector3();
        camObj.getWorldPosition(camPos);

        const dropPos = camPos.add(forward);
        dropPos.y = 0.1; // on the ground

        // Re-parent to scene so it stops following the hand
        this.scene.appendChild(this.el);

        // Place it in world space
        this.el.object3D.position.copy(dropPos);

        this.isHeld = false;
    }
});

AFRAME.registerComponent('inventory-button', {
    init: function () {
        this.panel = document.querySelector('#inventoryPanel');
        this.inventory = this.el.sceneEl.systems['inventory'];
        this.isOpen = false;

        // NEW: cache question + back button
        this.questionEl = document.querySelector('#mineralQuestion');
        this.backButtonEl = document.querySelector('#backButton');
        this.analysisEl = document.querySelector('#analysisText');

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        if (!this.panel) return;

        this.isOpen = !this.isOpen;
        this.panel.setAttribute('visible', this.isOpen);

        if (this.isOpen) {
            // Refresh collected list if you have one
            if (this.inventory && this.inventory.updatePanel) {
                this.inventory.updatePanel();
            }

            // Reset UI to "choose a mineral" state
            if (this.questionEl) {
                this.questionEl.setAttribute('visible', true);
            }
            if (this.backButtonEl) {
                this.backButtonEl.setAttribute('visible', false);
            }
            if (this.analysisEl) {
                this.analysisEl.setAttribute(
                    'text',
                    'value',
                    'Select a mineral to analyze.'
                );
            }
        }
    }
});


AFRAME.registerComponent('lab-mineral-button', {
    schema: {
        mineralId: { type: 'string', default: 'unknown' }
    },

    init: function () {
        this.inventory = this.el.sceneEl.systems['inventory'];
        this.analysisEl = document.querySelector('#analysisText');
        this.questionEl = document.querySelector('#mineralQuestion');
        this.backButtonEl = document.querySelector('#backButton');
        this._timeout = null;

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
        if (this._timeout) clearTimeout(this._timeout);
    },

    onClick: function () {
        if (!this.inventory) return;

        const id = this.data.mineralId;
        const pretty = this.inventory.prettyName(id);

        // If not collected, show a message and bail
        if (!this.inventory.has(id)) {
            this.inventory.showNotification(
                'You haven\'t collected ' + pretty + ' yet.'
            );
            if (this.analysisEl) {
                this.analysisEl.setAttribute(
                    'text',
                    'value',
                    'You need to collect ' + pretty + ' before analyzing.'
                );
            }
            return;
        }

        // Hide the "What mineral..." question, show Back button
        if (this.questionEl) {
            this.questionEl.setAttribute('visible', false);
        }
        if (this.backButtonEl) {
            this.backButtonEl.setAttribute('visible', true);
        }

        // If collected, start "analysis"
        if (this.analysisEl) {
            this.analysisEl.setAttribute(
                'text',
                'value',
                'Analyzing ' + pretty + ' sample...'
            );
        }

        if (this._timeout) clearTimeout(this._timeout);

        // Fake 10s analysis, then show result from lookup (or fallback)
        this._timeout = setTimeout(() => {
            if (!this.analysisEl) return;

            const resultText =
                (MINERAL_ANALYSIS_TEXT[id]) ||
                (pretty + ' analysis data is not available yet.');

            this.analysisEl.setAttribute(
                'text',
                'value',
                resultText
            );
        }, 7000); // 10 seconds
    }
});

AFRAME.registerComponent('lab-back-button', {
    init: function () {
        this.questionEl  = document.querySelector('#mineralQuestion');
        this.analysisEl  = document.querySelector('#analysisText');
        this.backButtonEl = document.querySelector('#backButton');

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        // Show the question again
        if (this.questionEl) {
            this.questionEl.setAttribute('visible', true);
        }

        // Reset analysis text
        if (this.analysisEl) {
            this.analysisEl.setAttribute(
                'text',
                'value',
                'Select a mineral to analyze.'
            );
        }

        // Hide the back button itself
        if (this.backButtonEl) {
            this.backButtonEl.setAttribute('visible', false);
        }
    }
});

AFRAME.registerComponent('inventory-shelf', {
    init: function () {
        // Get the inventory system
        this.inventory = this.el.sceneEl.systems['inventory'];

        // Cache references to the shelf rock slots
        this.slots = {
            basalt:   this.el.querySelector('#shelfBasalt'),
            dunite:   this.el.querySelector('#shelfDunite'),
            hematite: this.el.querySelector('#shelfHematite'),
            gypsum:   this.el.querySelector('#shelfGypsum') 
        };

        // Bind handler
        this.onInventoryChanged = this.onInventoryChanged.bind(this);

        // Listen for inventory changes
        this.el.sceneEl.addEventListener('inventory-changed', this.onInventoryChanged);

        // Initial update
        this.updateFromInventory();
    },

    remove: function () {
        if (this.el.sceneEl) {
            this.el.sceneEl.removeEventListener('inventory-changed', this.onInventoryChanged);
        }
    },

    onInventoryChanged: function () {
        this.updateFromInventory();
    },

    // helper to apply faded/solid material
    setSlotOpacity: function (slotEl, hasRock) {
        if (!slotEl) return;

        const opacity = hasRock ? 1.0 : 0.3; // 10% ghost, 100% when collected

        // always visible so player sees the ghost
        slotEl.setAttribute('visible', true);

        const apply = () => {
            const mesh = slotEl.getObject3D('mesh');
            if (!mesh) return;

            mesh.traverse(node => {
                if (!node.isMesh || !node.material) return;

                const materials = Array.isArray(node.material)
                    ? node.material
                    : [node.material];

                materials.forEach(m => {
                    m.opacity = opacity;
                    m.transparent = opacity < 1.0;
                });
            });
        };

        // model might not yet be loaded when this runs
        if (slotEl.getObject3D('mesh')) {
            apply();
        } else {
            slotEl.addEventListener('model-loaded', apply, { once: true });
        }
    },

    updateFromInventory: function () {
        if (!this.inventory) return;

        Object.keys(this.slots).forEach(id => {
            const slot = this.slots[id];
            if (!slot) return;

            const hasRock = this.inventory.has(id);
            this.setSlotOpacity(slot, hasRock);
        });
    }
});

AFRAME.registerComponent('shelf-rock-label', {
    schema: {
        rockId: { type: 'string', default: 'rock' }
    },

    init: function () {
        // Grab the inventory system so we can reuse prettyName() + showNotification()
        this.inventory = this.el.sceneEl.systems['inventory'];

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        const id = this.data.rockId || 'rock';
        let name = id;

        if (this.inventory && this.inventory.prettyName) {
            name = this.inventory.prettyName(id);
        }

        // Show it in the HUD notification if available
        if (this.inventory && this.inventory.showNotification) {
            this.inventory.showNotification(name);
        } else {
            console.log('Shelf rock:', name);
        }
    }
});


// Simple Mars facts for the terminal
const MARS_FACTS = {
  atmosphere:
    'Mars has a thin atmosphere made mostly of carbon dioxide (~95%), with traces of nitrogen and argon. ' +
    'The surface pressure is less than 1% of Earth’s, so liquid water is unstable on the surface.',

  water:
    'Today, most Martian water is locked up as ice in the polar caps and beneath the surface. ' +
    'Ancient river channels and lakebeds show that Mars once had flowing liquid water billions of years ago.',

  missions:
    'Mars has been visited by many robotic missions, including orbiters, landers, and rovers. ' +
    'Famous rovers include Spirit, Opportunity, Curiosity, Perseverance, and the tiny helicopter Ingenuity. ' +
    'Go and explore the planet to find some rovers and their story behind it'
};

AFRAME.registerComponent('mars-fact-button', {
  schema: {
    topic: { type: 'string', default: 'atmosphere' }
  },

  init: function () {
    this.textPanel = document.querySelector('#marsFactsText');
    this.onClick = this.onClick.bind(this);
    this.el.addEventListener('click', this.onClick);
  },

  remove: function () {
    this.el.removeEventListener('click', this.onClick);
  },

  onClick: function () {
    if (!this.textPanel) return;
    const topic = this.data.topic;
    const txt = MARS_FACTS[topic] ||
      'No data available for topic: ' + topic;

    this.textPanel.setAttribute('text', 'value', txt);
  }
});


AFRAME.registerComponent('rover-quiz', {
    schema: {
        title: { type: 'string', default: 'Sojourner – Mars Pathfinder (1997)' },
        intro: {
            type: 'string',
            default:
                'Sojourner was the first rover ever to operate on Mars.\n' +
                'It was part of the Mars Pathfinder mission and tested rover technology\n' +
                'while studying Martian rocks and soil near its landing site.'
        }
    },

    init: function () {
        const el = this.el;

        // Find rover model (the clickable mesh)
        this.roverModel = el.querySelector('[gltf-model]');
        if (this.roverModel) {
            // Make sure raycaster can hit it
            this.roverModel.classList.add('interactive');
        }

        // Create info / quiz panel
        const panel = document.createElement('a-entity');
        panel.setAttribute('visible', 'false');
        panel.setAttribute('position', '-2 1.2 0.6');   // above + in front of rover
        panel.setAttribute('rotation', '-15 0 0');
        this.panel = panel;

        // Background
        const bg = document.createElement('a-plane');
        bg.setAttribute('width', 2.0);
        bg.setAttribute('height', 1.5);
        bg.setAttribute('material', 'color: #111; opacity: 0.9; side: double;');
        panel.appendChild(bg);

        // Title text
        const titleEl = document.createElement('a-entity');
        titleEl.setAttribute('position', '0 0.8 0.105');
        titleEl.setAttribute('text', {
            value: this.data.title,
            align: 'center',
            width: 2.4,
            color: '#000000ff',
            wrapCount: 28
        });
        panel.appendChild(titleEl);

        // Intro / explanation area (this will be reused after answer)
        const introEl = document.createElement('a-entity');
        introEl.setAttribute('position', '0 0.15 0.01');
        introEl.setAttribute('text', {
            value: this.data.intro,
            align: 'left',
            width: 1.9,
            color: '#ffffff',
            wrapCount: 36
        });
        panel.appendChild(introEl);
        this.introEl = introEl;

        // Question text
        const questionEl = document.createElement('a-entity');
        questionEl.setAttribute('position', '0 -0.5 0.127');
        questionEl.setAttribute('text', {
            value:
                'The mission lasted a total of 83 days.\n' +
                'How far do you think Sojourner drove in total?',
            align: 'center',
            width: 1.9,
            color: '#ffd480',
            wrapCount: 36
        });
        panel.appendChild(questionEl);
        this.questionEl = questionEl;

        // Create answer options (two rows of three)
        this.createOption('10 m',   '10m',   -0.6, -1);
        this.createOption('100 m',  '100m',   0.0, -1); // correct
        this.createOption('1 km',   '1km',    0.6, -1);

        this.createOption('10 km',  '10km',  -0.6, -1.35);
        this.createOption('100 km', '100km',  0.0, -1.35);
        this.createOption('1000 km','1000km', 0.6, -1.35);

        // Attach panel to rover root
        el.appendChild(panel);

        // Clicking the rover model toggles panel visibility
        this.onRoverClick = this.onRoverClick.bind(this);
        if (this.roverModel) {
            this.roverModel.addEventListener('click', this.onRoverClick);
        }
    },

    createOption: function (label, value, x, y) {
        const option = document.createElement('a-entity');
        option.setAttribute('class', 'interactive rover-quiz-option');
        option.setAttribute('geometry', 'primitive: box; width: 0.55; height: 0.22; depth: 0.03');
        option.setAttribute('material', 'color: #263238');
        option.setAttribute('position', `${x} ${y} 0.02`);
        option.setAttribute('data-value', value);

        const labelEl = document.createElement('a-entity');
        labelEl.setAttribute('position', '0 0 0.02');
        labelEl.setAttribute('text', {
            value: label,
            align: 'center',
            width: 1.4,
            color: '#ffffff'
        });
        option.appendChild(labelEl);

        option.addEventListener('click', (evt) => {
            // Prevent this click from also being treated as a rover click
            evt.stopPropagation();
            const chosen = option.getAttribute('data-value');
            this.handleAnswer(chosen);
        });

        this.panel.appendChild(option);
    },

    onRoverClick: function () {
        const visible = this.panel.getAttribute('visible');
        this.panel.setAttribute('visible', !visible);
    },

    handleAnswer: function (value) {
        const correctValue = '100m';
        const isCorrect = (value === correctValue);

        if (this.questionEl){
            this.questionEl.setAttribute('visible', false);
        }

        const explanation =
            'Sojourner actually drove about 100 meters in total over 83 Martian days (sols).\n' +
            'It spent most of its time stopping to take measurements and send data back to Earth,\n' +
            'rather than driving continuously.\n\n' +
            'Its top speed was only about 0.023 km/h (around 6.39 mm per second),\n' +
            'so covering long distances was impossible for such an early test rover.';

        const newText = (isCorrect
            ? 'Correct! 🎉\n\n' + explanation
            : 'Not quite.\n\n' + explanation
        );

        this.introEl.setAttribute('text', 'value', newText);
    },

    remove: function () {
        if (this.roverModel && this.onRoverClick) {
            this.roverModel.removeEventListener('click', this.onRoverClick);
        }
    }
});

AFRAME.registerComponent('olympus-quiz', {
    init: function () {
        const el = this.el;

        // Keep track of answer buttons so we can remove/hide them later
        this.options = [];

        // --- QUIZ PANEL ---

        const panel = document.createElement('a-entity');
        panel.setAttribute('position', '0 1.5 0');
        panel.setAttribute('rotation', '-15 0 0');
        panel.setAttribute('visible', true);
        this.panel = panel;

        // Background 
        const bg = document.createElement('a-plane');
        bg.setAttribute('width', 2.6);
        bg.setAttribute('height', 1.6);
        bg.setAttribute('material', 'color: #111; opacity: 0.9; side: double;');
        panel.appendChild(bg);

        // Title
        const titleEl = document.createElement('a-entity');
        titleEl.setAttribute('position', '0 0.7 0.01');
        titleEl.setAttribute('text', {
            value: 'Olympus Mons Summit',
            align: 'center',
            width: 2.4,
            color: '#ffd480',
            wrapCount: 30
        });
        panel.appendChild(titleEl);

        // Intro text
        const introEl = document.createElement('a-entity');
        introEl.setAttribute('position', '0 0.25 0.01');
        introEl.setAttribute('text', {
            value:
                'You are standing on Olympus Mons, the largest volcano in the Solar System.\n' +
                'It is a giant shield volcano with very gentle slopes, formed by long-lived\n' +
                'lava flows that piled up over hundreds of millions of years.',
            align: 'left',
            width: 2.3,
            color: '#ffffff',
            wrapCount: 40
        });
        panel.appendChild(introEl);
        this.introEl = introEl;

        // Question text
        const questionEl = document.createElement('a-entity');
        questionEl.setAttribute('position', '0 -0.25 0.01');
        questionEl.setAttribute('text', {
            value: 'About how tall do you think is Olympus Mons compared to Mount Everest?',
            align: 'center',
            width: 2.3,
            color: '#ffffff',
            wrapCount: 36
        });
        panel.appendChild(questionEl);
        this.questionEl = questionEl;

        // Options 
        this.createOption('About the same height', 'same', -0.9, -0.6);
        this.createOption('About 3× higher',       '3x',    0.0, -0.6); // correct
        this.createOption('About half as high',    'half',  0.9, -0.6);

        // Attach the panel to the anchor
        el.appendChild(panel);

        // --- PHOTO PLANE (initially hidden) ---

        const photoPlane = document.createElement('a-plane');
        photoPlane.setAttribute('id', 'olympusPhotoPlane');

        photoPlane.setAttribute('position', '0 3.3 0');  
        photoPlane.setAttribute('width', 3);
        photoPlane.setAttribute('height', 1.8);
        photoPlane.setAttribute('visible', false);
        photoPlane.setAttribute('material', {
            color: '#000000',
            opacity: 0,
            transparent: true,
            side: 'double'
        });

        el.appendChild(photoPlane);
        this.photoPlane = photoPlane;
    },

    createOption: function (label, value, x, y) {
        const option = document.createElement('a-entity');
        option.setAttribute('class', 'interactive olympus-quiz-option');
        option.setAttribute(
            'geometry',
            'primitive: box; width: 0.85; height: 0.25; depth: 0.03'
        );
        option.setAttribute(
            'material',
            'color: #263238; metalness: 0.2; roughness: 0.8;'
        );
        option.setAttribute('position', `${x} ${y} 0.02`);
        option.setAttribute('data-value', value);

        // Label
        const labelEl = document.createElement('a-entity');
        labelEl.setAttribute('position', '0 0 0.02');
        labelEl.setAttribute('text', {
            value: label,
            align: 'center',
            width: 1.8,
            color: '#ffffff'
        });
        option.appendChild(labelEl);

        option.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const chosen = option.getAttribute('data-value');
            this.handleAnswer(chosen);
        });

        this.panel.appendChild(option);

        // Store for later removal
        this.options.push(option);
    },

    handleAnswer: function (value) {
        const correct = '3x';
        const isCorrect = (value === correct);

        const explanation =
            'Olympus Mons is about 22 km tall — roughly 2.5 to 3 times higher\n' +
            'than Mount Everest above sea level. It towers over the surrounding\n' +
            'Martian plains and would completely dwarf any mountain on Earth.';

        const prefix = isCorrect ? 'Correct! 🎉\n\n' : 'Nice try.\n\n';
        const text = prefix + explanation + '\n\nLook up to see an orbital view!';

        //Hide the initial intro text
        if (this.introEl) {
            this.introEl.setAttribute('visible', false);
        }

        // Move the question/explanation text up to where the intro was
        if (this.questionEl) {
            this.questionEl.setAttribute('position', '0 0 0.035'); 
            this.questionEl.setAttribute('text', 'value', text);
        }

        // 3) Remove / hide the answer buttons once an answer is chosen
        if (this.options && this.options.length) {
            this.options.forEach(opt => {
                if (opt.parentNode) {
                    opt.parentNode.removeChild(opt);
                }
            });
            this.options = [];
        }

        this.revealPhoto();
    },

    revealPhoto: function () {
        if (!this.photoPlane) return;

        // Make the plane visible and set the texture
        this.photoPlane.setAttribute('visible', true);
        this.photoPlane.setAttribute('material', {
            src: '#olympusOrbit',
            opacity: 1,
            transparent: true,
            side: 'double',
            color: '#FFFFFF'
        });
    }
});


AFRAME.registerComponent('opportunity-quiz', {
    schema: {
        title: {
            type: 'string',
            default: 'Opportunity – Mars Exploration Rover (2004 to 2018)'
        },
        intro: {
            type: 'string',
            default:
                'Opportunity was one of NASA\'s Mars Exploration Rovers.\n' +
                'It landed in 2004 and far outlived its 90-day design life,\n' +
                'exploring Mars for almost 15 years. It found strong evidence\n' +
                'for past water, including hematite “blueberries” and sulfate-rich rocks.'
        }
    },

    init: function () {
        const el = this.el;

        // Find rover model (the clickable mesh)
        this.roverModel = el.querySelector('[gltf-model]');
        if (this.roverModel) {
            this.roverModel.classList.add('interactive');
        }

        // Grab the floating hint on top of the rover
        this.hintEl = el.querySelector('.rover-hint');
        this.hintHidden = false;

        this.options = [];
        this.panel = null;
        this.playButton = null;

        // Build quiz panel
        this.buildPanel();

        // Clicking the rover toggles panel visibility
        this.onRoverClick = this.onRoverClick.bind(this);
        if (this.roverModel) {
            this.roverModel.addEventListener('click', this.onRoverClick);
        }
    },

    buildPanel: function () {
        const panel = document.createElement('a-entity');
        panel.setAttribute('visible', false);
        panel.setAttribute('position', '-2.67 1.78 1.3');
        panel.setAttribute('rotation', '-15 0 0');
        this.panel = panel;

        // Background
        const bg = document.createElement('a-plane');
        bg.setAttribute('position', '-0.017 0.158 -0.059');
        bg.setAttribute('width', 2.4);
        bg.setAttribute('height', 1.9);
        bg.setAttribute('material', 'color: #111; opacity: 0.9; side: double;');
        panel.appendChild(bg);

        // Title
        const titleEl = document.createElement('a-entity');
        titleEl.setAttribute('position', '0 1.2 0.09');
        titleEl.setAttribute('text', {
            value: this.data.title,
            align: 'center',
            width: 2.3,
            color: '#1b1717ff',
            wrapCount: 32
        });
        panel.appendChild(titleEl);

        // Intro
        const introEl = document.createElement('a-entity');
        introEl.setAttribute('position', '0 0.3 0.01');
        introEl.setAttribute('text', {
            value: this.data.intro,
            align: 'left',
            width: 2.2,
            color: '#ffffff',
            wrapCount: 40
        });
        panel.appendChild(introEl);
        this.introEl = introEl;

        // Question
        const questionEl = document.createElement('a-entity');
        questionEl.setAttribute('position', '0 -0.33 -0.026');
        questionEl.setAttribute('text', {
            value:
                'How did Opportunity reach the Martian surface during landing?',
            align: 'center',
            width: 2.2,
            color: '#ffffff',
            wrapCount: 36
        });
        panel.appendChild(questionEl);
        this.questionEl = questionEl;

        // Answer options (one row of three)
        this.createOption('Airbags + parachute', 'airbags', -1.14, -0.7); // correct
        this.createOption('Sky crane + cables', 'skycrane', -0.06, -0.7);
        this.createOption('Powered landing on legs', 'legs', 0.953, -0.7);

        // Play animation button (initially hidden)
        const playButton = document.createElement('a-entity');
        playButton.setAttribute('visible', false);
        playButton.setAttribute('class', 'interactive');
        playButton.setAttribute(
            'geometry',
            'primitive: box; width: 1.3; height: 0.3; depth: 0.03'
        );
        playButton.setAttribute(
            'material',
            'color: #2e7d32; metalness: 0.2; roughness: 0.6;'
        );
        playButton.setAttribute('position', '0 -1.15 0.02');

        const playLabel = document.createElement('a-entity');
        playLabel.setAttribute('position', '0 0 0.02');
        playLabel.setAttribute('text', {
            value: 'Play deployment animation',
            align: 'center',
            width: 2,
            color: '#ffffff'
        });
        playButton.appendChild(playLabel);

        playButton.addEventListener('click', () => {
            this.playDeploymentAnimation();
        });

        panel.appendChild(playButton);
        this.playButton = playButton;

        // Attach panel to rover root
        this.el.appendChild(panel);
    },

    createOption: function (label, value, x, y) {
        const option = document.createElement('a-entity');
        option.setAttribute('class', 'interactive opportunity-quiz-option');
        option.setAttribute(
            'geometry',
            'primitive: box; width: 0.95; height: 0.25; depth: 0.03'
        );
        option.setAttribute(
            'material',
            'color: #263238; metalness: 0.2; roughness: 0.8;'
        );
        option.setAttribute('position', `${x} ${y} 0.02`);
        option.setAttribute('data-value', value);

        const labelEl = document.createElement('a-entity');
        labelEl.setAttribute('position', '0 0 0.02');
        labelEl.setAttribute('text', {
            value: label,
            align: 'center',
            width: 1.8,
            color: '#ffffff'
        });
        option.appendChild(labelEl);

        option.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const chosen = option.getAttribute('data-value');
            this.handleAnswer(chosen);
        });

        this.panel.appendChild(option);
        this.options.push(option);
    },

    onRoverClick: function () {
        if (!this.panel) return;

        // First click: hide the floating hint forever
        if (!this.hintHidden && this.hintEl) {
            this.hintEl.setAttribute('visible', false);
            this.hintHidden = true;
        }
        const visible = this.panel.getAttribute('visible');
        this.panel.setAttribute('visible', !visible);
    },

    handleAnswer: function (value) {
        const correct = 'airbags';
        const isCorrect = (value === correct);

        const explanation =
            'Opportunity landed using a heat shield, parachute, and large airbags.\n' +
            'The lander hit the atmosphere at high speed, slowed by the parachute,\n' +
            'then bounced and rolled across the Martian surface until it came to rest.\n' +
            'Later rovers like Curiosity and Perseverance used a \"sky crane\" system instead.';

        const prefix = isCorrect ? 'Correct! 🎉\n\n' : 'Nice try.\n\n';
        const text = prefix + explanation + '\n\nYou can now play a deployment animation.';

        if (this.introEl) {
            this.introEl.setAttribute('visible', false);
        }

        if (this.questionEl) {
            this.questionEl.setAttribute('position', '0 0.25 0.01');
            this.questionEl.setAttribute('text', 'value', text);
        }

        // Remove answer buttons
        if (this.options && this.options.length) {
            this.options.forEach(opt => {
                if (opt.parentNode) opt.parentNode.removeChild(opt);
            });
            this.options = [];
        }

        // Show "Play deployment animation" button
        if (this.playButton) {
            this.playButton.setAttribute('visible', true);
        }
    },

    playDeploymentAnimation: function () {
        if (!this.roverModel) return;

        // Start glTF animation once, from the beginning.
        // Requires aframe-extras (which you already include).
        this.roverModel.setAttribute('animation-mixer', {
            clip: '*',
            loop: 'once',
            timeScale: 1,
            clampWhenFinished: true
        });
    },

    remove: function () {
        if (this.roverModel && this.onRoverClick) {
            this.roverModel.removeEventListener('click', this.onRoverClick);
        }
    }
});

AFRAME.registerComponent('opportunity-skin', {
  init: function () {
    const el = this.el;

    // Get the <img> asset that just gives us the path
    const imgEl = document.querySelector('#opportunityTexture');
    if (!imgEl) {
      console.warn('[opportunity-skin] #opportunityTexture not found in DOM');
      return;
    }

    const src = imgEl.getAttribute('src');
    console.log('[opportunity-skin] using texture src:', src);

    const loader = new THREE.TextureLoader();
    this.texture = null;

    // Load texture
    loader.load(
      src,
      (texture) => {
        console.log('[opportunity-skin] texture loaded');
        this.texture = texture;
        this.applyTexture();   // in case model is already loaded
      },
      undefined,
      (err) => console.error('[opportunity-skin] texture load error', err)
    );

    // When the glTF model is ready, apply texture
    el.addEventListener('model-loaded', () => {
      console.log('[opportunity-skin] model-loaded fired');
      this.applyTexture();
    });
  },

  applyTexture: function () {
    if (!this.texture) {
      console.log('[opportunity-skin] applyTexture called but texture not ready yet');
      return;
    }

    const mesh = this.el.getObject3D('mesh');
    if (!mesh) {
      console.log('[opportunity-skin] no mesh found on entity yet');
      return;
    }

    console.log('[opportunity-skin] applying texture to mesh');

    mesh.traverse(node => {
      if (!node.isMesh || !node.material) return;

      // Handle both single and multi-material
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];

      materials.forEach(m => {
        m.map = this.texture;
        m.color.set('#ffffff');   // neutral base color
        m.metalness = 0.2;
        m.roughness = 0.9;
        m.needsUpdate = true;
      });
    });
  }
});

