// npc-dialogue-system.js
// Mission dialogue system for Commander Astra

// Initialize game state
if (!window.gameState) {
  window.gameState = {
    mission2Started: false,
    mission2Completed: false,
    mission3Started: false,
    mission3Completed: false,
    mission4Started: false,
    mission4Completed: false,
    //mission5Started: false,
    //mission5Completed: false,
    
    // Tracking pour Mission 2
    rocksCollected: 0,
    rocksAnalyzed: 0,
    
    // Tracking pour Mission 3
    roversFound: 0
  };
}

AFRAME.registerComponent('npc-dialogue', {
  schema: {
    npcName: { type: 'string', default: 'Commander Astra' }
  },

  init: function() {
  this.dialoguePanel = null;
  this.currentMission = this.getCurrentMission();
  this.currentPage = 0;  
  this.setupClickListener();
  this.createDialoguePanel();
},

  setupClickListener: function() {
    this.el.classList.add('interactive');
    this.el.addEventListener('click', () => {
      this.showDialogue();
    });
  },

 getCurrentMission: function() {
    const gameState = window.gameState || {};
    
    // Mission 2: Collect & Analyze
    if (!gameState.mission2Started) {
        return 'mission2_intro';
    } 
    else if (gameState.mission2Started && !gameState.mission2Completed) {
        return 'mission2_progress'; // En cours
    }
    else if (gameState.mission2Completed && !gameState.mission3Started) {
        return 'mission3_intro';
    }
    
    // Mission 3: Rovers
    else if (gameState.mission3Started && !gameState.mission3Completed) {
        return 'mission3_progress'; // En cours
    }
    else if (gameState.mission3Completed && !gameState.mission4Started) {
        return 'mission4_intro';
    }
    
    // Mission 4: Olympus Mons
    else if (gameState.mission4Started && !gameState.mission4Completed) {
        return 'mission4_progress'; // En cours
    }
    else if (gameState.mission4Completed) {
        return 'all_complete';
    }
    
    return 'no_mission';
    },

  getMissionDialogue: function(missionKey) {
  const dialogues = {
    'mission2_intro': {
      title: 'Mission 2: Geologist Training',
      pages: [
        {
          type: 'greeting',
          text: 'Greetings, Explorer! I\'m Commander Astra, your mission coordinator here on Mars.'
        },
        {
          type: 'description',
          text: 'Your first task is critical: become a certified Mars geologist. We need you to collect and analyze mineral samples from the Martian surface.'
        },
        {
          type: 'tasks',
          tasks: [
            'This is your task list:',
            'Collect 4 mineral samples (0/4)',
            'Analyze 4 rocks in the laboratory (0/1)'
          ]
        }
      ],
      reward: 'Mars Field Geologist Certificate',
      stateKey: 'mission2Started'
    },
    'mission3_intro': {
      title: 'Mission 3: Rover History',
      pages: [
        {
          type: 'greeting',
          text: 'Excellent work, Geologist! You\'ve proven yourself in the field.'
        },
        {
          type: 'description',
          text: 'Now let\'s explore Mars\' robotic heritage. We have historic rovers scattered across the landscape. Find them and learn their stories.'
        },
        {
          type: 'tasks',
          tasks: [
            'Locate and quiz Sojourner rover (0/1)',
            'Locate and quiz Opportunity rover (0/1)',
            'Locate and quiz Perseverance rover (0/1)'
          ]
        }
      ],
      reward: 'Achievement: Mars Mission Historian',
      stateKey: 'mission3Started'
    },
    'mission4_intro': {
      title: 'Mission 4: Summit Explorer',
      pages: [
        {
          type: 'greeting',
          text: 'Your final challenge awaits, Explorer.'
        },
        {
          type: 'description',
          text: 'Olympus Mons—the largest volcano in our solar system. Reach the summit and prove your mastery of Mars.'
        },
        {
          type: 'tasks',
          tasks: [
            'Travel to Olympus Mons (0/1)',
            'Complete the summit quiz (0/1)'
          ]
        }
      ],
      reward: 'You conquered Olympus Mons!',
      stateKey: 'mission4Started'
    },
    'no_mission': {
      title: 'All Missions Complete',
      pages: [
        {
          type: 'greeting',
          text: 'Outstanding work, Explorer! You\'ve completed all available missions. Mars is proud of you.'
        }
      ],
      tasks: [],
      reward: 'Master Mars Explorer',
      stateKey: null
    },
    'mission2_progress': {
    title: 'Mission 2: In Progress',
    pages: [
        {
            type: 'greeting',
            text: 'Keep up the good work, Explorer! Your geological training is underway.'
        },
        {
            type: 'tasks',
            tasks: [
                'Current progress:',
                'Collect 4 mineral samples (0/4)',
                'Analyze 4 rock in the laboratory (0/4)'
            ]
        }
    ],
    reward: null,
    stateKey: null
},

'mission3_progress': {
    title: 'Mission 3: In Progress',
    pages: [
        {
            type: 'greeting',
            text: 'You\'re doing great! Keep exploring Mars to find those historic rovers.'
        },
        {
            type: 'tasks',
            tasks: [
                'Current progress:',
                'Locate and quiz Sojourner rover (0/1)',
                'Locate and quiz Opportunity rover (0/1)',
                'Locate and quiz Perseverance rover (0/1)'
            ]
        }
    ],
    reward: null,
    stateKey: null
},

'mission4_progress': {
    title: 'Mission 4: In Progress',
    pages: [
        {
            type: 'greeting',
            text: 'The summit of Olympus Mons awaits. You\'re so close!'
        },
        {
            type: 'tasks',
            tasks: [
                'Current progress:',
                'Travel to Olympus Mons (0/1)',
                'Complete the summit quiz (0/1)'
            ]
        }
    ],
    reward: null,
    stateKey: null
},

'all_complete': {
    title: 'Congratulations, Master Explorer!',
    pages: [
        {
            type: 'greeting',
            text: 'You have completed ALL missions on Mars! You are now a certified Master Mars Explorer. The red planet is proud of you, and so am I. Safe travels, Explorer!'
        }
    ],
    reward: 'Master Mars Explorer',
    stateKey: null
}
    
  };

  return dialogues[missionKey] || dialogues['no_mission'];
},

  createDialoguePanel: function() {
    const scene = document.querySelector('a-scene');
    
    // Create dialogue panel entity
    this.dialoguePanel = document.createElement('a-entity');
    this.dialoguePanel.setAttribute('id', 'npcDialoguePanel');
    this.dialoguePanel.setAttribute('visible', 'false');
    
    // Position it near the NPC (offset in front)
    const npcPos = this.el.getAttribute('position');
    this.dialoguePanel.setAttribute('position', {
      x: npcPos.x - 2,
      y: npcPos.y + 1.5,
      z: npcPos.z
    });

    // Background panel
    const background = document.createElement('a-plane');
    background.setAttribute('width', '2.5');
    background.setAttribute('height', '2.0');
    background.setAttribute('color', '#1a1a2e');
    background.setAttribute('opacity', '0.95');
    background.setAttribute('material', 'side: double');
    this.dialoguePanel.appendChild(background);

    // NPC Name header
    const nameHeader = document.createElement('a-entity');
    nameHeader.setAttribute('id', 'npcNameText');
    nameHeader.setAttribute('position', '0 0.2 0.01');
    nameHeader.setAttribute('text', `value: ${this.data.npcName}; align: center; width: 2.2; color: #ffd480; font: https://cdn.aframe.io/fonts/Roboto-msdf.json`);
    this.dialoguePanel.appendChild(nameHeader);

    // Mission title
    const missionTitle = document.createElement('a-entity');
    missionTitle.setAttribute('id', 'npcMissionTitle');
    missionTitle.setAttribute('position', '0 0.1 0.01');
    missionTitle.setAttribute('text', 'value: Mission Title; align: center; width: 2.2; color: #4fa84a; font: https://cdn.aframe.io/fonts/Roboto-msdf.json');
    this.dialoguePanel.appendChild(missionTitle);

    // Dialogue text
    const dialogueText = document.createElement('a-entity');
    dialogueText.setAttribute('id', 'npcDialogueText');
    dialogueText.setAttribute('position', '0 -0.2 0.01');
    dialogueText.setAttribute('text', 'value: Dialogue text here; align: left; width: 2.2; wrapCount: 45; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json');
    this.dialoguePanel.appendChild(dialogueText); 

    // Tasks container
    const tasksContainer = document.createElement('a-entity');
    tasksContainer.setAttribute('id', 'npcTasksList');
    tasksContainer.setAttribute('position', '0 -0.2 0.01');
    this.dialoguePanel.appendChild(tasksContainer);

    // Navigation buttons container
    const buttonsContainer = document.createElement('a-entity');
    buttonsContainer.setAttribute('id', 'npcButtonsContainer');
    buttonsContainer.setAttribute('position', '0 -0.85 0.02');

    // Back button (left)
    const backButton = document.createElement('a-entity');
    backButton.setAttribute('id', 'npcBackButton');
    backButton.setAttribute('class', 'interactive');
    backButton.setAttribute('position', '-0.65 0 0');
    backButton.setAttribute('geometry', 'primitive: box; width: 0.6; height: 0.22; depth: 0.02');
    backButton.setAttribute('material', 'color: #555');
    backButton.setAttribute('visible', 'false');
    backButton.setAttribute('npc-back-button', '');

    const backButtonText = document.createElement('a-entity');
    backButtonText.setAttribute('position', '0 0 0.01');
    backButtonText.setAttribute('text', 'value: ← Back; align: center; width: 1.4; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json');
    backButton.appendChild(backButtonText);
    buttonsContainer.appendChild(backButton);

    // Next button (right)
    const nextButton = document.createElement('a-entity');
    nextButton.setAttribute('id', 'npcNextButton');
    nextButton.setAttribute('class', 'interactive');
    nextButton.setAttribute('position', '0.65 0 0');
    nextButton.setAttribute('geometry', 'primitive: box; width: 0.6; height: 0.22; depth: 0.02');
    nextButton.setAttribute('material', 'color: #0984e3');
    nextButton.setAttribute('npc-next-button', '');

    const nextButtonText = document.createElement('a-entity');
    nextButtonText.setAttribute('position', '0 0 0.01');
    nextButtonText.setAttribute('text', 'value: Next →; align: center; width: 1.4; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json');
    nextButton.appendChild(nextButtonText);
    buttonsContainer.appendChild(nextButton);

    // Accept button (center, hidden initially)
    const acceptButton = document.createElement('a-entity');
    acceptButton.setAttribute('id', 'npcAcceptButton');
    acceptButton.setAttribute('class', 'interactive');
    acceptButton.setAttribute('position', '0.65 0 0');
    acceptButton.setAttribute('geometry', 'primitive: box; width: 1; height: 0.22; depth: 0.02');
    acceptButton.setAttribute('material', 'color: #00b894');
    acceptButton.setAttribute('visible', 'false');
    acceptButton.setAttribute('npc-accept-button', '');

    const acceptButtonText = document.createElement('a-entity');
    acceptButtonText.setAttribute('position', '0 0 0.01');
    acceptButtonText.setAttribute('text', 'value: Accept Mission; align: center; width: 1.8; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json');
    acceptButton.appendChild(acceptButtonText);
    buttonsContainer.appendChild(acceptButton);

    this.dialoguePanel.appendChild(buttonsContainer);  

    

    // Add to scene
    scene.appendChild(this.dialoguePanel);

    // Make panel look at camera
    this.dialoguePanel.setAttribute('rotation', '0 180 0');
  },

  showDialogue: function() {
  this.currentMission = this.getCurrentMission();
  this.currentPage = 0;  // Reset to first page
  const dialogue = this.getMissionDialogue(this.currentMission);
  
  // Store dialogue data
  this.currentDialogue = dialogue;
  
  // Show panel
  this.dialoguePanel.setAttribute('visible', 'true');

  // Hide hint if present
  const hint = this.el.querySelector('#npcHint');
  if (hint) {
    hint.setAttribute('visible', 'false');
  }
  
  // Update content for first page
  this.updateDialoguePage();
  },
  updateDialoguePage: function() {
  if (!this.currentDialogue || !this.currentDialogue.pages) return;
  
  const pages = this.currentDialogue.pages;
  const page = pages[this.currentPage];
  
  // Update title
  const titleEl = this.dialoguePanel.querySelector('#npcMissionTitle');
  titleEl.setAttribute('text', 'value', this.currentDialogue.title);
  
  // Update dialogue text based on page type
  const textEl = this.dialoguePanel.querySelector('#npcDialogueText');
  textEl.setAttribute('text', 'value', page.text || '');
  
  // Update tasks
  const tasksContainer = this.dialoguePanel.querySelector('#npcTasksList');
  while (tasksContainer.firstChild) {
    tasksContainer.removeChild(tasksContainer.firstChild);
  }
  
  if (page.type === 'tasks' && page.tasks) {
    page.tasks.forEach((task, index) => {
      const taskEntity = document.createElement('a-entity');
      taskEntity.setAttribute('position', `0 ${-index * 0.15} 0`);
      
      const updatedTask = this.getUpdatedTaskText(task);
      
      taskEntity.setAttribute('text', `value: • ${updatedTask}; align: left; width: 2.2; color: #cccccc; font: https://cdn.aframe.io/fonts/Roboto-msdf.json`);
      tasksContainer.appendChild(taskEntity);
    });
  }
  
  // Update buttons visibility
  const backButton = this.dialoguePanel.querySelector('#npcBackButton');
  const nextButton = this.dialoguePanel.querySelector('#npcNextButton');
  const acceptButton = this.dialoguePanel.querySelector('#npcAcceptButton');
  
  // Show/hide Back button
  backButton.setAttribute('visible', this.currentPage > 0);
  
  // Show/hide Next button (hide on last page)
  const isLastPage = this.currentPage >= pages.length - 1;
  nextButton.setAttribute('visible', !isLastPage);
  
  // Show Accept button only on last page AND if there's a mission to accept
const hasStateKey = this.currentDialogue.stateKey !== null;
acceptButton.setAttribute('visible', isLastPage && hasStateKey);

if (isLastPage && hasStateKey) {
    acceptButton.classList.add('interactive');
    // Store state key on panel for the button to access
    this.dialoguePanel.setAttribute('data-state-key', this.currentDialogue.stateKey);
} else {
    acceptButton.classList.remove('interactive');
} 

// make the dialogue box dsapear after 6 second
if (isProgressDialogue && isLastPage) {
    setTimeout(() => {
        const panel = document.querySelector('#npcDialoguePanel');
        if (panel && panel.getAttribute('visible') === true) {
            panel.setAttribute('visible', 'false');
        }
    }, 6000); }
    },
    



nextPage: function() {
  if (!this.currentDialogue || !this.currentDialogue.pages) return;
  
  if (this.currentPage < this.currentDialogue.pages.length - 1) {
    this.currentPage++;
    this.updateDialoguePage();
  }
},

previousPage: function() {
  if (this.currentPage > 0) {
    this.currentPage--;
    this.updateDialoguePage();
  }
},
getUpdatedTaskText: function(task) {
  const gameState = window.gameState || {};
  const inventory = this.el.sceneEl.systems['inventory'];
  
  // Update rocks collected count
  if (task.includes('Collect 4 mineral samples')) {
    const collected = gameState.rocksCollected || 0;
    return `Collect 4 mineral samples (${collected}/4)`;
  }
  
  // Update rocks analyzed count  
  if (task.includes('Analyze 4 rock')) {
    const analyzed = gameState.rocksAnalyzed || 0;
    return `Analyze 4 rock in the laboratory (${analyzed}/4)`;
  }
  
  // Update rovers found count
  if (task.includes('Locate and quiz Sojourner')) {
    const done = gameState.sojournerFound ? 1 : 0;
    return `Locate and quiz Sojourner rover (${done}/1)`;
  }
  
  if (task.includes('Locate and quiz Opportunity')) {
    const done = gameState.opportunityFound ? 1 : 0;
    return `Locate and quiz Opportunity rover (${done}/1)`;
  }
  
  if (task.includes('Locate and quiz Perseverance')) {
    const done = gameState.perseveranceFound ? 1 : 0;
    return `Locate and quiz Perseverance rover (${done}/1)`;
  }
  
  return task;
}
});

// Accept button component
AFRAME.registerComponent('npc-accept-button', {
  init: function() {
    this.el.addEventListener('click', () => {
      const panel = this.el.closest('#npcDialoguePanel');
      const stateKey = panel.getAttribute('data-state-key');
      
      // Update game state
      if (stateKey && window.gameState) {
        window.gameState[stateKey] = true;
        console.log(`Mission accepted: ${stateKey}`);
      }

      // Hide dialogue panel
      panel.setAttribute('visible', 'false');

      // Play UI sound
      const soundManager = document.querySelector('[sound-manager]');
      if (soundManager && soundManager.components['sound-manager']) {
        soundManager.components['sound-manager'].playSound('ui');
      }

      // Show notification
      const notificationText = document.querySelector('#notificationText');
      if (notificationText) {
        notificationText.setAttribute('text', 'value', 'Mission accepted!');
        notificationText.setAttribute('visible', 'true');
        setTimeout(() => {
          notificationText.setAttribute('visible', 'false');
        }, 3000);
      }
    });
  }
});

// Next button component
AFRAME.registerComponent('npc-next-button', {
  init: function() {
    this.el.addEventListener('click', () => {
      const panel = this.el.closest('#npcDialoguePanel');
      const npcDialogue = document.querySelector('[npc-dialogue]');
      
      if (npcDialogue && npcDialogue.components['npc-dialogue']) {
        npcDialogue.components['npc-dialogue'].nextPage();
      }

      // Play UI sound
      const soundManager = document.querySelector('[sound-manager]');
      if (soundManager && soundManager.components['sound-manager']) {
        soundManager.components['sound-manager'].playSound('ui');
      }
    });
  }
});

// Back button component
AFRAME.registerComponent('npc-back-button', {
  init: function() {
    this.el.addEventListener('click', () => {
      const panel = this.el.closest('#npcDialoguePanel');
      const npcDialogue = document.querySelector('[npc-dialogue]');
      
      if (npcDialogue && npcDialogue.components['npc-dialogue']) {
        npcDialogue.components['npc-dialogue'].previousPage();
      }

      // Play UI sound
      const soundManager = document.querySelector('[sound-manager]');
      if (soundManager && soundManager.components['sound-manager']) {
        soundManager.components['sound-manager'].playSound('ui');
      }
    });
  }
});
