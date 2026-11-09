import { ASSETS, WIZARD_SPRITES } from './assets.9209f3c599a3.js';

let atlasReady;

// Share one decoded image request across controllers and DOM reattachments.
function preloadWizardAtlas() {
  if (atlasReady) return atlasReady;
  atlasReady = new Promise(resolve => {
    const source = ASSETS[WIZARD_SPRITES.asset];
    if (!source || typeof Image !== 'function') { resolve(false); return; }
    const image = new Image();
    let settling = false;
    async function loaded() {
      if (settling) return;
      settling = true;
      try { if (typeof image.decode === 'function') await image.decode(); } catch {}
      resolve(image.naturalWidth > 0);
    }
    image.onload = loaded;
    image.onerror = () => resolve(false);
    image.src = source;
    if (image.complete && image.naturalWidth > 0) loaded();
  });
  return atlasReady;
}

/** A persistent decorative arena; its host reattaches element after renders. */
export function createBattleScene() {
  const element = document.createElement('section');
  element.className = 'battle-scene';
  element.setAttribute('aria-label', 'Fire and Water wizards in the forest ruins');
  element.innerHTML = '<div class="game-title"><span class="title-stars" aria-hidden="true">✦ ◆ ✦</span><h1>Wizzy</h1><p>Battle Simulator</p></div><span class="versus" aria-hidden="true">VS</span>';

  const view = element.ownerDocument.defaultView;
  const scale = 3;
  const tileWidth = WIZARD_SPRITES.cellWidth * scale;
  const tileHeight = WIZARD_SPRITES.cellHeight * scale;
  const anchor = { x: WIZARD_SPRITES.anchor.x * scale, y: WIZARD_SPRITES.anchor.y * scale };
  const idleFrame = WIZARD_SPRITES.idleFrame ?? 0;
  const walkFrames = WIZARD_SPRITES.walkFrames || [0, 1, 2, 3];
  const wizards = ['fire', 'water'].map((type, index) => {
    const wizard = document.createElement('div');
    wizard.className = `arena-wizard ${type}-wizard`;
    wizard.dataset.arenaWizard = type;
    wizard.setAttribute('aria-hidden', 'true');
    wizard.innerHTML = '<span class="mage-shadow"></span><span class="wizard-sprite"></span>';
    const sprite = wizard.querySelector('.wizard-sprite');
    sprite.style.backgroundImage = `url("${ASSETS[WIZARD_SPRITES.asset]}")`;
    sprite.style.backgroundSize = `${tileWidth * WIZARD_SPRITES.columns}px ${tileHeight * WIZARD_SPRITES.rows}px`;
    sprite.style.backgroundRepeat = 'no-repeat';
    sprite.style.imageRendering = 'pixelated';
    element.append(wizard);
    return { type, index, wizard, sprite, startX: index === 0 ? -128 : 1152, targetX: index === 0 ? 236 : 788,
      inward: index === 0 ? 'right' : 'left' };
  });

  const played = new Set();
  let preparedKey = null;
  let runningKey = null;
  let generation = 0;
  let frameRequest = 0;
  let timeline = null;
  let startPromise = null;
  const imageReady = preloadWizardAtlas();
  const normalizeKey = key => key === null || key === undefined ? null : String(key);
  const reducedMotion = () => Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  function pose(entry, x, y, direction, frame, motion) {
    entry.wizard.style.transform = `translate(${Math.round(x - anchor.x)}px, ${Math.round(y - anchor.y)}px)`;
    entry.wizard.dataset.motion = motion;
    entry.wizard.dataset.direction = direction;
    entry.wizard.dataset.frame = String(frame);
    entry.sprite.style.backgroundPosition = `${-frame * tileWidth}px ${-WIZARD_SPRITES.directions[entry.type][direction] * tileHeight}px`;
  }
  function idle() {
    for (const entry of wizards) pose(entry, entry.targetX, 450, entry.inward, idleFrame, 'idle');
    element.dataset.motion = 'idle';
  }
  function cancel() {
    generation += 1;
    if (frameRequest) view.cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    timeline = null;
    runningKey = null;
    startPromise = null;
  }
  function finishEntrance() {
    if (preparedKey !== null) played.add(preparedKey);
    cancel();
    idle();
  }
  function setActive(index) {
    for (const entry of wizards) {
      const active = index === entry.index;
      entry.wizard.classList.toggle('active-combatant', active);
      entry.wizard.dataset.active = String(active);
    }
  }
  function prepareEntrance(key) {
    key = normalizeKey(key);
    if (key === null) { finishEntrance(); return false; }
    if (key === preparedKey) return !played.has(key) || runningKey === key;
    // Replacing a staged or running duel never permits that old entrance to
    // resume after its image request or animation frame eventually completes.
    finishEntrance();
    preparedKey = key;
    if (played.has(key)) return false;
    if (reducedMotion()) { played.add(key); idle(); return false; }
    for (const entry of wizards) pose(entry, entry.startX, 450, entry.inward, idleFrame, 'in');
    element.dataset.motion = 'prepared';
    return true;
  }
  function startEntrance(key) {
    key = normalizeKey(key);
    if (key === null) return Promise.resolve(false);
    if (runningKey === key) return startPromise || Promise.resolve(true);
    if (key !== preparedKey) prepareEntrance(key);
    if (played.has(key)) return Promise.resolve(false);
    played.add(key);
    runningKey = key;
    const requestGeneration = generation;
    startPromise = imageReady.then(loaded => {
      if (requestGeneration !== generation || runningKey !== key) return false;
      if (!loaded || reducedMotion()) { finishEntrance(); return false; }
      timeline = { key, start: null };
      function tick(time) {
        frameRequest = 0;
        if (requestGeneration !== generation || timeline?.key !== key) return;
        if (reducedMotion()) { finishEntrance(); return; }
        if (timeline.start === null) timeline.start = time;
        const elapsed = Math.max(0, time - timeline.start);
        if (elapsed >= 1800) { finishEntrance(); return; }
        const progress = elapsed / 1800;
        const frame = walkFrames[Math.floor(elapsed / 125) % walkFrames.length];
        for (const entry of wizards) pose(entry,
          entry.startX + (entry.targetX - entry.startX) * progress,
          450, entry.inward, frame, 'in');
        element.dataset.motion = 'in';
        frameRequest = view.requestAnimationFrame(tick);
      }
      frameRequest = view.requestAnimationFrame(tick);
      return true;
    });
    return startPromise;
  }
  function hide() { finishEntrance(); }

  idle();
  setActive(null);
  return { element, setActive, prepareEntrance, startEntrance, finishEntrance, hide };
}
