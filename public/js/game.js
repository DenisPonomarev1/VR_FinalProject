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
        this.turnX = 0;                // -1..1
        this.turnSpeed = THREE.MathUtils.degToRad(120); // 120°/s, tweak as you like

        // walls
        this.walls = [];
        this.refreshWalls();
        this.el.sceneEl.addEventListener('solids-changed', () => this.refreshWalls());



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
        }, 10000); // 10 seconds
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
            basalt: this.el.querySelector('#shelfBasalt'),
            dunite: this.el.querySelector('#shelfDunite'),
            hematite: this.el.querySelector('#shelfHematite')
        };

        // Bind handler
        this.onInventoryChanged = this.onInventoryChanged.bind(this);

        // Listen for inventory changes
        this.el.sceneEl.addEventListener('inventory-changed', this.onInventoryChanged);

        // Initial update (in case anything is already collected)
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

    updateFromInventory: function () {
        if (!this.inventory) return;

        const hasBasalt = this.inventory.has('basalt');
        const hasDunite = this.inventory.has('dunite');
        const hasHematite = this.inventory.has('hematite');

        if (this.slots.basalt) {
            this.slots.basalt.setAttribute('visible', hasBasalt);
        }
        if (this.slots.dunite) {
            this.slots.dunite.setAttribute('visible', hasDunite);
        }
        if (this.slots.hematite) {
            this.slots.hematite.setAttribute('visible', hasHematite);
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
    'Famous rovers include Spirit, Opportunity, Curiosity, Perseverance, and the tiny helicopter Ingenuity.'
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


AFRAME.registerComponent('debug-click-target', {
    init: function () {
        this.el.addEventListener('click', (e) => {
            console.log('[CLICKED]', this.el.id, this.el.className);
        });
    }
});

