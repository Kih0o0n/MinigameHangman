(() => {
  "use strict";

  const CONFIG = Object.freeze({
    version: "0.2.0",
    maxBalloons: 7,
    successDelayMs: 420,
    gameOverDelayMs: 800,
    popAnimationMs: 350,
    heavenUrl: "https://kih0o0n.github.io/DDingboGameHeaven/",
    popOrder: [0, 6, 1, 5, 2, 4, 3],
  });

  const LETTER_ROWS = [
    ["A", "B", "C", "D", "E", "F", "G"],
    ["H", "I", "J", "K", "L", "M", "N"],
    ["O", "P", "Q", "R", "S", "T", "U"],
    ["V", "W", "X", "Y", "Z"],
  ];

  const dom = {
    startScreen: document.getElementById("startScreen"),
    playScreen: document.getElementById("playScreen"),
    startButton: document.getElementById("startButton"),
    startHeavenButton: document.getElementById("startHeavenButton"),
    resultHeavenButton: document.getElementById("resultHeavenButton"),
    backButton: document.getElementById("backButton"),
    soundToggle: document.getElementById("soundToggle"),
    soundIcon: document.querySelector(".sound-icon"),
    soundLabel: document.querySelector(".sound-label"),
    balloonCount: document.getElementById("balloonCount"),
    stageMessage: document.getElementById("stageMessage"),
    sceneActor: document.getElementById("sceneActor"),
    stage: document.getElementById("stage"),
    wordSlots: document.getElementById("wordSlots"),
    keyboard: document.getElementById("keyboard"),
    hintButton: document.getElementById("hintButton"),
    hintStatus: document.getElementById("hintStatus"),
    resultOverlay: document.getElementById("resultOverlay"),
    resultCard: document.getElementById("resultCard"),
    resultBadge: document.getElementById("resultBadge"),
    resultTitle: document.getElementById("resultTitle"),
    resultSummary: document.getElementById("resultSummary"),
    answerWord: document.getElementById("answerWord"),
    answerMeaning: document.getElementById("answerMeaning"),
    remainingText: document.getElementById("remainingText"),
    againButton: document.getElementById("againButton"),
    homeButton: document.getElementById("homeButton"),
  };

  const state = {
    screen: "start",
    status: "idle",
    current: null,
    guessed: new Set(),
    correct: new Set(),
    wrong: new Set(),
    hinted: new Set(),
    remainingBalloons: CONFIG.maxBalloons,
    hintUsed: false,
    locked: false,
    wordQueue: [],
    soundEnabled: true,
    audioContext: null,
    noiseBuffer: null,
    timers: new Set(),
  };

  function assertWordLibrary() {
    if (!Array.isArray(window.WORD_LIBRARY) || window.WORD_LIBRARY.length === 0) {
      throw new Error("WORD_LIBRARY를 불러오지 못했습니다.");
    }

    const invalid = window.WORD_LIBRARY.filter(({ word, meaning }) =>
      typeof word !== "string" ||
      !/^[A-Z]{5,9}$/.test(word) ||
      typeof meaning !== "string" ||
      meaning.trim().length === 0
    );

    if (invalid.length > 0) {
      console.warn("규칙에 맞지 않는 단어가 있습니다.", invalid);
    }
  }

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function nextWord() {
    if (state.wordQueue.length === 0) {
      state.wordQueue = shuffled(window.WORD_LIBRARY);
    }
    return state.wordQueue.pop();
  }

  function setScreen(screenName) {
    state.screen = screenName;
    const showStart = screenName === "start";
    dom.startScreen.classList.toggle("is-active", showStart);
    dom.startScreen.setAttribute("aria-hidden", String(!showStart));
    dom.playScreen.classList.toggle("is-active", !showStart);
    dom.playScreen.setAttribute("aria-hidden", String(showStart));
  }

  function clearTimers() {
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers.clear();
  }

  function later(callback, delay) {
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      callback();
    }, delay);
    state.timers.add(timer);
    return timer;
  }

  function resetScene() {
    dom.sceneActor.className.baseVal = "scene-actor";
    dom.stage.classList.remove("is-falling");
    document.querySelectorAll(".balloon-group").forEach((group) => {
      group.classList.remove("is-popping", "is-gone");
    });
    document.querySelectorAll(".balloon-string").forEach((line) => {
      line.classList.remove("is-cut");
    });
  }

  function startGame() {
    clearTimers();
    hideResult();
    state.current = nextWord();
    state.guessed = new Set();
    state.correct = new Set();
    state.wrong = new Set();
    state.hinted = new Set();
    state.remainingBalloons = CONFIG.maxBalloons;
    state.hintUsed = false;
    state.locked = false;
    state.status = "playing";
    resetScene();
    renderWord();
    renderKeyboard();
    updateCounter();
    updateHintButton();
    showMessage("알파벳을 골라보세요!", "");
    setScreen("play");
    unlockAudio();
    playSound("start");
  }

  function goHome() {
    clearTimers();
    hideResult();
    state.status = "idle";
    state.locked = false;
    setScreen("start");
    playSound("tap");
  }

  function revealMap() {
    const result = [];
    for (const letter of state.current.word) {
      result.push(state.correct.has(letter) || state.hinted.has(letter));
    }
    return result;
  }

  function renderWord(options = {}) {
    const revealAll = Boolean(options.revealAll);
    const newlyRevealed = options.newlyRevealed || null;
    const revealFlags = revealMap();
    dom.wordSlots.replaceChildren();

    [...state.current.word].forEach((letter, index) => {
      const slot = document.createElement("span");
      slot.className = "letter-slot";
      const isVisible = revealAll || revealFlags[index];
      slot.textContent = isVisible ? letter : "";
      slot.setAttribute("aria-label", isVisible ? letter : "숨은 글자");

      if (isVisible && newlyRevealed === letter) slot.classList.add("is-revealed");
      if (state.hinted.has(letter)) slot.classList.add("is-hint");
      if (revealAll && !revealFlags[index]) slot.classList.add("is-answer");
      dom.wordSlots.append(slot);
    });
  }

  function renderKeyboard() {
    dom.keyboard.replaceChildren();
    LETTER_ROWS.forEach((letters) => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      row.dataset.count = String(letters.length);

      letters.forEach((letter) => {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "key";
        key.textContent = letter;
        key.dataset.letter = letter;
        key.setAttribute("aria-label", `${letter} 선택`);
        key.addEventListener("click", () => chooseLetter(letter));
        row.append(key);
      });

      dom.keyboard.append(row);
    });
  }

  function getKey(letter) {
    return dom.keyboard.querySelector(`[data-letter="${letter}"]`);
  }

  function setKeyState(letter, kind) {
    const key = getKey(letter);
    if (!key) return;
    key.disabled = true;
    key.classList.add(`is-${kind}`, "pulse");
    later(() => key.classList.remove("pulse"), 380);
  }

  function chooseLetter(letter) {
    if (state.status !== "playing" || state.locked || state.guessed.has(letter)) return;

    state.guessed.add(letter);
    if (state.current.word.includes(letter)) {
      state.correct.add(letter);
      setKeyState(letter, "correct");
      renderWord({ newlyRevealed: letter });
      reactScene("correct");
      showMessage(randomOf(["좋아요!", "정답!", "Nice!", "딱 맞았어요!"]), "good");
      playSound("correct");
      if (isWordComplete()) finishSuccess();
      return;
    }

    state.wrong.add(letter);
    setKeyState(letter, "wrong");
    showMessage(randomOf(["앗, 아니에요!", "풍선 하나가 팡!", "Oops!", "다른 글자를 골라보세요!"]), "bad");
    loseBalloon("wrong");
  }

  function isWordComplete() {
    return [...state.current.word].every((letter) => state.correct.has(letter) || state.hinted.has(letter));
  }

  function loseBalloon(reason) {
    if (state.remainingBalloons <= 0) return;
    const popSequenceIndex = CONFIG.maxBalloons - state.remainingBalloons;
    const balloonIndex = CONFIG.popOrder[popSequenceIndex];
    state.remainingBalloons -= 1;
    updateCounter();
    popBalloon(balloonIndex);
    playSound(reason === "hint" ? "hintPop" : "pop");

    if (state.remainingBalloons === 0) {
      finishGameOver();
    } else {
      reactScene(reason === "hint" ? "wrong" : "wrong");
      updateHintButton();
    }
  }

  function popBalloon(index) {
    const group = document.querySelector(`.balloon-${index}`);
    const line = document.querySelector(`.string-${index}`);
    if (!group) return;
    group.classList.add("is-popping");
    if (line) line.classList.add("is-cut");
    later(() => {
      group.classList.remove("is-popping");
      group.classList.add("is-gone");
    }, CONFIG.popAnimationMs);
  }

  function reactScene(kind) {
    if (state.status !== "playing") return;
    const className = `state-${kind}`;
    dom.sceneActor.classList.remove("state-correct", "state-wrong");
    void dom.sceneActor.getBoundingClientRect();
    dom.sceneActor.classList.add(className);
    later(() => {
      if (state.status === "playing") dom.sceneActor.classList.remove(className);
    }, kind === "correct" ? 520 : 480);
  }

  function updateCounter() {
    dom.balloonCount.textContent = String(state.remainingBalloons);
  }

  function showMessage(text, tone) {
    dom.stageMessage.textContent = text;
    dom.stageMessage.classList.remove("good", "bad", "hint", "bump");
    if (tone) dom.stageMessage.classList.add(tone);
    void dom.stageMessage.getBoundingClientRect();
    dom.stageMessage.classList.add("bump");
    later(() => dom.stageMessage.classList.remove("bump"), 360);
  }

  function useHint() {
    if (state.status !== "playing" || state.locked || state.hintUsed || state.remainingBalloons < 2) return;

    const hiddenLetters = [...new Set([...state.current.word].filter((letter) =>
      !state.correct.has(letter) && !state.hinted.has(letter)
    ))];

    if (hiddenLetters.length === 0) return;

    const counts = hiddenLetters.map((letter) => ({
      letter,
      count: [...state.current.word].filter((char) => char === letter).length,
    }));
    const minCount = Math.min(...counts.map(({ count }) => count));
    const leastHelpful = counts.filter(({ count }) => count === minCount).map(({ letter }) => letter);
    const revealedLetter = randomOf(leastHelpful);

    state.hintUsed = true;
    state.hinted.add(revealedLetter);
    state.guessed.add(revealedLetter);
    setKeyState(revealedLetter, "hint");
    renderWord({ newlyRevealed: revealedLetter });
    showMessage(`${revealedLetter} 공개! 풍선 하나를 사용했어요.`, "hint");
    dom.hintStatus.textContent = "풍선 찬스를 사용했어요";
    loseBalloon("hint");
    playSound("hintReveal");
    updateHintButton();

    if (isWordComplete() && state.remainingBalloons > 0) finishSuccess();
  }

  function updateHintButton() {
    if (state.status !== "playing") return;
    const insufficient = state.remainingBalloons < 2;
    dom.hintButton.disabled = state.hintUsed || insufficient || state.locked;
    if (state.hintUsed) {
      dom.hintStatus.textContent = "풍선 찬스를 사용했어요";
    } else if (insufficient) {
      dom.hintStatus.textContent = "남은 풍선이 부족해요";
    } else {
      dom.hintStatus.textContent = "";
    }
  }

  function finishSuccess() {
    if (state.status !== "playing") return;
    state.status = "clear";
    state.locked = true;
    disableAllControls();
    dom.sceneActor.classList.remove("state-correct", "state-wrong");
    dom.sceneActor.classList.add("state-clear");
    showMessage("단어 완성!", "good");
    playSound("success");
    later(() => showResult("clear"), CONFIG.successDelayMs);
  }

  function finishGameOver() {
    if (state.status !== "playing") return;
    state.status = "gameover";
    state.locked = true;
    disableAllControls();
    renderWord({ revealAll: true });
    dom.sceneActor.classList.remove("state-correct", "state-wrong");
    dom.sceneActor.classList.add("state-falling");
    dom.stage.classList.add("is-falling");
    showMessage("으아아아—!", "bad");
    playSound("fall");
    later(() => showResult("gameover"), CONFIG.gameOverDelayMs);
  }

  function disableAllControls() {
    dom.keyboard.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    dom.hintButton.disabled = true;
  }

  function showResult(type) {
    const success = type === "clear";
    dom.resultCard.classList.toggle("is-fail", !success);
    dom.resultBadge.textContent = success ? "✨" : "💨";
    dom.resultTitle.textContent = success ? "CLEAR!" : "GAME OVER";
    dom.resultSummary.textContent = success ? randomOf(["멋지게 맞혔어요!", "풍선을 지켜냈어요!", "완벽한 추리였어요!"]) : "다음 단어에서 다시 도전해보세요!";
    dom.answerWord.textContent = state.current.word;
    dom.answerMeaning.textContent = state.current.meaning;
    dom.remainingText.textContent = success ? `남은 풍선: ${state.remainingBalloons}개` : "남은 풍선: 0개";
    dom.resultOverlay.hidden = false;
    dom.againButton.focus({ preventScroll: true });
  }

  function hideResult() {
    dom.resultOverlay.hidden = true;
  }

  function randomOf(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function goToGameHeaven() {
    playSound("tap");
    window.location.href = CONFIG.heavenUrl;
  }

  function unlockAudio() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      state.audioContext = new AudioContextClass();
      state.noiseBuffer = createNoiseBuffer(state.audioContext);
    }
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }
  }

  function createNoiseBuffer(context) {
    const length = Math.floor(context.sampleRate * .25);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function tone(frequency, duration, options = {}) {
    if (!state.soundEnabled || !state.audioContext) return;
    const context = state.audioContext;
    const now = context.currentTime + (options.delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume || .12, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  function noise(duration, volume, options = {}) {
    if (!state.soundEnabled || !state.audioContext || !state.noiseBuffer) return;
    const context = state.audioContext;
    const now = context.currentTime + (options.delay || 0);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = state.noiseBuffer;
    filter.type = options.filterType || "bandpass";
    filter.frequency.value = options.frequency || 1200;
    filter.Q.value = options.q || .8;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    source.stop(now + duration);
  }

  function playSound(name) {
    if (!state.soundEnabled) return;
    unlockAudio();
    if (!state.audioContext) return;

    switch (name) {
      case "tap":
        tone(420, .07, { type: "sine", volume: .07, endFrequency: 520 });
        break;
      case "start":
        tone(392, .12, { volume: .09 });
        tone(523, .15, { delay: .08, volume: .1 });
        break;
      case "correct":
        tone(620, .13, { type: "triangle", volume: .105 });
        tone(820, .18, { type: "triangle", delay: .075, volume: .11 });
        break;
      case "pop":
        noise(.12, .42, { filterType: "highpass", frequency: 650 });
        tone(145, .14, { type: "square", volume: .18, endFrequency: 72 });
        tone(980, .045, { type: "square", volume: .13 });
        break;
      case "hintPop":
        noise(.12, .40, { filterType: "highpass", frequency: 620 });
        tone(160, .13, { type: "square", volume: .16, endFrequency: 78 });
        break;
      case "hintReveal":
        tone(560, .12, { type: "triangle", delay: .11, volume: .095 });
        tone(760, .18, { type: "triangle", delay: .18, volume: .105 });
        break;
      case "success":
        [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, .23, { type: "triangle", delay: index * .085, volume: .105 }));
        break;
      case "fall":
        tone(360, .62, { type: "sawtooth", volume: .09, endFrequency: 82 });
        break;
      default:
        break;
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    dom.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
    dom.soundToggle.setAttribute("aria-label", state.soundEnabled ? "효과음 끄기" : "효과음 켜기");
    dom.soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
    dom.soundLabel.textContent = state.soundEnabled ? "ON" : "OFF";
    if (state.soundEnabled) {
      unlockAudio();
      playSound("tap");
    }
  }

  function handlePhysicalKeyboard(event) {
    if (state.screen !== "play" || state.status !== "playing") return;
    const letter = event.key.toUpperCase();
    if (/^[A-Z]$/.test(letter)) chooseLetter(letter);
  }

  function bindEvents() {
    dom.startButton.addEventListener("click", startGame);
    dom.startHeavenButton.addEventListener("click", goToGameHeaven);
    dom.resultHeavenButton.addEventListener("click", goToGameHeaven);
    dom.backButton.addEventListener("click", goHome);
    dom.soundToggle.addEventListener("click", toggleSound);
    dom.hintButton.addEventListener("click", useHint);
    dom.againButton.addEventListener("click", startGame);
    dom.homeButton.addEventListener("click", goHome);
    document.addEventListener("keydown", handlePhysicalKeyboard);
    document.addEventListener("pointerdown", unlockAudio, { once: true });
  }

  function init() {
    assertWordLibrary();
    bindEvents();
    renderKeyboard();
    updateCounter();
  }

  init();
})();
