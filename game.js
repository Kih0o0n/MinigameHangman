(() => {
      'use strict';

      const CONFIG = Object.freeze({
        version: 'v0.2.1',
        gameHeavenUrl: 'https://kih0o0n.github.io/DDingboGameHeaven/',
        maxWrong: 7,
        recentWordMemory: 5,
        balloonPopOrder: [6, 5, 4, 0, 1, 2, 3],
        clearDelayMs: 400,
        gameOverDelayMs: 800,
        keyboardRows: ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ']
      });

      const refs = {};
      const state = {
        screen: 'start',
        currentEntry: null,
        guessedLetters: new Set(),
        correctLetters: new Set(),
        wrongLetters: new Set(),
        hintLetters: new Set(),
        remainingBalloons: CONFIG.maxWrong,
        poppedBalloons: 0,
        hintUsed: false,
        revealAnswer: false,
        recentWords: [],
        acceptingInput: false,
        lastWord: null,
        resultTimer: null,
        moodTimer: null
      };

      const wordLibrary = normalizeWordLibrary(window.WORD_LIBRARY);

      const sound = {
        enabled: localStorage.getItem('balloonHangmanSound') !== 'off',
        ctx: null,
        unlock() {
          if (!this.enabled) return;
          if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.ctx = new AudioContext();
          }
          if (this.ctx.state === 'suspended') this.ctx.resume();
        },
        tone(freq, duration = 0.08, type = 'sine', gainValue = 0.045, startDelay = 0) {
          if (!this.enabled) return;
          this.unlock();
          if (!this.ctx) return;
          const now = this.ctx.currentTime + startDelay;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
          osc.connect(gain).connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + duration + 0.02);
        },
        tap() { this.tone(420, 0.045, 'triangle', 0.035); },
        correct() {
          this.tone(620, 0.08, 'sine', 0.075);
          this.tone(820, 0.09, 'sine', 0.065, 0.055);
        },
        pop() {
          if (!this.enabled) return;
          this.unlock();
          if (!this.ctx) return;
          const now = this.ctx.currentTime;
          const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.7);
          }
          const noise = this.ctx.createBufferSource();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1250, now);
          filter.Q.setValueAtTime(0.85, now);
          gain.gain.setValueAtTime(0.42, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
          noise.buffer = buffer;
          noise.connect(filter).connect(gain).connect(this.ctx.destination);
          noise.start(now);
          noise.stop(now + 0.13);

          const snap = this.ctx.createOscillator();
          const snapGain = this.ctx.createGain();
          snap.type = 'square';
          snap.frequency.setValueAtTime(180, now);
          snap.frequency.exponentialRampToValueAtTime(92, now + 0.08);
          snapGain.gain.setValueAtTime(0.09, now);
          snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
          snap.connect(snapGain).connect(this.ctx.destination);
          snap.start(now);
          snap.stop(now + 0.1);
        },
        success() {
          [523, 659, 784, 1046].forEach((freq, idx) => this.tone(freq, 0.10, 'triangle', 0.075, idx * 0.06));
        },
        fail() {
          if (!this.enabled) return;
          this.unlock();
          if (!this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(360, now);
          osc.frequency.exponentialRampToValueAtTime(90, now + 0.45);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
          osc.connect(gain).connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.5);
        }
      };

      document.addEventListener('DOMContentLoaded', init);

      function init() {
        refs.app = document.getElementById('app');
        refs.startScreen = document.getElementById('startScreen');
        refs.playScreen = document.getElementById('playScreen');
        refs.resultOverlay = document.getElementById('resultOverlay');
        refs.startMascot = document.getElementById('startMascot');
        refs.characterActor = document.getElementById('characterActor');
        refs.skyArea = document.getElementById('skyArea');
        refs.balloonCluster = document.getElementById('balloonCluster');
        refs.stringBundle = document.getElementById('stringBundle');
        refs.balloonCount = document.getElementById('balloonCount');
        refs.wordSlots = document.getElementById('wordSlots');
        refs.messageBox = document.getElementById('messageBox');
        refs.keyboard = document.getElementById('keyboard');
        refs.hintBtn = document.getElementById('hintBtn');
        refs.hintStatus = document.getElementById('hintStatus');
        refs.resultTitle = document.getElementById('resultTitle');
        refs.resultNote = document.getElementById('resultNote');
        refs.answerWord = document.getElementById('answerWord');
        refs.answerMeaning = document.getElementById('answerMeaning');
        refs.resultBalloons = document.getElementById('resultBalloons');
        refs.soundToggle = document.getElementById('soundToggle');
        refs.startHeavenLink = document.getElementById('startHeavenLink');
        refs.resultHeavenLink = document.getElementById('resultHeavenLink');
        refs.versionText = document.getElementById('versionText');

        refs.versionText.textContent = CONFIG.version;
        refs.startMascot.innerHTML = getCharacterSvg();
        refs.characterActor.innerHTML = getCharacterSvg();

        buildKeyboard();
        updateSoundToggle();

        document.getElementById('startBtn').addEventListener('click', () => {
          sound.unlock();
          sound.tap();
          if (wordLibrary.length === 0) {
            setStartDescriptionError();
            return;
          }
          startGame();
        });
        document.getElementById('backToStartBtn').addEventListener('click', () => {
          sound.tap();
          showStartScreen();
        });
        document.getElementById('againBtn').addEventListener('click', () => {
          sound.tap();
          startGame();
        });
        document.getElementById('resultStartBtn').addEventListener('click', () => {
          sound.tap();
          showStartScreen();
        });
        refs.soundToggle.addEventListener('click', () => {
          sound.enabled = !sound.enabled;
          localStorage.setItem('balloonHangmanSound', sound.enabled ? 'on' : 'off');
          updateSoundToggle();
          if (sound.enabled) {
            sound.unlock();
            sound.correct();
          }
        });

        refs.startHeavenLink.addEventListener('click', goToGameHeaven);
        refs.resultHeavenLink.addEventListener('click', goToGameHeaven);

        refs.hintBtn.addEventListener('click', handleHintChance);

        document.addEventListener('keydown', event => {
          if (!state.acceptingInput || state.screen !== 'playing') return;
          const letter = event.key.toUpperCase();
          if (/^[A-Z]$/.test(letter)) handleGuess(letter);
        });

        showStartScreen();
      }

      function normalizeWordLibrary(rawLibrary) {
        if (!Array.isArray(rawLibrary)) return [];
        const seen = new Set();
        return rawLibrary
          .map(entry => ({
            word: String(entry.word || '').trim().toUpperCase(),
            meaning: String(entry.meaning || '').trim()
          }))
          .filter(entry => {
            if (!/^[A-Z]{5,9}$/.test(entry.word)) return false;
            if (!entry.meaning) return false;
            if (seen.has(entry.word)) return false;
            seen.add(entry.word);
            return true;
          });
      }

      function setStartDescriptionError() {
        const description = document.querySelector('.startDescription');
        description.innerHTML = 'words.js 단어 라이브러리를<br>먼저 확인해 주세요!';
      }

      function updateSoundToggle() {
        refs.soundToggle.textContent = sound.enabled ? '🔊 효과음 ON' : '🔇 효과음 OFF';
        refs.soundToggle.setAttribute('aria-pressed', String(sound.enabled));
      }

      function goToGameHeaven() {
        sound.unlock();
        sound.tap();
        window.location.href = CONFIG.gameHeavenUrl;
      }

      function showStartScreen() {
        clearTimers();
        state.screen = 'start';
        state.acceptingInput = false;
        refs.startScreen.classList.remove('hidden');
        refs.playScreen.classList.add('hidden');
        refs.resultOverlay.classList.add('hidden');
        refs.skyArea.classList.remove('falling');
        setMood(refs.startMascot, 'idle');
        updateHintButton();
      }

      function startGame() {
        clearTimers();
        state.screen = 'playing';
        state.currentEntry = pickWord();
        rememberRecentWord(state.currentEntry.word);
        state.guessedLetters = new Set();
        state.correctLetters = new Set();
        state.wrongLetters = new Set();
        state.hintLetters = new Set();
        state.remainingBalloons = CONFIG.maxWrong;
        state.poppedBalloons = 0;
        state.hintUsed = false;
        state.revealAnswer = false;
        state.acceptingInput = true;
        state.lastWord = state.currentEntry.word;

        refs.startScreen.classList.add('hidden');
        refs.playScreen.classList.remove('hidden');
        refs.resultOverlay.classList.add('hidden');
        refs.skyArea.classList.remove('falling');
        refs.characterActor.innerHTML = getCharacterSvg();
        setMood(refs.characterActor, 'idle');

        renderBalloons();
        renderStrings();
        renderWordSlots();
        renderKeyboard();
        renderBalloonCount();
        updateHintButton();
        setMessage('알파벳을 골라보세요!');
      }

      function clearTimers() {
        if (state.resultTimer) clearTimeout(state.resultTimer);
        if (state.moodTimer) clearTimeout(state.moodTimer);
        state.resultTimer = null;
        state.moodTimer = null;
      }

      function pickWord() {
        const recentSet = new Set(state.recentWords);
        let pool = wordLibrary.filter(entry => !recentSet.has(entry.word));
        if (pool.length === 0) pool = wordLibrary;
        return pool[Math.floor(Math.random() * pool.length)];
      }

      function rememberRecentWord(word) {
        state.recentWords = state.recentWords.filter(item => item !== word);
        state.recentWords.push(word);
        while (state.recentWords.length > CONFIG.recentWordMemory) {
          state.recentWords.shift();
        }
      }

      function buildKeyboard() {
        refs.keyboard.innerHTML = '';
        CONFIG.keyboardRows.forEach(rowText => {
          const row = document.createElement('div');
          row.className = `keyboardRow row${rowText.length}`;
          rowText.split('').forEach(letter => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'key';
            button.textContent = letter;
            button.dataset.letter = letter;
            button.setAttribute('aria-label', `${letter} 선택`);
            button.addEventListener('click', () => handleGuess(letter));
            row.appendChild(button);
          });
          refs.keyboard.appendChild(row);
        });
      }

      function handleGuess(letter) {
        if (!state.acceptingInput || state.guessedLetters.has(letter)) return;
        sound.unlock();
        state.guessedLetters.add(letter);

        if (state.currentEntry.word.includes(letter)) {
          state.correctLetters.add(letter);
          sound.correct();
          setMessage(randomPick(['좋아요!', '맞았어요!', 'NICE!', 'GOOD!']));
          setMood(refs.characterActor, 'correct');
          renderWordSlots();
          renderKeyboard();
          updateHintButton();

          if (isWordComplete()) {
            state.acceptingInput = false;
            setMood(refs.characterActor, 'clear');
            sound.success();
            state.resultTimer = setTimeout(() => showResult('clear'), CONFIG.clearDelayMs);
          } else {
            queueMoodIdle(560);
          }
          return;
        }

        state.wrongLetters.add(letter);
        state.remainingBalloons = Math.max(0, state.remainingBalloons - 1);
        sound.pop();
        popNextBalloon();
        renderKeyboard();
        renderBalloonCount();
        updateHintButton();

        if (state.remainingBalloons <= 0) {
          state.acceptingInput = false;
          setMessage('앗! 마지막 풍선이 터졌어요!');
          refs.skyArea.classList.add('falling');
          setMood(refs.characterActor, 'falling');
          state.revealAnswer = true;
          renderWordSlots();
          sound.fail();
          state.resultTimer = setTimeout(() => showResult('gameover'), CONFIG.gameOverDelayMs);
        } else {
          setMessage(randomPick(['Oops!', '풍선 하나가 터졌어요!', '다시 골라보세요!']));
          setMood(refs.characterActor, 'wrong');
          queueMoodIdle(520);
        }
      }

      function handleHintChance() {
        if (!state.acceptingInput || state.hintUsed) return;
        if (state.remainingBalloons <= 1) {
          setMessage('풍선이 부족해요!');
          updateHintButton();
          return;
        }

        const letter = pickLeastHelpfulHiddenLetter();
        if (!letter) return;

        sound.unlock();
        state.hintUsed = true;
        state.guessedLetters.add(letter);
        state.correctLetters.add(letter);
        state.hintLetters.add(letter);
        state.remainingBalloons = Math.max(0, state.remainingBalloons - 1);

        sound.pop();
        popNextBalloon();
        renderWordSlots();
        renderKeyboard();
        renderBalloonCount();
        updateHintButton();
        setMessage(`풍선 찬스로 ${letter} 공개!`);
        setMood(refs.characterActor, 'wrong');

        if (isWordComplete()) {
          state.acceptingInput = false;
          setMood(refs.characterActor, 'clear');
          sound.success();
          state.resultTimer = setTimeout(() => showResult('clear'), CONFIG.clearDelayMs);
        } else {
          queueMoodIdle(620);
        }
      }

      function pickLeastHelpfulHiddenLetter() {
        const word = state.currentEntry.word;
        const counts = new Map();
        for (const letter of word) {
          if (!state.correctLetters.has(letter)) {
            counts.set(letter, (counts.get(letter) || 0) + 1);
          }
        }
        const entries = [...counts.entries()];
        if (entries.length === 0) return '';
        const minCount = Math.min(...entries.map(([, count]) => count));
        const candidates = entries.filter(([, count]) => count === minCount).map(([letter]) => letter);
        return randomPick(candidates);
      }

      function updateHintButton() {
        if (!refs.hintBtn || !refs.hintStatus) return;
        const hasHiddenLetters = state.currentEntry && [...new Set(state.currentEntry.word.split(''))].some(letter => !state.correctLetters.has(letter));
        const canUse = state.screen === 'playing' && state.acceptingInput && !state.hintUsed && state.remainingBalloons > 1 && hasHiddenLetters;
        refs.hintBtn.disabled = !canUse;

        if (state.hintUsed) {
          refs.hintBtn.textContent = '사용 완료';
          refs.hintStatus.textContent = '찬스 글자는 연보라색이에요';
        } else if (state.remainingBalloons <= 1 && state.screen === 'playing') {
          refs.hintBtn.textContent = '풍선 부족';
          refs.hintStatus.textContent = '풍선이 2개 이상 필요해요';
        } else {
          refs.hintBtn.textContent = '🎈 풍선 찬스';
          refs.hintStatus.textContent = '풍선 1개로 글자 보기';
        }
      }

      function queueMoodIdle(delayMs) {
        if (state.moodTimer) clearTimeout(state.moodTimer);
        state.moodTimer = setTimeout(() => {
          if (state.screen === 'playing' && state.acceptingInput) setMood(refs.characterActor, 'idle');
        }, delayMs);
      }

      function isWordComplete() {
        return [...new Set(state.currentEntry.word.split(''))].every(letter => state.correctLetters.has(letter));
      }

      function renderBalloons() {
        refs.balloonCluster.innerHTML = Array.from({ length: CONFIG.maxWrong }, (_, index) => (
          `<div class="balloon" data-index="${index}"></div>`
        )).join('');
      }

      function renderStrings() {
        const paths = [
          'M28 82 C42 112 58 137 78 158',
          'M62 35 C66 82 71 121 78 158',
          'M104 25 C98 76 89 120 78 158',
          'M143 56 C123 95 100 127 78 158',
          'M181 25 C145 77 111 119 78 158',
          'M220 52 C166 96 125 129 78 158',
          'M260 88 C190 114 137 138 78 158'
        ];
        refs.stringBundle.innerHTML = paths.map((d, index) =>
          `<path data-index="${index}" d="${d}" />`
        ).join('');
      }

      function popNextBalloon() {
        const popPosition = state.poppedBalloons;
        const index = CONFIG.balloonPopOrder[popPosition] ?? popPosition;
        const balloon = refs.balloonCluster.querySelector(`[data-index="${index}"]`);
        const string = refs.stringBundle.querySelector(`[data-index="${index}"]`);
        if (balloon) balloon.classList.add('popped');
        if (string) string.classList.add('popped');
        state.poppedBalloons = Math.min(CONFIG.maxWrong, state.poppedBalloons + 1);
      }

      function renderBalloonCount() {
        refs.balloonCount.textContent = `🎈 ${Math.max(0, state.remainingBalloons)}`;
      }

      function renderWordSlots() {
        const word = state.currentEntry.word;
        refs.wordSlots.innerHTML = word.split('').map(letter => {
          const shown = state.revealAnswer || state.correctLetters.has(letter) ? letter : '';
          const isHint = shown && state.hintLetters.has(letter) && !state.revealAnswer;
          return `<span class="slot${isHint ? ' hint' : ''}">${shown}</span>`;
        }).join('');
      }

      function renderKeyboard() {
        refs.keyboard.querySelectorAll('.key').forEach(button => {
          const letter = button.dataset.letter;
          button.classList.remove('correct', 'wrong', 'hint');
          if (state.hintLetters.has(letter)) button.classList.add('hint');
          else if (state.correctLetters.has(letter)) button.classList.add('correct');
          if (state.wrongLetters.has(letter)) button.classList.add('wrong');
          button.disabled = state.guessedLetters.has(letter) || !state.acceptingInput;
        });
      }

      function setMessage(text) {
        refs.messageBox.textContent = text;
      }

      function showResult(kind) {
        state.screen = 'result';
        state.acceptingInput = false;
        renderKeyboard();
        updateHintButton();

        const isClear = kind === 'clear';
        refs.resultTitle.textContent = isClear ? 'CLEAR!' : 'GAME OVER';
        refs.resultTitle.className = `resultTitle ${isClear ? 'clear' : 'gameover'}`;
        refs.resultNote.textContent = isClear ? '풍선을 지켰어요!' : '풍선이 모두 터졌어요...';
        refs.resultBalloons.textContent = `남은 풍선: ${Math.max(0, state.remainingBalloons)}개`;
        refs.answerWord.textContent = state.currentEntry.word;
        refs.answerMeaning.textContent = state.currentEntry.meaning;
        refs.resultOverlay.classList.remove('hidden');
      }

      function setMood(element, mood) {
        element.classList.remove('mood-idle', 'mood-correct', 'mood-wrong', 'mood-clear', 'mood-falling', 'mood-gameover');
        void element.offsetWidth;
        element.classList.add(`mood-${mood}`);
      }

      function randomPick(items) {
        return items[Math.floor(Math.random() * items.length)];
      }

      function getCharacterSvg() {
        return `
          <svg class="doodleSvg" viewBox="0 0 220 245" role="img" aria-label="풍선 행맨 졸라맨 캐릭터">
            <g class="bodyGroup">
              <path class="line leftArm" d="M107 151 C91 139 82 128 76 115" />
              <circle class="handFill gripHand" cx="74" cy="112" r="8" />
              <path class="gripLine" d="M69 111 C72 116 77 116 81 112" />
              <path class="line rightArm" d="M115 151 C136 159 151 173 164 190" />
              <circle class="handFill" cx="165" cy="190" r="6.5" />
              <path class="line" d="M111 143 C112 164 112 183 110 202" />
              <path class="line leftLeg" d="M110 200 C98 216 88 226 78 236" />
              <path class="line rightLeg" d="M110 200 C124 216 135 226 147 236" />
            </g>
            <g class="headGroup">
              <circle class="faceFill line" cx="111" cy="84" r="51" />
              <g class="eyeGroup">
                <circle class="eyeDot" cx="95" cy="84" r="5.8" />
                <circle class="eyeDot" cx="127" cy="84" r="5.8" />
              </g>
              <ellipse class="cheek" cx="83" cy="103" rx="9" ry="5.5" />
              <ellipse class="cheek" cx="139" cy="103" rx="9" ry="5.5" />
              <path class="thinLine mouth-idle" d="M99 111 C105 116 117 116 123 111" />
              <path class="thinLine mouth-smile" d="M96 109 C103 122 120 122 127 109" />
              <ellipse class="mouth-o" cx="112" cy="115" rx="9" ry="12" fill="#2a201b" stroke="#29201a" stroke-width="5" />
              <path class="thinLine mouth-sad" d="M98 121 C105 114 119 114 126 121" />
            </g>
          </svg>`;
      }
    })();
