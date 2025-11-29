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

        // 2) Olympus Mons 
        const olympus = document.querySelector('#olympusMons');
        if (olympus) {
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
        const footOffset = 0.0;   // 0.0 turns out o be fine, but keep it in case bugs arise
        pos.y = hitY + footOffset;
    },



    tick(time, deltaMs) {
         // Stop moving if oxygen system says player is "dead"
        const oxy = this.el.sceneEl.systems['oxygen'];
        if (oxy && oxy.isDead) return;

        const dt    = Math.min(0.05, deltaMs / 1000);
        const speed = this.data.speed;
        const pos   = this.el.object3D.position;

        // Apply smooth turn from right stick
        if (this.turnX !== 0) {
        // turn right stick right → rotate rig right 
        this.el.object3D.rotation.y += -this.turnX * this.turnSpeed * dt;
        }

        // Compute movement direction based on rig + head
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

        // left-stick movement
        let joyX = this.joy.x;
        let joyY = this.joy.y;

        
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
    'Basalt is a dark volcanic rock that forms when runny lava cools down.\n' +
    'On Mars, huge lava flows spread out and froze into big basalt plains.\n' +
    'This tells us Mars used to have lots of volcanoes and a very hot inside.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: dark gray to black\n' +
    '- Hardness: about 6 on the Mohs scale (quite hard)\n' +
    '- Texture: fine-grained, with crystals too small to see easily\n' +
    '- Fun fact: much of Earth\'s ocean floor is also made of basalt'
  ),

  dunite: (
    'Dunite is a special rock that is made mostly of one green mineral\n' +
    'called olivine. It usually forms deep inside a planet, where it is\n' +
    'very hot and squeezed by high pressure.\n' +
    'On Mars, finding dunite means we are seeing rocks that may have come\n' +
    'from deep in the planet\'s interior.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: olive green to dark green-brown\n' +
    '- Hardness: about 6.5–7 on the Mohs scale (very hard)\n' +
    '- Texture: chunky or granular, made of lots of olivine crystals\n' +
    '- Special note: mostly (>90%) made of olivine'
  ),

  hematite: (
    'Hematite is an iron mineral that often looks metallic gray or\n' +
    'reddish-brown. When it is crushed into powder, it makes a red streak.\n' +
    'On Mars, some hematite forms when liquid water moves through rocks,\n' +
    'so finding it is a big clue that water once flowed or pooled there.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: shiny metallic gray or rusty red-brown\n' +
    '- Streak: reddish (the color of the powder)\n' +
    '- Hardness: about 5.5–6.5 on the Mohs scale\n' +
    '- Fun fact: hematite is one reason Mars looks like the "Red Planet"'
  ),

  gypsum: (
    'Gypsum is a soft, light-colored mineral made of calcium, sulfur, and water.\n' +
    'On Mars, gypsum often forms when salty water slowly dries up and leaves\n' +
    'its minerals behind. Finding gypsum is a big clue that liquid water once\n' +
    'stayed in that place for a long time.\n\n' +
    'Key physical properties:\n' +
    '- Typical color: white to pale gray, sometimes a bit pink\n' +
    '- Hardness: about 2 on the Mohs scale (very soft)\n' +
    '- Texture: can be powdery, chunky, or in long clear crystals\n' +
    '- Special note: sometimes forms clear crystals called "selenite"'
  )
};



AFRAME.registerSystem('inventory', {
    init: function () {
        this.collected = new Set();
        this.analyzed  = new Set();
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

        // ========== PLAY ROCK COLLECTED SOUND ==========
        if (window.SoundManager) {
            window.SoundManager.playSound('rockScan');
            console.log('[Inventory] 🪨 Rock scan sound played');  // AJOUTE CETTE LIGNE
        }

        // Notify the scene so other components (like the shelf) can react
        if (this.el) {                 // <-- this.el is the <a-scene> for systems
            this.el.emit('inventory-changed', {
                collected: Array.from(this.collected)
            });
        }

        return true;
},

    markAnalyzed: function (id) {
        if (this.analyzed.has(id)) {
            return false; // already counted
        }

        this.analyzed.add(id);

        // Notify listeners (like mission-panel) that analysis progress changed
        if (this.el) {
            this.el.emit('analysis-changed', {
                analyzed: Array.from(this.analyzed)
            });
        }

        return true;
    },

    getAnalyzedCount: function () {
        return this.analyzed.size;
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

AFRAME.registerComponent('mission-panel', {
    init: function () {
        this.inventory = this.el.sceneEl.systems['inventory'];

        // Text entities in the scene
        this.rocksEl       = document.querySelector('#missionRocksText');
        this.analyzeEl     = document.querySelector('#missionAnalyzeText');
        this.roversEl      = document.querySelector('#missionRoversText');
        this.olympusEl     = document.querySelector('#missionOlympusText');

        // Strike-through planes
        this.rocksStrike   = document.querySelector('#missionRocksStrike');
        this.analyzeStrike = document.querySelector('#missionAnalyzeStrike');
        this.roversStrike  = document.querySelector('#missionRoversStrike');
        this.olympusStrike1 = document.querySelector('#missionOlympusStrike1');
        this.olympusStrike2 = document.querySelector('#missionOlympusStrike2'); //doublie lined mission, needs two strike lines

        // How many different minerals & rovers we care about
        this.totalMinerals = 4;
        this.totalRovers   = 3;

        // Local mission state (for non-inventory objectives)
        this.roversFound   = new Set();
        this.olympusDone   = false;

        // Bind handlers so "this" works inside callbacks
        this.updateFromInventory = this.updateFromInventory.bind(this);
        this.onRoverLocated      = this.onRoverLocated.bind(this);
        this.onOlympusComplete   = this.onOlympusComplete.bind(this);

        if (this.el.sceneEl) {
            this.el.sceneEl.addEventListener('inventory-changed', this.updateFromInventory);
            this.el.sceneEl.addEventListener('analysis-changed',  this.updateFromInventory);

            // New events for rover & Olympus missions
            this.el.sceneEl.addEventListener('rover-located',        this.onRoverLocated);
            this.el.sceneEl.addEventListener('olympus-quiz-complete', this.onOlympusComplete);
        }

        // Initial update once everything is ready
        this.updateFromInventory();
    },

    remove: function () {
        if (!this.el.sceneEl) return;

        this.el.sceneEl.removeEventListener('inventory-changed', this.updateFromInventory);
        this.el.sceneEl.removeEventListener('analysis-changed',  this.updateFromInventory);
        this.el.sceneEl.removeEventListener('rover-located',     this.onRoverLocated);
        this.el.sceneEl.removeEventListener('olympus-quiz-complete', this.onOlympusComplete);
    },

    onRoverLocated: function (evt) {
        if (!evt || !evt.detail || !evt.detail.id) return;
        this.roversFound.add(evt.detail.id); // e.g. 'sojourner', 'opportunity', 'perseverance'
        this.updateFromInventory();
    },

    onOlympusComplete: function () {
        this.olympusDone = true;
        this.updateFromInventory();
    },

    updateFromInventory: function () {
        if (!this.inventory) return;

        const collectedCount = this.inventory.collected
            ? this.inventory.collected.size
            : 0;

        const analyzedCount = this.inventory.analyzed
            ? this.inventory.analyzed.size
            : 0;

        const rockMax    = this.totalMinerals;
        const analyzeMax = this.totalMinerals;

        const roversCount = this.roversFound.size;
        const roversMax   = this.totalRovers;

        const colorTodo = '#ffffff';
        const colorDone = '#4caf50';

        // --- Mission 1: Collect all rocks ---
        if (this.rocksEl) {
            const done = collectedCount >= rockMax;
            const label = 'Collect all 4 mineral samples';
            const valueStr = `${label} (${Math.min(collectedCount, rockMax)}/${rockMax})`;

            this.rocksEl.setAttribute('text', 'value', valueStr);
            this.rocksEl.setAttribute('text', 'color', done ? colorDone : colorTodo);

            if (this.rocksStrike) {
                this.rocksStrike.setAttribute('visible', done);
            }
        }

        // --- Mission 2: Analyze minerals ---
        if (this.analyzeEl) {
            const done = analyzedCount >= analyzeMax;
            const label = 'Analyze all 4 mineral samples';
            const valueStr = `${label} (${Math.min(analyzedCount, analyzeMax)}/${analyzeMax})`;

            this.analyzeEl.setAttribute('text', 'value', valueStr);
            this.analyzeEl.setAttribute('text', 'color', done ? colorDone : colorTodo);

            if (this.analyzeStrike) {
                this.analyzeStrike.setAttribute('visible', done);
            }
        }

        // --- Mission 3: Locate all 3 rovers ---
        if (this.roversEl) {
            const done = roversCount >= roversMax;
            const label = 'Locate all 3 Mars rovers';
            const valueStr = `${label} (${Math.min(roversCount, roversMax)}/${roversMax})`;

            this.roversEl.setAttribute('text', 'value', valueStr);
            this.roversEl.setAttribute('text', 'color', done ? colorDone : colorTodo);

            if (this.roversStrike) {
                this.roversStrike.setAttribute('visible', done);
            }
        }

        // --- Mission 4: Climb Olympus Mons + quiz ---
        if (this.olympusEl) {
            const done = this.olympusDone;
            const label = 'Climb Olympus Mons and complete the summit quiz';
            const valueStr = done
                ? `${label} (1/1)`
                : `${label} (0/1)`;

            this.olympusEl.setAttribute('text', 'value', valueStr);
            this.olympusEl.setAttribute('text', 'color', done ? colorDone : colorTodo);

            if (this.olympusStrike1) {
                this.olympusStrike1.setAttribute('visible', done);
            }
            if (this.olympusStrike2) {
                this.olympusStrike2.setAttribute('visible', done);
            }
        }
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
        this.el.addEventListener('toggle-door', () => this.toggleDoor());
        // Emit initial closed state so buttons start with the right label
        this.el.emit('door-state-changed', { open: this.isOpen });
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

        // 🔔 Notify listeners (like buttons) about the new state
        this.el.emit('door-state-changed', { open: this.isOpen });

        // tell fp-controls to rebuild AABBs
        this.el.sceneEl.emit('solids-changed');
    }
});

AFRAME.registerComponent('door-button', {
    schema: {
        target:       { type: 'selector' },   // the hinge entity, e.g. #outerDoorHinge
        pressDistance:{ type: 'number', default: 0.04 }, // how far to press
        pressColor:   { type: 'color',  default: '#777777' },
        baseColor:    { type: 'color',  default: '' }     // optional override
    },

    init: function () {
        // Label (child with text)
        this.labelEl = this.el.querySelector('[text]');

        // Remember original local position (relative to its parent)
        const pos = this.el.object3D.position;
        this.basePos = new THREE.Vector3(pos.x, pos.y, pos.z);

        // Remember original color
        const mat = this.el.getAttribute('material') || {};
        this.baseColor = this.data.baseColor || mat.color || '#00b894';

        this.onClick = this.onClick.bind(this);
        this.onDoorStateChanged = this.onDoorStateChanged.bind(this);

        this.el.addEventListener('click', this.onClick);

        // Listen to door state events from hinge
        if (this.data.target) {
            this.data.target.addEventListener(
                'door-state-changed',
                this.onDoorStateChanged
            );
        }
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
        if (this.data.target) {
            this.data.target.removeEventListener(
                'door-state-changed',
                this.onDoorStateChanged
            );
        }
    },

    onClick: function () {
        if (!this.data.target) return;

        // Toggle the door
        this.data.target.emit('toggle-door');

        // Play visual press effect
        this.playPressEffect();
    },

    playPressEffect: function () {
        const obj = this.el.object3D;

        // Start with local -Z (button "forward"), then rotate by this entity's rotation
        const dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(obj.quaternion);

        // Project onto ground plane so movement is parallel to ground
        dir.y = 0;
        if (dir.lengthSq() === 0) {
            // fallback if somehow dir is vertical
            dir.set(0, 0, -1);
        }
        dir.normalize();

        // Move pressDistance along that horizontal direction
        const offset = dir.clone().multiplyScalar(this.data.pressDistance);
        const pressedPos = this.basePos.clone().add(offset);

        // Apply pressed state
        obj.position.copy(pressedPos);
        this.el.setAttribute('material', 'color', this.data.pressColor);

        // Restore after a short delay
        setTimeout(() => {
            obj.position.copy(this.basePos);
            this.el.setAttribute('material', 'color', this.baseColor);
        }, 120);
    },

    onDoorStateChanged: function (evt) {
        const isOpen = !!(evt && evt.detail && evt.detail.open);
        if (!this.labelEl) return;

        const newLabel = isOpen ? 'CLOSE' : 'OPEN';
        this.labelEl.setAttribute('text', 'value', newLabel);
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

        // Cache question + back button
        this.questionEl   = document.querySelector('#mineralQuestion');
        this.backButtonEl = document.querySelector('#backButton');
        this.analysisEl   = document.querySelector('#analysisText');

        // Reference to the hint text
        this.hintEl = document.querySelector('#labHintText');

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        if (!this.panel) return;

        // Toggle open/close state
        this.isOpen = !this.isOpen;
        this.panel.setAttribute('visible', this.isOpen);

        // Show hint only when the console is CLOSED
        if (this.hintEl) {
            this.hintEl.setAttribute('visible', !this.isOpen);
        }

        // When opening: refresh UI
        if (this.isOpen) {
            // Refresh collected list 
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

AFRAME.registerSystem('score', {
    init: function () {
        this.points = 0;
        this.scoreTextEl = null;

        this.popupTimeout = null;// to clear old timers

        // Try to find the score text after the scene is ready
        this.findScoreText = this.findScoreText.bind(this);
        this.el.addEventListener('loaded', this.findScoreText);
    },

    findScoreText: function () {
        this.scoreTextEl = document.querySelector('#scoreText');
        this.updatePanel();
    },

    add: function (amount) {
        this.points += amount;
        if (this.points < 0) this.points = 0;

        this.updatePanel();

        // Broadcast if anything else wants to react
        this.el.emit('score-changed', { points: this.points });

        //show a popup when we get a point
        if (amount > 0) {
            this.showScorePopup(amount);
        }
    },

    get: function () {
        return this.points;
    },

    updatePanel: function () {
        if (!this.scoreTextEl) return;
        this.scoreTextEl.setAttribute(
            'text',
            'value',
            'Explorer Points: ' + this.points
        );
    },

        showScorePopup: function (amount) {
        const notif = document.querySelector('#notificationText');
        if (!notif) return;

        const label = `+${amount} Explorer Point${amount === 1 ? '' : 's'}!`;

        notif.setAttribute('text', 'value', label);
        notif.setAttribute('visible', true);

        // If an old popup is still fading, cancel it
        if (this.popupTimeout) {
            clearTimeout(this.popupTimeout);
        }

        this.popupTimeout = setTimeout(() => {
            notif.setAttribute('visible', false);
        }, 1200);
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

        // Hide the question, show Back button
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

        // ========== PLAY LAB ANALYSIS SOUND ==========
        if (window.SoundManager) {
            window.SoundManager.playSound('labAnalysis');
        }
        // Emit event for lab-sound component
        this.el.sceneEl.emit('mineral-analyzed');

        if (this._timeout) clearTimeout(this._timeout);

        // Fake 5s analysis, then show result from lookup (or fallback)
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

            // Mark this mineral as analyzed in the inventory system
            if (this.inventory && this.inventory.markAnalyzed) {
                this.inventory.markAnalyzed(id);
            }
        }, 5000); // 5 seconds
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

    // Helper: set opacity on a glTF-based shelf rock
    setSlotOpacity: function (slotEl, opacity) {
        if (!slotEl) return;

        const mesh = slotEl.getObject3D('mesh');
        if (!mesh) {
            // Model might not be loaded yet – wait for it
            slotEl.addEventListener('model-loaded', () => {
                this.setSlotOpacity(slotEl, opacity);
            }, { once: true });
            return;
        }

        mesh.traverse(node => {
            if (!node.isMesh || !node.material) return;

            const materials = Array.isArray(node.material)
                ? node.material
                : [node.material];

            materials.forEach(m => {
                m.transparent = opacity < 1;
                m.opacity = opacity;
                m.needsUpdate = true;
            });
        });
    },

    updateFromInventory: function () {
        if (!this.inventory) return;

        const hasBasalt   = this.inventory.has('basalt');
        const hasDunite   = this.inventory.has('dunite');
        const hasHematite = this.inventory.has('hematite');
        const hasGypsum   = this.inventory.has('gypsum');

        // Before collected: 0.3 opacity
        // After collected:  1.0 opacity
        this.setSlotOpacity(this.slots.basalt,   hasBasalt   ? 1.0 : 0.3);
        this.setSlotOpacity(this.slots.dunite,   hasDunite   ? 1.0 : 0.3);
        this.setSlotOpacity(this.slots.hematite, hasHematite ? 1.0 : 0.3);
        this.setSlotOpacity(this.slots.gypsum,   hasGypsum   ? 1.0 : 0.3);
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

        this.hasReportedLocated = false; // for the mission list
        this.hasAwardedPoint = false;    // for score
        this.options = [];               // 🔹 store answer buttons so we can remove them

        // Access score system
        this.score = this.el.sceneEl.systems['score'];

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
        option.setAttribute(
            'geometry',
            'primitive: box; width: 0.55; height: 0.22; depth: 0.03'
        );
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

        // 🔹 keep track of options so we can remove them later
        this.options.push(option);
    },

    onRoverClick: function () {
        // First time the player opens this panel, count this rover as "located"
        if (!this.hasReportedLocated && this.el.sceneEl) {
            this.hasReportedLocated = true;
            this.el.sceneEl.emit('rover-located', { id: 'sojourner' });
        }

        const visible = this.panel.getAttribute('visible');
        this.panel.setAttribute('visible', !visible);
    },

    handleAnswer: function (value) {
        const correctValue = '100m';
        const isCorrect = (value === correctValue);

        // ========== PLAY QUIZ SOUND ==========
        if (window.SoundManager) {
            if (isCorrect) {
                window.SoundManager.playSound('quizCorrect');
            } else {
                window.SoundManager.playSound('quizWrong');
            }
        }

        if (this.questionEl) {
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

        // 🔹 Remove / hide answer buttons so the quiz can't be redone
        if (this.options && this.options.length) {
            this.options.forEach(opt => {
                if (opt.parentNode) {
                    opt.parentNode.removeChild(opt);
                }
            });
            this.options = [];
        }

        // 🔹 Award 1 point ONLY if the answer is correct, and only once
        if (isCorrect && !this.hasAwardedPoint && this.score && this.score.add) {
            this.score.add(1);       // your score system can show the +1 popup
            this.hasAwardedPoint = true;
        }
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

        this.hasReportedComplete = false; // for mission log
        this.hasAwardedPoint = false;

        // Keep track of answer buttons so we can remove/hide them later
        this.options = [];
        // for the score system
        this.score = this.el.sceneEl.systems['score'];

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
        this.createOption('About 10x higher',    '10x',  0.9, -0.6);

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

        // ========== PLAY QUIZ SOUND ==========
        if (window.SoundManager) {
            if (isCorrect) {
                window.SoundManager.playSound('quizCorrect');
            } else {
                window.SoundManager.playSound('quizWrong');
            }
        }

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

        if (isCorrect && !this.hasAwardedPoint && this.score && this.score.add) {
            this.score.add(1);
            this.hasAwardedPoint = true;
        }

        // Tell the scene that the Olympus mission is complete 
        if (!this.hasReportedComplete && this.el.sceneEl) {
            this.hasReportedComplete = true;
            this.el.sceneEl.emit('olympus-quiz-complete', {});
        }

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
                'Opportunity was a small robot rover that landed on Mars in 2004.\n' +
                'It was only supposed to work for 90 days, but it kept exploring\n' +
                'for almost 15 years! It found strong clues that liquid water used\n' +
                'to flow on Mars, like round “blueberry” rocks made of hematite.'
        }
    },

    init: function () {
        const el = this.el;

        this.hasReportedLocated = false; // for mission log
        this.hasAwardedPoint = false;    // for score

        // Access score system
        this.score = this.el.sceneEl.systems['score'];

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
        bg.setAttribute('position', '-0.017 0.245 -0.059');
        bg.setAttribute('width', 2.4);
        bg.setAttribute('height', 1.9);
        bg.setAttribute('material', 'color: #000000ff; opacity: 0.9; side: double;');
        panel.appendChild(bg);

        // Title
        const titleEl = document.createElement('a-entity');
        titleEl.setAttribute('position', '0 1.3 0.09');
        titleEl.setAttribute('text', {
            value: this.data.title,
            align: 'center',
            width: 2.3,
            color: '#460000ff',
            wrapCount: 32
        });
        panel.appendChild(titleEl);

        // Intro (kid-friendly)
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

        // Question (kid-friendly)
        const questionEl = document.createElement('a-entity');
        questionEl.setAttribute('position', '0 -0.33 -0.026');
        questionEl.setAttribute('text', {
            value:
                'How did Opportunity safely land on the surface of Mars?\n' +
                'Think about how you might protect a toy if you dropped it!',
            align: 'center',
            width: 2.2,
            color: '#ffffff',
            wrapCount: 36
        });
        panel.appendChild(questionEl);
        this.questionEl = questionEl;

        // Answer options (one row of three) – still the same correct one
        this.createOption('Big airbags + a parachute', 'airbags',  -1.14, -0.7); // correct
        this.createOption('Lowered by a sky crane',     'skycrane', -0.06, -0.7);
        this.createOption('Rocket legs like a spaceship', 'legs',    0.953, -0.7);

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
            value: 'Play landing animation',
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

        // Count this rover as located the first time
        if (!this.hasReportedLocated && this.el.sceneEl) {
            this.hasReportedLocated = true;
            this.el.sceneEl.emit('rover-located', { id: 'opportunity' });
        }

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

        if (window.SoundManager) {
            if (isCorrect) {
                window.SoundManager.playSound('quizCorrect');
            } else {
                window.SoundManager.playSound('quizWrong');
            }
        }

        const explanation =
            'To land safely, Opportunity was wrapped in huge air bags.\n' +
            'A parachute helped it slow down in the thin Martian air.\n' +
            'Then the lander hit the ground and bounced and rolled\n' +
            'like a giant padded ball until it finally stopped.\n\n' +
            'Later rovers like Curiosity and Perseverance used a different\n' +
            'system called a “sky crane” instead of bouncing air bags.';

        const prefix = isCorrect ? 'Correct! 🎉\n\n' : 'Nice try.\n\n';
        const text = prefix + explanation + '\n\nYou can now play a landing animation.';

        if (this.introEl) {
            this.introEl.setAttribute('visible', false);
        }

        if (this.questionEl) {
            this.questionEl.setAttribute('position', '0 0.25 0.01');
            this.questionEl.setAttribute('text', 'value', text);
        }

        // Remove answer buttons so the quiz can’t be repeated
        if (this.options && this.options.length) {
            this.options.forEach(opt => {
                if (opt.parentNode) opt.parentNode.removeChild(opt);
            });
            this.options = [];
        }

        // Show "Play landing animation" button
        if (this.playButton) {
            this.playButton.setAttribute('visible', true);
        }

        // Award 1 point the first time the quiz is answered correctly
        if (isCorrect && !this.hasAwardedPoint && this.score && this.score.add) {
            this.score.add(1);
            this.hasAwardedPoint = true;
        }
    },

    playDeploymentAnimation: function () {
        if (!this.roverModel) return;

        // Allow replay: reset/remove any existing animation-mixer and re-add it
        const hasMixer = this.roverModel.getAttribute('animation-mixer');
        if (hasMixer) {
            this.roverModel.removeAttribute('animation-mixer');
        }

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

AFRAME.registerComponent('perseverance-quiz', {
    schema: {
        title: {
            type: 'string',
            default: 'Perseverance – Mars 2020 Rover (since 2021)'
        },
        intro: {
            type: 'string',
            default:
                'Perseverance landed in Jezero Crater (see the spinning model) in 2021.\n' +
                'Long ago, this whole place was filled with water like a lake.\n' +
                'Perseverance is exploring the old lake bottom, studying rocks,\n' +
                'and collecting samples that might one day be brought back to Earth.'
        }
    },

    init: function () {
        const el = this.el;

        this.hasReportedLocated = false;// for mission log

        this.hasAwardedPoint = false;   // NEW

        // Access score system
        this.score = this.el.sceneEl.systems['score'];

        // Find rover model (clickable mesh)
        this.roverModel = el.querySelector('[gltf-model]');
        if (this.roverModel) {
            this.roverModel.classList.add('interactive');
        }

        // Hint above rover
        this.hintEl = el.querySelector('.rover-hint');
        this.hintHidden = false;

        this.options = [];
        this.panel = null;

        this.buildPanel();

        // Clicking rover toggles panel
        this.onRoverClick = this.onRoverClick.bind(this);
        if (this.roverModel) {
            this.roverModel.addEventListener('click', this.onRoverClick);
        }
    },

    buildPanel: function () {
        const panel = document.createElement('a-entity');
        panel.setAttribute('visible', false);
        panel.setAttribute('position', '-2.2 1.7 1.2');
        panel.setAttribute('rotation', '-15 0 0');
        this.panel = panel;

        // Background
        const bg = document.createElement('a-plane');
        bg.setAttribute('width', 2.6);
        bg.setAttribute('height', 1.8);
        bg.setAttribute('material', 'color: #111; opacity: 0.9; side: double;');
        panel.appendChild(bg);

        // Title
        const titleEl = document.createElement('a-entity');
        titleEl.setAttribute('position', '0 1.1 0.01');
        titleEl.setAttribute('text', {
            value: this.data.title,
            align: 'center',
            width: 2.4,
            color: '#8a2309ff',
            wrapCount: 32
        });
        panel.appendChild(titleEl);

        // Intro
        const introEl = document.createElement('a-entity');
        introEl.setAttribute('position', '0.075 0.33 0.17');
        introEl.setAttribute('text', {
            value: this.data.intro,
            align: 'left',
            width: 2.3,
            color: '#ffffff',
            wrapCount: 40
        });
        panel.appendChild(introEl);
        this.introEl = introEl;

        // Question about Jezero + crater walls
        const questionEl = document.createElement('a-entity');
        questionEl.setAttribute('position', '-0.075 -0.32 0.04');
        questionEl.setAttribute('text', {
            value:
                'You are standing on the floor of Jezero Crater.\n' +
                'Long ago, this was the bottom of a lake on Mars.\n' +
                'Look at the crater diameter in the spinning figure .\n' +
                'About how big do you think that ancient lake was in diameter?',
            align: 'center',
            width: 2.3,
            color: '#ffffff',
            wrapCount: 40
        });
        panel.appendChild(questionEl);
        this.questionEl = questionEl;

        // Kid-friendly answers (one correct: 600 m)
        this.createOption('About 25km ', '25km',   -1.0, -0.7);
        this.createOption('About 45km ', '45km', 0.0, -0.7); // correct
        this.createOption('About 85km ', '85km', 1.0, -0.7);

        // --- Mini Jezero Crater model: auto-rotating only ---
        const miniCrater = document.createElement('a-entity');
        miniCrater.setAttribute('gltf-model', '#jezeroCraterGLB');
        miniCrater.setAttribute('position', '1.26 -1.2 1');
        miniCrater.setAttribute('rotation', '0 0 0');   
        miniCrater.setAttribute('scale', '0.01 0.01 0.01');

        // spin
        miniCrater.setAttribute('animation__idle', {
            property: 'rotation',
            from: '0 0 0',
            to:   '0 360 0',
            loop: true,
            dur: 20000,
            easing: 'linear'
        });

        panel.appendChild(miniCrater);
        this.miniCrater = miniCrater;

        this.el.appendChild(panel);
    },

    createOption: function (label, value, x, y) {
        const option = document.createElement('a-entity');
        option.setAttribute('class', 'interactive perseverance-quiz-option');
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

        // First time: mark Perseverance as located
        if (!this.hasReportedLocated && this.el.sceneEl) {
            this.hasReportedLocated = true;
            this.el.sceneEl.emit('rover-located', { id: 'perseverance' });
        }

        // hide hint after first open
        if (!this.hintHidden && this.hintEl) {
            this.hintEl.setAttribute('visible', false);
            this.hintHidden = true;
        }

        const visible = this.panel.getAttribute('visible');
        this.panel.setAttribute('visible', !visible);
    },

    handleAnswer: function (value) {
        const correct = '45km';
        const isCorrect = (value === correct);

        const explanation =
                'The ancient lake inside Jezero Crater was about 45 kilometers wide.\n' +
                'Long ago, rivers flowed into Jezero and filled it with water,\n' +
                'building big muddy deltas on the crater floor.\n' +
                'Today Perseverance is driving on that old lake bottom,\n' +
                'studying the rocks and collecting samples to look for signs\n' +
                'of ancient microscopic life.';

        const prefix = isCorrect ? 'Correct! \n\n' : 'Nice try.\n\n';
        const text = prefix + explanation;

        if (this.introEl) {
            this.introEl.setAttribute('visible', false);
        }

        if (this.questionEl) {
            this.questionEl.setAttribute('position', '0.023 0.193 0.01');
            this.questionEl.setAttribute('text', 'value', text);
        }

        // Remove options after answer
        if (this.options && this.options.length) {
            this.options.forEach(opt => {
                if (opt.parentNode) opt.parentNode.removeChild(opt);
            });
            this.options = [];
        }

    
        const crater = document.querySelector('#jezeroCrater');
        if (crater) {
            crater.emit('highlight-crater'); 
        }

        if (isCorrect && !this.hasAwardedPoint && this.score && this.score.add) {
            this.score.add(1);
            this.hasAwardedPoint = true;
        }

    },

    remove: function () {
        if (this.roverModel && this.onRoverClick) {
            this.roverModel.removeEventListener('click', this.onRoverClick);
        }
    }
});



AFRAME.registerComponent('lab-hint', {
    init: function () {
        // Reference to the hint text entity itself
        this.hintEl = this.el;

        // Reference to the inventory button so we can simulate a click on it
        this.inventoryButton = document.querySelector('#inventoryButton');

        this.onClick = this.onClick.bind(this);
        this.hintEl.addEventListener('click', this.onClick);
    },

    remove: function () {
        if (this.hintEl) {
            this.hintEl.removeEventListener('click', this.onClick);
        }
    },

    onClick: function () {
        // Hide the hint immediately
        this.hintEl.setAttribute('visible', false);

        // Also open the lab console by "clicking" the inventory button
        if (this.inventoryButton) {
            this.inventoryButton.emit('click');
        }
    }
});

AFRAME.registerComponent('shelf-rock-label', {
    schema: {
        rockId: { type: 'string', default: '' }
    },

    init: function () {
        // Get the global inventory system
        this.inventory = this.el.sceneEl.systems['inventory'];

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        // Just show the mineral name in the HUD, no floating label
        if (this.inventory && this.inventory.showNotification) {
            const pretty = this.inventory.prettyName(this.data.rockId);
            const collected = this.inventory.has(this.data.rockId);
            const suffix = collected ? '' : ' (not collected yet)';
            this.inventory.showNotification(pretty + suffix);
        }
    }
});

AFRAME.registerSystem('oxygen', {
    init: function () {
        // Config
        this.maxO2 = 100;
        this.level = this.maxO2;

        // O2 rates (per second)
        this.leakRateBothOpen = 10;   // lose 10 O2 per second when *both* doors are open
        this.regenRateClosed  = 5;    // regain 5 O2 per second when both doors closed
        this.leakRateOneOpen  = 2;   // small leak when only one door is open
        // Warning thresholds (fractions of max)

        this.warnThreshold     = 0.4;  // begin red overlay under 40%
        this.criticalThreshold = 0.2;  // stronger blinking under 20%

        this.innerOpen  = false;
        this.outerOpen  = false;
        this.isDead     = false;

        // HUD elements
        this.barEl     = null;
        this.textEl    = null;
        this.overlayEl = null;

        // Doors
        this.innerDoor = null;
        this.outerDoor = null;

        // Needed for HUD updates (match #oxygenBar in HTML)
        this.baseBarWidth   = 0.76;     
        this.baseBarCenterX = 0.0;    
        this.baseBarLeftX   = this.baseBarCenterX - this.baseBarWidth / 2; 

        this.onDoorStateChanged = this.onDoorStateChanged.bind(this);

        this.el.addEventListener('loaded', () => {
            this.barEl     = document.querySelector('#oxygenBar');
            this.textEl    = document.querySelector('#oxygenText');
            this.overlayEl = document.querySelector('#oxygenWarningOverlay');
            this.barBgEl   = document.querySelector('#oxygenBarBG');

            this.makeHudOverlay(this.barBgEl);
            this.innerDoor = document.querySelector('#innerDoorHinge');
            this.outerDoor = document.querySelector('#outerDoorHinge');
            this.playAgainButtonEl = document.querySelector('#playAgainButton');


            if (this.innerDoor) {
                this.innerDoor.addEventListener('door-state-changed', this.onDoorStateChanged);
            }
            if (this.outerDoor) {
                this.outerDoor.addEventListener('door-state-changed', this.onDoorStateChanged);
            }

            // Make HUD elements ignore depth so they are never hidden by walls
            this.makeHudOverlay(this.barEl);
            this.makeHudOverlay(this.textEl);
            this.makeHudOverlay(this.playAgainButtonEl);


            // Initial HUD sync
            this.updateHUD(0);
        });
    },

    // turn any entity into a "always-on-top" HUD element
    makeHudOverlay: function (el) {
        if (!el) return;

        const apply = () => {
            el.object3D.traverse(node => {
                if (!node.material) return;

                const mats = Array.isArray(node.material)
                    ? node.material
                    : [node.material];

                mats.forEach(m => {
                    m.depthTest = false;
                    m.depthWrite = false;
                    m.transparent = true;
                    m.needsUpdate = true;
                });
            });
        };

        // Apply now (in case mesh already exists)
        apply();
        el.addEventListener('object3dset', apply);
    },

    remove: function () {
        if (this.innerDoor) {
            this.innerDoor.removeEventListener('door-state-changed', this.onDoorStateChanged);
        }
        if (this.outerDoor) {
            this.outerDoor.removeEventListener('door-state-changed', this.onDoorStateChanged);
        }
    },

    onDoorStateChanged: function (evt) {
        if (!evt || !evt.target || !evt.detail) return;
        const open = !!evt.detail.open;
        const id   = evt.target.id;

        if (id === 'innerDoorHinge') {
            this.innerOpen = open;
        } else if (id === 'outerDoorHinge') {
            this.outerOpen = open;
        }
    },

    tick: function (time, deltaMs) {
        if (this.isDead) return;

        const dt = deltaMs / 1000;

        let dO2 = 0;

        // Both open → big leak
        if (this.innerOpen && this.outerOpen) {
            dO2 -= this.leakRateBothOpen * dt;

        // Exactly one open → small leak
        } else if (this.innerOpen !== this.outerOpen) {
            // XOR: true if one is open and the other is closed
            dO2 -= this.leakRateOneOpen * dt;

        // Both closed → regen
        } else if (!this.innerOpen && !this.outerOpen) {
            dO2 += this.regenRateClosed * dt;
        }


        if (dO2 !== 0) {
            this.level += dO2;
            if (this.level > this.maxO2) this.level = this.maxO2;
            if (this.level < 0)         this.level = 0;
        }

        this.updateHUD(time);

        if (this.level <= 0 && !this.isDead) {
            this.handleGameOver();
        }
    },

    updateHUD: function (timeMs) {
        const ratio = this.maxO2 > 0 ? (this.level / this.maxO2) : 0;

        if (this.barEl) {
            const width = Math.max(0.01, this.baseBarWidth * ratio);
            this.barEl.setAttribute('width', width);
            this.barEl.setAttribute('position', {
                x: this.baseBarLeftX + width / 2,
                y: 0,
                z: 0.01
            });

            // Color shift from cyan -> yellow -> red
            let color = '#00e5ff'; // healthy
            if (ratio < this.warnThreshold && ratio >= this.criticalThreshold) {
                color = '#ffdd00'; // warning
            } else if (ratio < this.criticalThreshold) {
                color = '#ff4444'; // critical
            }
            this.barEl.setAttribute('color', color);
        }

        if (this.textEl) {
            const percent = Math.round(ratio * 100);
            this.textEl.setAttribute('text', 'value', 'Hub O2: ' + percent + '%');
        }

        if (this.overlayEl) {
            if (ratio >= this.warnThreshold) {
                this.overlayEl.setAttribute('visible', false);
                this.overlayEl.setAttribute('material', 'opacity', 0);
            } else {
                // Show overlay
                this.overlayEl.setAttribute('visible', true);

                const t = (timeMs || 0) / 1000;
                let baseOpacity;

                if (ratio < this.criticalThreshold) {
                    // Critical: stronger + blinking
                    const severity = (this.criticalThreshold - ratio) / this.criticalThreshold;
                    const blink = 0.5 + 0.5 * Math.sin(t * 6.0);
                    baseOpacity = 0.3 + 0.4 * severity * blink; // up to ~0.7
                } else {
                    // Mild warning: steady subtle red
                    const severity = (this.warnThreshold - ratio) / this.warnThreshold;
                    baseOpacity = 0.15 + 0.25 * severity; // up to ~0.4
                }

                this.overlayEl.setAttribute('material', 'opacity', baseOpacity);
            }
        }
    },

    handleGameOver: function () {
        this.isDead = true;
        this.level  = 0;
        this.updateHUD(0);

        // Show game over text
        const notif = document.querySelector('#notificationText');
        if (notif) {
            notif.setAttribute('text', 'value', 'OXYGEN DEPLETED\nGAME OVER');
            notif.setAttribute('visible', true);
            notif.setAttribute('text', 'color', '#220b0bff');
        }
        // show the play again button
        if (this.playAgainButtonEl) {
        this.playAgainButtonEl.setAttribute('visible', true);
    }

        // Emit an event in case other systems/components care
        this.el.emit('oxygen-depleted');

    }
});

AFRAME.registerComponent('play-again-button', {
  init: function () {
    this.onClick = this.onClick.bind(this);
    this.el.addEventListener('click', this.onClick);
  },

  remove: function () {
    this.el.removeEventListener('click', this.onClick);
  },

  onClick: function () {
    // Reload the whole page to restart everything
    window.location.reload();
  }
});

AFRAME.registerSystem('eva', {
    init: function () {
        // Suit & tank state
        this.hasSuit    = false;
        this.tankMax    = 100;
        this.tank       = this.tankMax;

        // Rates when outside
        this.drainRate        = 0.5;   // how fast the suit O2 drains
        this.refillRate       = 15;  // how fast it refills when inside base
        this.lowThreshold     = 0.3; // 30%
        this.criticalThreshold= 0.1; // 10%

        this.isOutside = false;

        this.rig       = null;
        this.barEl     = null;
        this.textEl    = null;
        this.notifEl   = null;
        this._notifTimeout = null;
        this._warnedLow      = false;
        this._warnedCritical = false;

        this.baseBarWidth   = 0.76;
        this.baseBarCenterX = 0.0;
        this.baseBarLeftX   = this.baseBarCenterX - this.baseBarWidth / 2;

        this.el.addEventListener('loaded', () => {
            this.rig    = document.querySelector('#rig');
            this.barEl  = document.querySelector('#suitOxygenBar');
            this.textEl = document.querySelector('#suitOxygenText');
            this.notifEl = document.querySelector('#notificationText');

            // Make HUD bits always-on-top
            this.makeHudOverlay(this.barEl);
            this.makeHudOverlay(this.textEl);

            this.updateHUD();
        });
    },

    makeHudOverlay: function (el) {
        if (!el) return;
        const apply = () => {
            el.object3D.traverse(node => {
                if (!node.material) return;
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(m => {
                    m.depthTest  = false;
                    m.depthWrite = false;
                    m.transparent = true;
                    m.needsUpdate = true;
                });
            });
        };
        apply();
        el.addEventListener('object3dset', apply);
    },

    showNotification: function (msg) {
        const notif = this.notifEl || document.querySelector('#notificationText');
        if (!notif) return;

        notif.setAttribute('text', 'value', msg);
        notif.setAttribute('visible', true);

        if (this._notifTimeout) clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => {
            notif.setAttribute('visible', false);
        }, 1500);
    },

    // Simple "inside base" check (tweak bounds if needed)
    isInsideBase: function (pos) {
        // Base roughly around x [-5,5], z [-10,5]
        return (pos.x > -5 && pos.x < 5 && pos.z > -10 && pos.z < 5);
    },

    tick: function (time, deltaMs) {
        if (!this.rig) return;

        const dt  = deltaMs / 1000;
        const pos = this.rig.object3D.position;

        const inside = this.isInsideBase(pos);
        this.isOutside = !inside;

        // If wearing suit and outside, drain tank
        if (this.hasSuit && this.isOutside && this.tank > 0) {
            this.tank -= this.drainRate * dt;
            if (this.tank < 0) this.tank = 0;
        }

        // If wearing suit and inside base, slowly refill tank
        if (this.hasSuit && !this.isOutside && this.tank < this.tankMax) {
            this.tank += this.refillRate * dt;
            if (this.tank > this.tankMax) this.tank = this.tankMax;
        }

        // Warnings when outside
        if (this.hasSuit && this.isOutside && this.tankMax > 0) {
            const ratio = this.tank / this.tankMax;
            if (!this._warnedLow && ratio <= this.lowThreshold && ratio > this.criticalThreshold) {
                this.showNotification('Suit O2 low – head back to base!');
                this._warnedLow = true;
            }
            if (!this._warnedCritical && ratio <= this.criticalThreshold) {
                this.showNotification('Suit O2 CRITICAL! Return to base NOW!');
                this._warnedCritical = true;
            }
        }

        // If tank hits zero outside → reuse hub oxygen game-over
        if (this.hasSuit && this.isOutside && this.tank <= 0) {
            const oxy = this.el.systems['oxygen'];
            if (oxy && !oxy.isDead && typeof oxy.handleGameOver === 'function') {
                oxy.handleGameOver();
            }
        }

        this.updateHUD();
    },

    updateHUD: function () {
        if (!this.barEl || !this.textEl) return;

        // Only visible when wearing the suit
        this.barEl.setAttribute('visible', this.hasSuit);
        this.textEl.setAttribute('visible', this.hasSuit);

        const ratio = this.tankMax > 0 ? (this.tank / this.tankMax) : 0;
        const width = Math.max(0.01, this.baseBarWidth * ratio);

        this.barEl.setAttribute('width', width);
        this.barEl.setAttribute('position', {
            x: this.baseBarLeftX + width / 2,
            y: 0,
            z: 0.01
        });

        let color = '#00ff9d'; // healthy
        if (ratio <= this.lowThreshold && ratio > this.criticalThreshold) {
            color = '#ffdd00'; // warning
        } else if (ratio <= this.criticalThreshold) {
            color = '#ff4444'; // critical
        }
        this.barEl.setAttribute('color', color);

        const percent = Math.round(ratio * 100);
        const label = this.hasSuit
            ? ('Suit O2: ' + percent + '%')
            : 'Suit off';
        this.textEl.setAttribute('text', 'value', label);
    },

    putOnSuit: function () {
        this.hasSuit = true;
        this.tank    = this.tankMax;
        this._warnedLow = false;
        this._warnedCritical = false;
        this.showNotification('Suit on – ready to explore Mars!');
        this.updateHUD();
    },

    removeSuit: function () {
        this.hasSuit = false;
        this.showNotification('Suit removed – breathing base air only.');
        this.updateHUD();
    },

    refillTank: function () {
        this.tank = this.tankMax;
        this._warnedLow = false;
        this._warnedCritical = false;
        this.showNotification('Suit tank refilled.');
        this.updateHUD();
    }
});

AFRAME.registerComponent('eva-suit-station', {
    init: function () {
        this.eva = this.el.sceneEl.systems['eva'];
        this.labelEl = this.el.querySelector('[text]');
        this.updateLabel = this.updateLabel.bind(this);

        this.onClick = this.onClick.bind(this);
        this.el.addEventListener('click', this.onClick);
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
    },

    onClick: function () {
        if (!this.eva) return;

        // If no suit yet → put it on
        if (!this.eva.hasSuit) {
            this.eva.putOnSuit();
        } else {
            // Suit already on; if we are "inside", refill, else just warn
            const rig = document.querySelector('#rig');
            if (rig) {
                const pos = rig.object3D.position;
                const inside = this.eva.isInsideBase(pos);
                if (!inside) {
                    this.eva.showNotification('You must be inside the base to change tanks.');
                    return;
                }
            }

            if (this.eva.tank < this.eva.tankMax) {
                this.eva.refillTank();
            } else {
                this.eva.removeSuit();
            }
        }

        this.updateLabel();
    },

    updateLabel: function () {
        if (!this.labelEl || !this.eva) return;

        let txt;
        if (!this.eva.hasSuit) {
            txt = 'Put suit on';
        } else if (this.eva.tank < this.eva.tankMax) {
            txt = 'Refill tank';
        } else {
            txt = 'Remove suit';
        }

        this.labelEl.setAttribute('text', 'value', txt);
    }
});



