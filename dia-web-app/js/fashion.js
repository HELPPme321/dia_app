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
    let seen = false;
    try {
      seen = window.sessionStorage.getItem('dia_intro') === '1';
      if (!seen) window.sessionStorage.setItem('dia_intro','1');
    } catch {
      seen = window.__diaIntroSeen === true;
      window.__diaIntroSeen = true;
    }
    if (seen) { intro.remove(); return; }

    const skip = intro.querySelector('.skip');
    const reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    intro.hidden = false;
    intro.setAttribute('aria-hidden','false');
    intro.classList.add('is-running');
    if (reduced) intro.classList.add('is-reduced');
    if (skip) skip.tabIndex = 0;

    let finished = false;
    let timer;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) window.clearTimeout(timer);
      intro.classList.add('is-leaving');
      intro.setAttribute('aria-hidden','true');
      if (skip) skip.tabIndex = -1;
      window.setTimeout(() => intro.remove(), 360);
    };
    if (skip) skip.addEventListener('click',finish,{once:true});
    timer = window.setTimeout(finish,reduced ? 900 : 4500);
  }

  document.querySelectorAll('[data-fashion-stage]').forEach((element) => stage(element));
  createTiles();
  playHomeIntro();
  window.DiaFashion = Object.freeze({ ART, LAYOUT, stage });
})();