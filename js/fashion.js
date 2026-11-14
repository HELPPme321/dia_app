'use strict';
(() => {
  const ART = {
    dress: "M50 12a5 5 0 1 1 5 5v5L88 40H12L45 22M36 44h28l5 14 14 34H17l14-34Z",
    sneaker: "M8 72V50l20-5 10 9 22-4c16 0 32 8 32 22ZM8 72h84M38 54l6 7M49 52l6 7",
    bag: "M20 40h60l7 48H13ZM36 40C36 12 64 12 64 40M13 56h74",
    shades: "M6 44h88M10 44c0 24 32 26 36 4M54 48c4 22 36 20 36-4M46 48q4-6 8 0",
    heel: "M14 26C12 52 30 66 54 66l34 4v8H50L32 72l-2 16h-8V66C12 54 12 40 14 26Z",
    hanger: "M50 16a6 6 0 1 1 6 6v6l38 20c4 3 2 8-3 8H9c-5 0-7-5-3-8l38-20"
  };

  const LAYOUT = [
    ["dress","7%","11%",148,7.2,.15],
    ["sneaker","62%","10%",166,8.1,.65],
    ["bag","34%","37%",145,7.6,1.15],
    ["shades","68%","48%",130,6.9,1.55],
    ["heel","10%","61%",145,8.4,2.05],
    ["hanger","43%","70%",116,7.1,2.45]
  ];

  function stage(element, items) {
    if (!element) return;
    const layout = items || LAYOUT;
    element.replaceChildren();
    layout.forEach(([key,x,y,size,duration,delay],index) => {
      const shape = ART[key];
      if (!shape) return;
      const item = document.createElement('div');
      item.className = 'fashion-item';
      item.style.setProperty('--x',x);
      item.style.setProperty('--y',y);
      item.style.setProperty('--size',size + 'px');
      item.style.setProperty('--duration',duration + 's');
      item.style.setProperty('--appear',(delay + .2) + 's');
      item.style.setProperty('--draw',(delay + .4) + 's');
      item.style.setProperty('--index',String(index));
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 100 100');
      svg.setAttribute('aria-hidden','true');
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('pathLength','1');
      path.setAttribute('d',shape);
      svg.append(path);
      item.append(svg);
      element.append(item);
    });
  }

  function createTiles() {
    document.querySelectorAll('[data-fashion-tile]').forEach((tile) => {
      const key = tile.getAttribute('data-fashion-tile');
      const pathData = ART[key];
      const container = tile.querySelector('.collection-card__art');
      if (!pathData || !container) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 100 100');
      svg.setAttribute('aria-hidden','true');
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData);
      svg.append(path);
      container.replaceChildren(svg);
    });
  }

  function playHomeIntro() {
    const intro = document.getElementById('intro');
    if (!intro) return;
    let pending = false;
    try {
      pending = window.sessionStorage.getItem('dia_intro_pending') === '1';
      if (pending) window.sessionStorage.removeItem('dia_intro_pending');
    } catch { pending = false; }
    // Only successful customer authentication arms this one-shot introduction.
    // Consume the flag before playback so refreshes and later navigation cannot replay it.
    if (!pending) { intro.remove(); return; }

    const scenes = Array.from(intro.querySelectorAll('[data-intro-scene]'));
    const skip = document.getElementById('skipIntro');
    const sound = document.getElementById('introSound');
    const reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let audioContext = null;
    let soundEnabled = false;
    let finished = false;
    let timer = null;
    let sceneIndex = 0;

    intro.hidden = false;
    intro.setAttribute('aria-hidden', 'false');
    intro.classList.add('is-running');
    if (reduced) intro.classList.add('is-reduced');
    document.body.classList.add('intro-active');

    function playCue() {
      if (!soundEnabled || !AudioContextClass) return;
      try {
        if (!audioContext) audioContext = new AudioContextClass();
        if (audioContext.state === 'suspended') audioContext.resume();
        const now = audioContext.currentTime;
        // A quiet two-note cue, created only after the user enables sound.
        [523.25, 659.25].forEach((frequency, index) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, now + index * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.025, now + index * 0.12 + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.42);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(now + index * 0.12);
          oscillator.stop(now + index * 0.12 + 0.44);
        });
      } catch {
        soundEnabled = false;
        if (sound) { sound.setAttribute('aria-pressed', 'false'); sound.textContent = 'Sound unavailable'; }
      }
    }

    function finish() {
      if (finished) return;
      finished = true;
      if (timer) window.clearTimeout(timer);
      intro.classList.add('is-leaving');
      intro.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('intro-active');
      if (skip) skip.tabIndex = -1;
      if (sound) sound.tabIndex = -1;
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
      window.setTimeout(() => intro.remove(), reduced ? 180 : 560);
    }

    function advanceScene() {
      if (finished || reduced || !scenes.length) return;
      sceneIndex += 1;
      if (sceneIndex >= scenes.length) { finish(); return; }
      scenes.forEach((scene, index) => scene.classList.toggle('is-active', index === sceneIndex));
      playCue();
      timer = window.setTimeout(advanceScene, 2050);
    }

    if (skip) {
      skip.tabIndex = 0;
      skip.addEventListener('click', finish, { once: true });
    }
    if (sound) {
      sound.tabIndex = 0;
      sound.disabled = !AudioContextClass;
      sound.addEventListener('click', () => {
        if (finished || !AudioContextClass) return;
        soundEnabled = !soundEnabled;
        sound.setAttribute('aria-pressed', String(soundEnabled));
        sound.textContent = soundEnabled ? 'Sound on' : 'Sound off';
        if (soundEnabled) playCue();
        else if (audioContext && audioContext.state === 'running') audioContext.suspend().catch(() => {});
      });
    }

    if (reduced) timer = window.setTimeout(finish, 1300);
    else {
      timer = window.setTimeout(advanceScene, 2050);
      window.setTimeout(() => {
        if (!finished && sceneIndex === scenes.length - 1) finish();
      }, scenes.length * 2050 + 300);
    }
  }

  document.querySelectorAll('[data-fashion-stage]').forEach((element) => stage(element));
  createTiles();
  playHomeIntro();
  window.DiaFashion = Object.freeze({ ART, LAYOUT, stage });
})();