'use strict';

AFRAME.registerComponent('start-experience', {
  init: function () {
    // Make sure DOM is ready
    window.addEventListener('DOMContentLoaded', () => {
      console.log('scene loaded');

      const loader = document.querySelector('#loading-animation');
      const button = document.querySelector('#user-gesture-button');

      if (loader) loader.style.display = 'none';
      if (button) button.style.display = 'block';
    });
  }
});

// Called when user clicks the "Enter Experience" button
const startExperience = function() {
  const overlay = document.querySelector('#user-gesture-overlay');
  if (overlay) overlay.style.display = 'none';

  // Start all ambient sounds, if any exist
  const ambientSounds = document.querySelectorAll('.ambient-music');
  ambientSounds.forEach(function(soundEntity) {
    const sound = soundEntity.components.sound;
    if (sound && !sound.isPlaying) sound.playSound();
  });
};
