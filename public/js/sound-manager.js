// ========================================
// SOUND MANAGER - Phase 1 Implementation
// ========================================
// This file manages all audio for the Mars VR experience
// Created by: Hannievora's team
// Date: 2025-11-27

AFRAME.registerComponent('sound-manager', {
  init: function() {
    console.log('[Sound Manager] Initializing...');
    
    // Store references to all sound entities
    this.sounds = {};
    
    // Create sound entities dynamically
    this.createSoundEntity('ambientWind', 'sounds/427401__imjeax__desert-ambient-loop.wav', true, 20);
    this.createSoundEntity('doorOpen', 'sounds/468937__timothyd4y__closet-doorknob-turn.wav', false, 2);
    this.createSoundEntity('footstep', 'sounds/477394__nuff3__steps-dirt_3b.ogg', false, 5);
    this.createSoundEntity('rockScan', 'sounds/735168__irolan__item-pickup-chime.wav', false, 4);
    this.createSoundEntity('uiClick', 'sounds/677861__el_boss__ui-button-click.wav', false, 2);
    
    this.createSoundEntity('quizCorrect', 'sounds/456162__bwg2020__correct-2.wav', false, 1.5);
    this.createSoundEntity('quizWrong', 'sounds/720893__baggonotes__incorrect_buzz.wav', false, 3);
    this.createSoundEntity('labAnalysis', 'sounds/340959__aceofspadesproduc100__scanning-sound.wav', false, 0.5);
    this.createSoundEntity('baseAmbience', 'sounds/524951__burning-mir__space-ambient-v02.wav', true, 0.2);

    this.createSoundEntity('missionComplete', 'sounds/433700__dersuperanton__mission-completed-deep-voice.wav', false, 10);
    this.createSoundEntity('roverIdle', 'sounds/353263__thespiderwriter__droid-hum.mp3', true, 10);


    console.log('[Sound Manager] ✅ All sounds loaded!');
    
    // Make sound manager globally accessible
    window.SoundManager = this;

    // Start ambient sounds after scene loads
    this.el.sceneEl.addEventListener('loaded', () => {
      setTimeout(() => {
        this.playSound('ambientWind');
        this.playSound('baseAmbience');
        console.log('[Sound Manager] 🌬️ Ambient sounds started');
      }, 1000);
    });
  },
  
  createSoundEntity: function(name, src, loop, volume) {
    const soundEl = document.createElement('a-entity');
    soundEl.setAttribute('sound', {
      src: src,
      autoplay: loop,
      loop: loop,
      volume: volume
    });
    
    // Attach to the scene
    this.el.sceneEl.appendChild(soundEl);
    
    // Store reference
    this.sounds[name] = soundEl;
    
    console.log(`[Sound Manager] Created sound: ${name}`);
  },
  
  // ========================================
  // PUBLIC METHODS - Call these from game.js
  // ========================================
  
  playSound: function(soundName) {
    if (this.sounds[soundName]) {
      const soundComponent = this.sounds[soundName].components.sound;
      if (soundComponent) {
        soundComponent.stopSound(); // Stop if already playing
        soundComponent.playSound();
        console.log(`[Sound Manager] 🔊 Playing: ${soundName}`);
      }
    } else {
      console.warn(`[Sound Manager] ⚠️ Sound not found: ${soundName}`);
    }
  },
  
  stopSound: function(soundName) {
    if (this.sounds[soundName]) {
      const soundComponent = this.sounds[soundName].components.sound;
      if (soundComponent) {
        soundComponent.stopSound();
        console.log(`[Sound Manager] 🔇 Stopped: ${soundName}`);
      }
    }
  },
  
  setVolume: function(soundName, volume) {
    if (this.sounds[soundName]) {
      this.sounds[soundName].setAttribute('sound', 'volume', volume);
      console.log(`[Sound Manager] 🔉 Volume set for ${soundName}: ${volume}`);
    }
  }
});

// ========================================
// ZONE-BASED AUDIO - Volume changes by zone
// ========================================
AFRAME.registerComponent('audio-zone-controller', {
  init: function() {
    this.rig = document.querySelector('#rig');
    this.insideBase = true;
  },
  
  tick: function() {
    if (!this.rig || !window.SoundManager) return;
    
    const pos = this.rig.object3D.position;
    
    // Inside base = between walls (x: -5 to 5, z: -14 to 5)
    const nowInside = (pos.x > -5 && pos.x < 5 && pos.z > -14 && pos.z < 5);
    
    if (nowInside !== this.insideBase) {
      this.insideBase = nowInside;
      
      if (nowInside) {
        // Inside: wind quieter, base ambience louder
        window.SoundManager.setVolume('ambientWind', 0.3);
        window.SoundManager.setVolume('baseAmbience', 0.5);
        console.log('[Audio Zone] 🏠 Inside base');
      } else {
        // Outside: wind louder, base ambience quieter
        window.SoundManager.setVolume('ambientWind', 20);
        window.SoundManager.setVolume('baseAmbience', 0.05);
        console.log('[Audio Zone] 🌍 Outside base');
      }
    }
  }
});

// ========================================
// FOOTSTEP COMPONENT - Automatic footsteps
// ========================================
AFRAME.registerComponent('footstep-sound', {
  schema: {
    interval: { type: 'number', default: 500 }
  },
  
  init: function() {
    this.lastStepTime = 0;
    this.fpControls = null;
    this.wasMoving = false;
    
    this.el.sceneEl.addEventListener('loaded', () => {
      const rig = document.querySelector('#rig');
      if (rig) {
        this.fpControls = rig.components['fp-controls'];
      }
    });
  },
  
  tick: function(time, deltaTime) {
    if (!this.fpControls || !window.SoundManager) return;
    
    const keys = this.fpControls.keys;
    const joy = this.fpControls.joy;
    
    const isMoving = 
      keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] ||
      keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] ||
      Math.abs(joy.x) > 0.1 || Math.abs(joy.y) > 0.1;
    
    if (isMoving) {
      if (time - this.lastStepTime > this.data.interval) {
        window.SoundManager.playSound('footstep');
        this.lastStepTime = time;
      }
    }
    
    this.wasMoving = isMoving;
  }
});

// ========================================
// DOOR SOUND COMPONENT - Plays on door open
// ========================================
AFRAME.registerComponent('door-sound', {
  init: function() {
    this.el.addEventListener('toggle-door', () => {
      if (window.SoundManager) {
        window.SoundManager.playSound('doorOpen');
        console.log('[Sound Manager] 🚪 Door opened!');
      }
    });
  }
});

// ========================================
// UI CLICK SOUND - For all interactive elements
// ========================================
AFRAME.registerComponent('ui-sound', {
  init: function() {
    this.el.addEventListener('click', () => {
      if (window.SoundManager) {
        window.SoundManager.playSound('uiClick');
      }
    });
  }
});

console.log('[Sound Manager] 🎵 sound-manager.js loaded successfully!');

// ========================================
// 3D SPATIAL AUDIO - Positional sounds
// ========================================
AFRAME.registerComponent('spatial-sound', {
  schema: {
    src: { type: 'string' },
    loop: { type: 'boolean', default: false },
    volume: { type: 'number', default: 0.5 },
    refDistance: { type: 'number', default: 2 },
    maxDistance: { type: 'number', default: 10 },
    rolloffFactor: { type: 'number', default: 1 }
  },
  
  init: function() {
    this.el.setAttribute('sound', {
      src: this.data.src,
      loop: this.data.loop,
      volume: this.data.volume,
      positional: true,
      refDistance: this.data.refDistance,
      maxDistance: this.data.maxDistance,
      rolloffFactor: this.data.rolloffFactor
    });
  }
});