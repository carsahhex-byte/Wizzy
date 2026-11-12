import { ASSETS, WIZARD_SPRITES, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS } from './assets.f381bee169ea.js';
import { getPlayerSchool } from './elements.f91c53cdab44.js';
import { IDLE_ANIMATION_SHEETS } from './idle-sprites.b1111132a9a3.js';
import { preloadAnimationSheet, paintAnimationFrame } from './animation-sprites.0930dbf02ced.js';

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
export function createBattleScene({ players = null } = {}) {
  const element = document.createElement('section');
  element.className = 'battle-scene';
  element.setAttribute('aria-label', 'Wizards in the forest ruins');
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
    wizard.dataset.arenaSeat = String(index);
    wizard.dataset.element = type;
    wizard.dataset.form = 'wizard';
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
  let idleFrameRequest = 0, idleElapsed = 0, lastIdleTime = null, idleGeneration = 0;
  let visible = true;
  let combatantKey = '';
  const imageReady = preloadWizardAtlas();
  const normalizeKey = key => key === null || key === undefined ? null : String(key);
  const motionMedia = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => Boolean(motionMedia?.matches);

  function pose(entry, x, y, direction, frame, motion) {
    entry.wizard.style.transform = `translate(${Math.round(x - anchor.x)}px, ${Math.round(y - anchor.y)}px)`;
    entry.wizard.dataset.motion = motion;
    entry.wizard.dataset.direction = direction;
    if (motion === 'idle' || entry.type === 'earth' && entry.golemActive) {
      const sheet = entry.golemActive ? GOLEM_ANIMATION_SHEETS.poses : IDLE_ANIMATION_SHEETS[entry.type];
      const frames = sheet.animations.idle;
      const sequenceFrame = frame % frames.length;
      const physicalFrame = frames[sequenceFrame];
      const nativeFacing = sheet.nativeFacing || 'right';
      paintAnimationFrame(entry.sprite, sheet, physicalFrame, anchor, { mirror: direction !== nativeFacing });
      Object.assign(entry.sprite.dataset, { sequenceFrame: String(sequenceFrame), phase: motion });
      entry.wizard.dataset.frame = String(physicalFrame);
      return;
    }
    entry.wizard.dataset.frame = String(frame);
    if (entry.type === 'earth') {
      const sheet = EARTH_ANIMATION_SHEETS.walk;
      const physicalFrame = sheet.animations.earth[frame % sheet.animations.earth.length];
      paintAnimationFrame(entry.sprite, sheet, physicalFrame, anchor, { mirror: direction !== sheet.facing.earth });
      entry.sprite.dataset.phase = motion;
      return;
    }
    // Entrance retains the original directional Fire/Water walking atlas.
    Object.assign(entry.sprite.style, {
      display: 'block', width: `${tileWidth}px`, height: `${tileHeight}px`,
      backgroundImage: `url("${ASSETS[WIZARD_SPRITES.asset]}")`,
      backgroundSize: `${tileWidth * WIZARD_SPRITES.columns}px ${tileHeight * WIZARD_SPRITES.rows}px`,
      backgroundPosition: `${-frame * tileWidth}px ${-WIZARD_SPRITES.directions[entry.type][direction] * tileHeight}px`,
      transform: '', clipPath: '',
    });
    Object.assign(entry.sprite.dataset, { asset: WIZARD_SPRITES.asset, frame: String(frame), phase: motion });
    entry.sprite.hidden = false;
  }
  function stopIdleLoop({ reset = false } = {}) {
    idleGeneration += 1;
    if (idleFrameRequest) view.cancelAnimationFrame(idleFrameRequest);
    idleFrameRequest = 0;
    lastIdleTime = null;
    if (reset) idleElapsed = 0;
  }
  function paintIdle() {
    const frame = reducedMotion() ? 0 : Math.floor(idleElapsed / 160);
    for (const entry of wizards) pose(entry, entry.targetX, 450, entry.inward, frame, 'idle');
  }
  function startIdleLoop() {
    if (!visible || element.ownerDocument.hidden || reducedMotion() || idleFrameRequest
      || timeline || element.dataset.motion !== 'idle') return;
    const requestGeneration = idleGeneration;
    function tick(time) {
      if (requestGeneration !== idleGeneration) return;
      idleFrameRequest = 0;
      if (!visible || element.ownerDocument.hidden || timeline || element.dataset.motion !== 'idle' || reducedMotion()) {
        lastIdleTime = null;
        return;
      }
      if (lastIdleTime !== null) idleElapsed += Math.max(0, time - lastIdleTime);
      lastIdleTime = time;
      paintIdle();
      idleFrameRequest = view.requestAnimationFrame(tick);
    }
    idleFrameRequest = view.requestAnimationFrame(tick);
  }
  function idle() {
    paintIdle();
    element.dataset.motion = 'idle';
    startIdleLoop();
  }
  function setCombatants(players) {
    if (!Array.isArray(players) || players.length !== 2) return false;
    const next = players.map((player,index) => ({
      type: getPlayerSchool(player) || (index === 0 ? 'fire' : 'water'),
      playerId: String(player.id ?? `seat-${index+1}`),
      golemActive: Boolean(player.golemActive),
    }));
    const key = JSON.stringify(next);
    visible = true;
    if (key === combatantKey) { startIdleLoop(); return false; }
    combatantKey = key;
    for (const [index, entry] of wizards.entries()) {
      Object.assign(entry, next[index]);
      entry.wizard.className = `arena-wizard ${entry.type}-wizard${entry.wizard.dataset.active === 'true' ? ' active-combatant' : ''}`;
      Object.assign(entry.wizard.dataset, { arenaWizard: entry.type, arenaSeat: String(index),
        element: entry.type, playerId: entry.playerId, form: entry.golemActive ? 'golem' : 'wizard' });
      preloadAnimationSheet(entry.golemActive ? GOLEM_ANIMATION_SHEETS.poses : IDLE_ANIMATION_SHEETS[entry.type]);
      if (entry.type === 'earth') preloadAnimationSheet(EARTH_ANIMATION_SHEETS.walk);
    }
    element.setAttribute('aria-label', `${next.map(entry => entry.type[0].toUpperCase()+entry.type.slice(1)).join(' and ')} wizards in the forest ruins`);
    if (!timeline && element.dataset.motion !== 'prepared') idle();
    return true;
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
    visible = true;
    if (reducedMotion()) { played.add(key); idle(); return false; }
    stopIdleLoop({ reset: true });
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
    const sheets = wizards.filter(entry => entry.type === 'earth').map(() => preloadAnimationSheet(EARTH_ANIMATION_SHEETS.walk));
    startPromise = Promise.all([imageReady, ...sheets]).then(loads => {
      const loaded = loads.every(Boolean);
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
  function hide() { visible = false; finishEntrance(); stopIdleLoop(); }

  // Pause the decorative clock while hidden; normal renders and spell setup
  // keep its phase, so repeated UI updates cannot postpone every second blink.
  element.ownerDocument.addEventListener?.('visibilitychange', () => {
    if (element.ownerDocument.hidden) stopIdleLoop();
    else startIdleLoop();
  });
  motionMedia?.addEventListener?.('change', () => {
    if (reducedMotion()) {
      stopIdleLoop();
      if (timeline || element.dataset.motion === 'prepared') finishEntrance();
      else if (element.dataset.motion === 'idle') paintIdle();
    } else if (element.dataset.motion === 'idle') {
      paintIdle();
      startIdleLoop();
    }
  });

  for (const entry of wizards) preloadAnimationSheet(IDLE_ANIMATION_SHEETS[entry.type]);
  idle();
  if (players) setCombatants(players);
  setActive(null);
  return { element, setActive, setCombatants, prepareEntrance, startEntrance, finishEntrance, hide };
}
