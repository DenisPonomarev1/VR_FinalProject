// DEBUG VERSION --- First-person controls with simple wall collisions
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
            // already had it
            this.showNotification('Already collected: ' + this.prettyName(id));
            return false;
        }
        this.collected.add(id);
        this.updatePanel();
        this.showNotification('Collected: ' + this.prettyName(id) + ' rock');
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

        this.el.addEventListener('click', () => this.toggleDoor());
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

        // Refresh the collected list when opening
        if (this.isOpen && this.inventory && this.inventory.updatePanel) {
            this.inventory.updatePanel();

            const analysisEl = document.querySelector('#analysisText');
            if (analysisEl) {
                analysisEl.setAttribute(
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

        // If collected, start "analysis"
        if (this.analysisEl) {
            this.analysisEl.setAttribute(
                'text',
                'value',
                'Analyzing ' + pretty + ' sample...'
            );
        }

        if (this._timeout) clearTimeout(this._timeout);

        // Fake 10s analysis, then show placeholder result
        this._timeout = setTimeout(() => {
            if (!this.analysisEl) return;
            this.analysisEl.setAttribute(
                'text',
                'value',
                pretty + ' analysis: Analysis text (placeholder).'
            );
        }, 10000); // 10 seconds
    }
});


