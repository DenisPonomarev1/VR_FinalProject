(function initGameState () {
  if (!window.gameState) {
    window.gameState = {};
  }
  const gs = window.gameState;

  // Mission flags
  if (typeof gs.mission0Started === 'undefined') gs.mission0Started = false;

  if (typeof gs.mission1Started === 'undefined') gs.mission1Started = false;
  if (typeof gs.mission1Completed === 'undefined') gs.mission1Completed = false;

  if (typeof gs.mission2Started === 'undefined') gs.mission2Started = false;
  if (typeof gs.mission2Completed === 'undefined') gs.mission2Completed = false;

  if (typeof gs.mission3Started === 'undefined') gs.mission3Started = false;
  if (typeof gs.mission3Completed === 'undefined') gs.mission3Completed = false;

  if (typeof gs.mission4Started === 'undefined') gs.mission4Started = false;
  if (typeof gs.mission4Completed === 'undefined') gs.mission4Completed = false;

  if (typeof gs.mission5Started === 'undefined') gs.mission5Started = false;
  if (typeof gs.mission5Completed === 'undefined') gs.mission5Completed = false;
  if (typeof gs.quizQuestionsAnswered === 'undefined') gs.quizQuestionsAnswered = 0;
  if (typeof gs.finalQuizScore === 'undefined') gs.finalQuizScore = 0;

  // Mission 2 progress
  if (typeof gs.rocksCollected === 'undefined') gs.rocksCollected = 0;
  if (typeof gs.rocksAnalyzed === 'undefined') gs.rocksAnalyzed = 0;

  // Mission 3 progress (rovers)
  if (typeof gs.roversFound === 'undefined') gs.roversFound = 0;
  if (typeof gs.sojournerFound === 'undefined') gs.sojournerFound = false;
  if (typeof gs.opportunityFound === 'undefined') gs.opportunityFound = false;
  if (typeof gs.perseveranceFound === 'undefined') gs.perseveranceFound = false;

  // Mission 4 progress (Olympus)
  if (typeof gs.olympusReached === 'undefined') gs.olympusReached = false;
  if (typeof gs.olympusQuizCompleted === 'undefined') gs.olympusQuizCompleted = false;
})();

// -------- Main NPC component --------
AFRAME.registerComponent('npc-dialogue', {
  schema: {
    npcName:      { type: 'string', default: 'Commander Astra' },
    playerSelector: { type: 'string', default: '#rig' },
    maxDistance:  { type: 'number', default: 4 } // metres
  },

  init: function () {
    this.dialoguePanel = null;
    this.currentMission = null;
    this.currentDialogue = null;
    this.currentPage = 0;

    this.player = document.querySelector(this.data.playerSelector);

    this.setupClickListener();
    this.createDialoguePanel();

    // Bind mission completion handlers
    this.onMission1Complete = this.onMission1Complete.bind(this);
    this.onMission2Complete = this.onMission2Complete.bind(this);
    this.onMission3Complete = this.onMission3Complete.bind(this);
    this.onMission4Complete = this.onMission4Complete.bind(this);
    this.onMission5Complete = this.onMission5Complete.bind(this);

    if (this.el.sceneEl) {
      const scene = this.el.sceneEl;
      scene.addEventListener('mission1-complete', this.onMission1Complete);
      scene.addEventListener('mission2-complete', this.onMission2Complete);
      scene.addEventListener('mission3-complete', this.onMission3Complete);
      scene.addEventListener('mission4-complete', this.onMission4Complete);
      scene.addEventListener('mission5-complete', this.onMission5Complete);
    }
  },

  remove: function () {
    if (this.el.sceneEl) {
      const scene = this.el.sceneEl;
      scene.removeEventListener('mission1-complete', this.onMission1Complete);
      scene.removeEventListener('mission2-complete', this.onMission2Complete);
      scene.removeEventListener('mission3-complete', this.onMission3Complete);
      scene.removeEventListener('mission4-complete', this.onMission4Complete);
      scene.removeEventListener('mission5-complete', this.onMission5Complete);
    }
  },

  // ---------- CLICK SETUP ----------
  setupClickListener: function () {
    // Make NPC clickable with raycaster
    this.el.classList.add('interactive');

    this.el.addEventListener('click', () => {
      if (!this.dialoguePanel) return;

      const isOpen = !!this.dialoguePanel.getAttribute('visible');

      // If panel is already open → close it
      if (isOpen) {
        this.hideDialogue();
        return;
      }

      // Otherwise, we're trying to OPEN it → check distance first
      if (this.player) {
        const npcPos = new THREE.Vector3();
        const playerPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(npcPos);
        this.player.object3D.getWorldPosition(playerPos);
        const dist = npcPos.distanceTo(playerPos);
        if (dist > this.data.maxDistance) {
          // Too far: ignore click
          return;
        }
      }

      // Close → open
      this.showDialogue();
    });
  },

  // ---------- MISSION FLOW LOGIC ----------
  getCurrentMission: function () {
    const gs = window.gameState || {};

    // Mission 0 — airlock safety (tutorial, only once)
    if (!gs.mission0Started) {
      return 'mission0_intro';
    }

    // Mission 1 — suit up
    if (!gs.mission1Started) {
      return 'mission1_intro';
    }
    if (gs.mission1Started && !gs.mission1Completed) {
      return 'mission1_progress';
    }

    // Mission 2 — geology
    if (!gs.mission2Started) {
      return 'mission2_intro';
    }
    if (gs.mission2Started && !gs.mission2Completed) {
      return 'mission2_progress';
    }

    // Mission 3 — rovers
    if (gs.mission2Completed && !gs.mission3Started) {
      return 'mission3_intro';
    }
    if (gs.mission3Started && !gs.mission3Completed) {
      return 'mission3_progress';
    }

    // Mission 4 — Olympus Mons
    if (gs.mission3Completed && !gs.mission4Started) {
      return 'mission4_intro';
    }
    if (gs.mission4Started && !gs.mission4Completed) {
      return 'mission4_progress';
    }

    //Mission 5 — Final Quiz (after completing Mission 4)
    if (gs.mission4Completed && !gs.mission5Started) {
      return 'mission5_intro';
    }
    if (gs.mission5Started && !gs.mission5Completed) {
      return 'mission5_progress';
    }

    // All missions complete (including quiz)
    if (gs.mission5Completed) {
      return 'all_complete';
    }

    return 'no_mission';
  },

  getMissionDialogue: function (missionKey) {
    const dialogues = {
      // ---------- Mission 0 ----------
      mission0_intro: {
        title: 'Mission 0: Airlock Safety',
        pages: [
          {
            type: 'greeting',
            text:
              'Welcome to Mars, Astronaut!\n' +
              'I am Commander Astra, your mission coordinator.'
          },
          {
            type: 'description',
            text:
              'Before we do anything else, you must understand the airlock.\n\n' +
              'If ONE door is open, the hub slowly loses oxygen.\n' +
              'If BOTH doors are open, you lose oxygen VERY quickly.\n' +
              'If Hub O₂ reaches 0%, you fail the mission.'
          },
          {
            type: 'tasks',
            text: 'Remember these rules:',
            tasks: [
              'Keep at least one airlock door CLOSED at all times.',
              'Watch your Hub O2 bar on the HUD.',
              'Practice opening and closing doors safely.'
            ]
          }
        ],
        reward: 'Airlock safety cleared.',
        stateKey: 'mission0Started' 
      },

      // ---------- Mission 1 ----------
      mission1_intro: {
        title: 'Mission 1: Suit Up',
        pages: [
          {
            type: 'greeting',
            text:
              'Time to get ready for EVA, Explorer.'
          },
          {
            type: 'description',
            text:
              'Go to the EVA Suit Station and put on your spacesuit:\n\n' +
              '• Suit on\n' +
              '• Helmet closed\n' +
              '• Oxygen line connected\n\n' +
              'The system will detect when you are fully equipped.'
          },
          {
            type: 'tasks',
            text: 'Checklist:',
            tasks: [
              'Use the EVA Suit Station.',
              'Suit fully equipped (0/1)'
            ]
          }
        ],
        reward: 'EVA Ready certification',
        stateKey: 'mission1Started'
      },

      mission1_progress: {
        title: 'Mission 1: In Progress',
        pages: [
          {
            type: 'greeting',
            text:
              'You are still on Mission 1 — SUIT UP.'
          },
          {
            type: 'tasks',
            text: 'Current status:',
            tasks: [
              'Use the EVA Suit Station.',
              'Suit fully equipped (0/1)'
            ]
          }
        ],
        reward: null,
        stateKey: null
      },

      // ---------- Mission 2 ----------
      mission2_intro: {
        title: 'Mission 2: Geologist Training',
        pages: [
          {
            type: 'greeting',
            text:
              'Excellent. With your suit ready, we can begin field work.'
          },
          {
            type: 'description',
            text:
              'Your task: become a certified Mars geologist.\n' +
              'Collect and analyze mineral samples from the Martian surface.'
          },
          {
            type: 'tasks',
            text: 'Objectives:',
            tasks: [
              'Collect 4 mineral samples (0/4)',
              'Analyze 4 rocks in the laboratory (0/4)'
            ]
          }
        ],
        reward: 'Mars Field Geologist Certificate',
        stateKey: 'mission2Started'
      },

      mission2_progress: {
        title: 'Mission 2: In Progress',
        pages: [
          {
            type: 'greeting',
            text:
              'Your geological training is underway. Keep going!'
          },
          {
            type: 'tasks',
            text: 'Current progress:',
            tasks: [
              'Collect 4 mineral samples (0/4)',
              'Analyze 4 rocks in the laboratory (0/4)'
            ]
          }
        ],
        reward: null,
        stateKey: null
      },

      // ---------- Mission 3 ----------
      mission3_intro: {
        title: 'Mission 3: Rover History',
        pages: [
          {
            type: 'greeting',
            text:
              'Great work, Geologist! You handled Mars rock like a pro.'
          },
          {
            type: 'description',
            text:
              'Next, explore Mars\' robotic heritage.\n' +
              'We have historic rovers scattered across the landscape. ' +
              'Find them and complete their quizzes.'
          },
          {
            type: 'tasks',
            text: 'Targets:',
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

      mission3_progress: {
        title: 'Mission 3: In Progress',
        pages: [
          {
            type: 'greeting',
            text:
              'You\'re doing well. Keep tracking those rovers!'
          },
          {
            type: 'tasks',
            text: 'Current progress:',
            tasks: [
              'Locate and quiz Sojourner rover (0/1)',
              'Locate and quiz Opportunity rover (0/1)',
              'Locate and quiz Perseverance rover (0/1)'
            ]
          }
        ],
        reward: null,
        stateKey: null
      },

      // ---------- Mission 4 ----------
      mission4_intro: {
        title: 'Mission 4: Summit Explorer',
        pages: [
          {
            type: 'greeting',
            text:
              'Your final challenge awaits, Explorer.'
          },
          {
            type: 'description',
            text:
              'Olympus Mons — the largest volcano in the solar system.\n' +
              'Reach the summit zone and complete the summit quiz.'
          },
          {
            type: 'tasks',
            text: 'Objectives:',
            tasks: [
              'Travel to Olympus Mons (0/1)',
              'Complete the summit quiz (0/1)'
            ]
          }
        ],
        reward: 'You conquered Olympus Mons!',
        stateKey: 'mission4Started'
      },

      mission4_progress: {
        title: 'Mission 4: In Progress',
        pages: [
          {
            type: 'greeting',
            text:
              'The summit of Olympus Mons is close. Keep moving!'
          },
          {
            type: 'tasks',
            text: 'Current progress:',
            tasks: [
              'Travel to Olympus Mons (0/1)',
              'Complete the summit quiz (0/1)'
            ]
          }
        ],
        reward: null,
        stateKey: null
      },

      mission5_intro: {
      title: 'Mission 5: Final Review Quiz',
      pages: [
        {
          type: 'greeting',
          text:
            'Congratulations on reaching Olympus Mons!\n' +
            'Now it\'s time for your final evaluation.'
        },
        {
          type: 'description',
          text:
            'This quiz will test everything you\'ve learned:\n\n' +
            '• Airlock safety procedures\n' +
            '• EVA suit protocols\n' +
            '• Martian geology\n' +
            '• Rover history\n' +
            '• Mars geography'
        },
        {
          type: 'tasks',
          text: 'Quiz Rules:',
          tasks: [
            'Answer 6 review questions',
            'Earn points for correct answers',
            'Complete to earn your final certification'
          ]
        }
      ],
      reward: 'Master Mars Explorer Certificate',
      stateKey: 'mission5Started'
    },

    mission5_progress: {
      title: 'Mission 5: Review Quiz',
      pages: [
        {
          type: 'greeting',
          text:
            'Complete the final review quiz to finish your training.'
        },
        {
          type: 'tasks',
          text: 'Current status:',
          tasks: [
            'Answer 6 review questions (0/6)'
          ]
        }
      ],
      reward: null,
      stateKey: null
    },



      // ---------- All complete / no mission ----------
      all_complete: {
        title: 'Congratulations, Master Explorer!',
        pages: [
          {
            type: 'greeting',
            text:
              'You have completed ALL missions on Mars!\n' +
              'You passed the final review quiz with flying colors.\n\n' +
              'You are now a certified Master Mars Explorer.\n' +
              'The red planet is proud of you, and so am I. Safe travels!'
          }
        ],
        reward: 'Master Mars Explorer',
        stateKey: null
      },

      no_mission: {
        title: 'All Missions Complete',
        pages: [
          {
            type: 'greeting',
            text:
              'There are no active missions at the moment.\n' +
              'Feel free to explore the base and the landscape!'
          }
        ],
        reward: null,
        stateKey: null
      }
    };

    return dialogues[missionKey] || dialogues['no_mission'];
  },

  // ---------- Panel creation ----------
  createDialoguePanel: function () {
    const scene = this.el.sceneEl || document.querySelector('a-scene');

    this.dialoguePanel = document.createElement('a-entity');
    this.dialoguePanel.setAttribute('id', 'npcDialoguePanel');
    this.dialoguePanel.setAttribute('visible', 'false');
    this.dialoguePanel.setAttribute('position', '-2.7 1.2 4.4');
    this.dialoguePanel.setAttribute('scale', '0.8 0.8 0.8')

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
    nameHeader.setAttribute('position', '0 0.8 0.01');
    nameHeader.setAttribute(
      'text',
      `value: ${this.data.npcName}; align: center; width: 2.2; color: #ffd480; font: https://cdn.aframe.io/fonts/Roboto-msdf.json`
    );
    this.dialoguePanel.appendChild(nameHeader);

    // Mission title
    const missionTitle = document.createElement('a-entity');
    missionTitle.setAttribute('id', 'npcMissionTitle');
    missionTitle.setAttribute('position', '0 0.55 0.01');
    missionTitle.setAttribute(
      'text',
      'value: Mission Title; align: center; width: 2.2; color: #4fa84a; font: https://cdn.aframe.io/fonts/Roboto-msdf.json'
    );
    this.dialoguePanel.appendChild(missionTitle);

    // Dialogue text
    const dialogueText = document.createElement('a-entity');
    dialogueText.setAttribute('id', 'npcDialogueText');
    dialogueText.setAttribute('position', '0 0.15 0.01');
    dialogueText.setAttribute(
      'text',
      'value: Dialogue text here; align: left; width: 2.2; wrapCount: 45; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json'
    );
    this.dialoguePanel.appendChild(dialogueText);

    // Tasks container
    const tasksContainer = document.createElement('a-entity');
    tasksContainer.setAttribute('id', 'npcTasksList');
    tasksContainer.setAttribute('position', '0 -0.25 0.01');
    this.dialoguePanel.appendChild(tasksContainer);

    // Navigation buttons container
    const buttonsContainer = document.createElement('a-entity');
    buttonsContainer.setAttribute('id', 'npcButtonsContainer');
    buttonsContainer.setAttribute('position', '0 -0.85 0.02');

    // Back button (left)
    const backButton = document.createElement('a-entity');
    backButton.setAttribute('id', 'npcBackButton');
    backButton.setAttribute('class', 'interactive');
    backButton.setAttribute('ui-sound', '');
    backButton.setAttribute('position', '-0.65 0 0');
    backButton.setAttribute(
      'geometry',
      'primitive: box; width: 0.6; height: 0.22; depth: 0.02'
    );
    backButton.setAttribute('material', 'color: #555');
    backButton.setAttribute('visible', 'false');
    backButton.setAttribute('npc-back-button', '');

    const backButtonText = document.createElement('a-entity');
    backButtonText.setAttribute('position', '0 0 0.01');
    backButtonText.setAttribute(
      'text',
      'value: ← Back; align: center; width: 1.4; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json'
    );
    backButton.appendChild(backButtonText);
    buttonsContainer.appendChild(backButton);

    // Next button (right)
    const nextButton = document.createElement('a-entity');
    nextButton.setAttribute('id', 'npcNextButton');
    nextButton.setAttribute('class', 'interactive');
    nextButton.setAttribute('ui-sound', '');
    nextButton.setAttribute('position', '0.65 0 0');
    nextButton.setAttribute(
      'geometry',
      'primitive: box; width: 0.6; height: 0.22; depth: 0.02'
    );
    nextButton.setAttribute('material', 'color: #0984e3');
    nextButton.setAttribute('npc-next-button', '');

    const nextButtonText = document.createElement('a-entity');
    nextButtonText.setAttribute('position', '0 0 0.01');
    nextButtonText.setAttribute(
      'text',
      'value: Next →; align: center; width: 1.4; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json'
    );
    nextButton.appendChild(nextButtonText);
    buttonsContainer.appendChild(nextButton);

    // Accept button (center, hidden initially)
    const acceptButton = document.createElement('a-entity');
    acceptButton.setAttribute('id', 'npcAcceptButton');
    acceptButton.setAttribute('class', 'interactive');
    acceptButton.setAttribute('ui-sound', '');
    acceptButton.setAttribute('position', '0.34 0 0');
    acceptButton.setAttribute(
      'geometry',
      'primitive: box; width: 1; height: 0.22; depth: 0.02'
    );
    acceptButton.setAttribute('material', 'color: #00b894');
    acceptButton.setAttribute('visible', 'false');
    acceptButton.setAttribute('npc-accept-button', '');

    const acceptButtonText = document.createElement('a-entity');
    acceptButtonText.setAttribute('position', '0 0 0.01');
    acceptButtonText.setAttribute(
      'text',
      'value: Accept Mission; align: center; width: 1.8; color: #ffffff; font: https://cdn.aframe.io/fonts/Roboto-msdf.json'
    );
    acceptButton.appendChild(acceptButtonText);
    buttonsContainer.appendChild(acceptButton);

    this.dialoguePanel.appendChild(buttonsContainer);

    // Add panel to scene & face into the room
    scene.appendChild(this.dialoguePanel);
    this.dialoguePanel.setAttribute('rotation', '0 180 0');
  },

  // ---------- Hide dialogue ----------
  hideDialogue: function () {
    if (!this.dialoguePanel) return;
    this.dialoguePanel.setAttribute('visible', 'false');
  },


  // ---------- Show dialogue ----------
  showDialogue: function () {
    this.currentMission = this.getCurrentMission();
    this.currentPage = 0;

    this.currentDialogue = this.getMissionDialogue(this.currentMission);
    if (!this.currentDialogue) return;

    this.dialoguePanel.setAttribute('visible', 'true');

    // Hide floating hint if present
    const hint = this.el.querySelector('#npcHint');
    if (hint) {
      hint.setAttribute('visible', 'false');
    }

    this.updateDialoguePage();
  },

  // ---------- Update page content ----------
  updateDialoguePage: function () {
    if (!this.currentDialogue || !this.currentDialogue.pages) return;

    const pages = this.currentDialogue.pages;
    const page = pages[this.currentPage];

    // Title
    const titleEl = this.dialoguePanel.querySelector('#npcMissionTitle');
    titleEl.setAttribute('text', 'value', this.currentDialogue.title);

    // Main dialogue text
    const textEl = this.dialoguePanel.querySelector('#npcDialogueText');
    textEl.setAttribute('text', 'value', page.text || '');

    // Tasks
    const tasksContainer = this.dialoguePanel.querySelector('#npcTasksList');
    while (tasksContainer.firstChild) {
      tasksContainer.removeChild(tasksContainer.firstChild);
    }

    if (page.type === 'tasks' && page.tasks) {
      page.tasks.forEach((task, index) => {
        const taskEntity = document.createElement('a-entity');
        taskEntity.setAttribute('position', `0 ${-index * 0.15} 0`);

        const updatedTask = this.getUpdatedTaskText(task);

        taskEntity.setAttribute(
          'text',
          `value: • ${updatedTask}; align: left; width: 2.2; color: #cccccc; font: https://cdn.aframe.io/fonts/Roboto-msdf.json`
        );
        tasksContainer.appendChild(taskEntity);
      });
    }

    // Buttons
    const backButton   = this.dialoguePanel.querySelector('#npcBackButton');
    const nextButton   = this.dialoguePanel.querySelector('#npcNextButton');
    const acceptButton = this.dialoguePanel.querySelector('#npcAcceptButton');

    const isFirstPage = this.currentPage === 0;
    const isLastPage  = this.currentPage >= pages.length - 1;
    const hasStateKey = this.currentDialogue.stateKey !== null;

    backButton.setAttribute('visible', !isFirstPage);
    nextButton.setAttribute('visible', !isLastPage);

    acceptButton.setAttribute('visible', isLastPage && hasStateKey);
    if (isLastPage && hasStateKey) {
      acceptButton.classList.add('interactive');
      this.dialoguePanel.setAttribute('data-state-key', this.currentDialogue.stateKey);
      this.dialoguePanel.setAttribute('data-mission-key', this.currentMission);
    } else {
      acceptButton.classList.remove('interactive');
      this.dialoguePanel.removeAttribute('data-state-key');
      this.dialoguePanel.removeAttribute('data-mission-key');
    }

    // Auto-hide for simple "progress" messages after a few seconds
    const isProgressDialogue =
      this.currentMission && this.currentMission.endsWith('_progress');

    if (isProgressDialogue && isLastPage) {
      setTimeout(() => {
        if (this.dialoguePanel &&
            this.dialoguePanel.getAttribute('visible') === true) {
          this.dialoguePanel.setAttribute('visible', 'false');
        }
      }, 6000);
    }
  },

  nextPage: function () {
    if (!this.currentDialogue || !this.currentDialogue.pages) return;
    if (this.currentPage < this.currentDialogue.pages.length - 1) {
      this.currentPage++;
      this.updateDialoguePage();
    }
  },

  previousPage: function () {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.updateDialoguePage();
    }
  },

  // ---------- Dynamic task text ----------
  getUpdatedTaskText: function (task) {
    const gs = window.gameState || {};

    // Mission 1 — suit
    if (task.includes('Suit fully equipped')) {
      const done = gs.mission1Completed ? 1 : 0;
      return `Suit fully equipped (${done}/1)`;
    }

    // Mission 2 — rocks
    if (task.includes('Collect 4 mineral samples')) {
      const collected = gs.rocksCollected || 0;
      return `Collect 4 mineral samples (${collected}/4)`;
    }

    if (task.includes('Analyze 4 rocks')) {
      const analyzed = gs.rocksAnalyzed || 0;
      return `Analyze 4 rocks in the laboratory (${analyzed}/4)`;
    }

    // Mission 3 — rovers
    if (task.includes('Locate and quiz Sojourner')) {
      const done = gs.sojournerFound ? 1 : 0;
      return `Locate and quiz Sojourner rover (${done}/1)`;
    }

    if (task.includes('Locate and quiz Opportunity')) {
      const done = gs.opportunityFound ? 1 : 0;
      return `Locate and quiz Opportunity rover (${done}/1)`;
    }

    if (task.includes('Locate and quiz Perseverance')) {
      const done = gs.perseveranceFound ? 1 : 0;
      return `Locate and quiz Perseverance rover (${done}/1)`;
    }

    // Mission 4 — Olympus
    if (task.includes('Travel to Olympus Mons')) {
      const done = gs.olympusReached ? 1 : 0;
      return `Travel to Olympus Mons (${done}/1)`;
    }

    if (task.includes('Complete the summit quiz')) {
      const done = gs.olympusQuizCompleted ? 1 : 0;
      return `Complete the summit quiz (${done}/1)`;
    }

      // Mission 5 — quiz questions
    if (task.includes('Answer 6 review questions')) {
      const answered = gs.quizQuestionsAnswered || 0;
      return `Answer 6 review questions (${answered}/6)`;
    }

    return task;
  },

  // ---------- Mission completion event handlers ----------
  onMission1Complete: function () {
    const gs = window.gameState || {};
    gs.mission1Completed = true;
  },

  onMission2Complete: function () {
    const gs = window.gameState || {};
    gs.mission2Completed = true;
  },

  onMission3Complete: function () {
    const gs = window.gameState || {};
    gs.mission3Completed = true;
  },

  onMission4Complete: function () {
    const gs = window.gameState || {};
    gs.mission4Completed = true;
  },

  onMission5Complete: function () {
    const gs = window.gameState || {};
    gs.mission5Completed = true;
  },
});

// ---------- Accept button ----------
AFRAME.registerComponent('npc-accept-button', {
  init: function () {
    this.el.addEventListener('click', () => {
      const panel = this.el.closest('#npcDialoguePanel');
      if (!panel) return;

      const stateKey    = panel.getAttribute('data-state-key');
      const missionKey  = panel.getAttribute('data-mission-key');

      const gs = window.gameState || {};

      if (stateKey && gs) {
        gs[stateKey] = true;

        // Special case: Mission 0 is just tutorial, mark it as "done" on accept
        if (missionKey === 'mission0_intro') {
          gs.mission0Started = true;
        }
      }

      // 🆕 Broadcast a mission-started event like "mission2-started"
      if (missionKey && this.el.sceneEl) {
        const parts = missionKey.split('_'); 
        if (parts.length > 0) {
          const missionId = parts[0];       
          this.el.sceneEl.emit(missionId + '-started', { id: missionId });

          // Special handling for Mission 5 - emit accepted event
          if (missionId === 'mission5') {
            this.el.sceneEl.emit('mission5-accepted', {});
          }
        }
      }

      // Hide panel
      panel.setAttribute('visible', 'false');

      // Play UI sound
      const soundManager = document.querySelector('[sound-manager]');
      if (
        soundManager &&
        soundManager.components['sound-manager']
      ) {
        soundManager.components['sound-manager'].playSound('ui');
      }

      // HUD notification
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

// ---------- Next button ----------
AFRAME.registerComponent('npc-next-button', {
  init: function () {
    this.el.addEventListener('click', () => {
      const npcDialogueEl = document.querySelector('[npc-dialogue]');
      if (npcDialogueEl && npcDialogueEl.components['npc-dialogue']) {
        npcDialogueEl.components['npc-dialogue'].nextPage();
      }

      const soundManager = document.querySelector('[sound-manager]');
      if (
        soundManager &&
        soundManager.components['sound-manager']
      ) {
        soundManager.components['sound-manager'].playSound('ui');
      }
    });
  }
});

// ---------- Back button ----------
AFRAME.registerComponent('npc-back-button', {
  init: function () {
    this.el.addEventListener('click', () => {
      const npcDialogueEl = document.querySelector('[npc-dialogue]');
      if (npcDialogueEl && npcDialogueEl.components['npc-dialogue']) {
        npcDialogueEl.components['npc-dialogue'].previousPage();
      }

      const soundManager = document.querySelector('[sound-manager]');
      if (
        soundManager &&
        soundManager.components['sound-manager']
      ) {
        soundManager.components['sound-manager'].playSound('ui');
      }
    });
  }
});
