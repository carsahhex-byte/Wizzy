/* Isolated review viewer. It never imports or changes live game state. */
(() => {
  'use strict';
  const manifest = window.WIZZY_EARTH_AIR_PREVIEW || {};
  const rawSheets = Array.isArray(manifest.sheets)
    ? Object.fromEntries(manifest.sheets.map(sheet => [sheet.id, sheet])) : manifest.sheets || {};
  const sheets = Object.fromEntries(Object.entries(rawSheets).map(([id, sheet]) => [id, { id, ...sheet,
    src: sheet.src || sheet.file || sheet.url || '',
    sourceWidth: sheet.sourceWidth || sheet.width, sourceHeight: sheet.sourceHeight || sheet.height,
    columns: sheet.columns || 4, rows: sheet.rows || 8,
  }]));
  const $ = id => document.getElementById(id);
  const canvas = $('duel-canvas'), ctx = canvas.getContext('2d');
  const stage = $('stage'), status = $('load-status');
  const imageStates = new Map(), tintTiles = new Map();
  const names = { fire: 'Fire', water: 'Water', earth: 'Earth', air: 'Air' };
  const colors = { fire: '#f3a46a', water: '#8ed4ec', earth: '#b7ce8b', air: '#e5dfed' };
  const isCaster = element => element === 'earth' || element === 'air';
  const frameList = (start, count) => Array.from({ length: count }, (_, index) => start + index);
  const definitions = [
    { id: 'idle', label: 'Idle breathing & blinking', sheet: 'idle', kind: 'idle' },
    { id: 'entrance', label: 'Walking entrance · 1.8 seconds', sheet: 'walk', kind: 'entrance' },
    { id: 'basicAttack', label: 'Basic attack', sheet: 'basicAttack', damaging: true },
    { id: 'simpleCast', label: 'Simple cast', sheet: 'simpleCast', damaging: true },
    { id: 'largeCast', label: 'Large cast', sheet: 'largeCast', damaging: true, large: true },
    { id: 'shield', label: 'Elemental shield', sheet: 'shield' },
    { id: 'powerUp', label: 'Power-up', sheet: 'powerUp' },
    { id: 'enhancement', label: 'Enhancement jump', sheet: 'enhancement' },
    { id: 'aura', label: 'Shared green Aura · loop & fizzle', sheet: 'sharedAura', kind: 'aura' },
    { id: 'quickHit', label: 'Quick hit flash & impact', kind: 'quickHit' },
  ].map(definition => ({ ...definition, ...(manifest.animations?.[definition.id] || {}) }));
  const state = { animation: 'idle', left: 'earth', right: 'air', caster: 'left', flipped: false,
    speed: 1, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    elapsed: 0, lastTick: performance.now(), loop: true, anchors: false, direction: 'down' };
  const actors = manifest.actors || {};
  const arena = { width: 1024, height: 580, leftX: 236, rightX: 788, feetY: 450, impactY: 370, ...manifest.arena };
  canvas.width = arena.width; canvas.height = arena.height;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const activeDefinition = () => definitions.find(item => item.id === state.animation) || definitions[0];
  const actorSheet = (element, key) => sheets[actors[element]?.[`${key}Sheet`] || (element === 'fire' || element === 'water' ? 'fireWaterWalk' : key)];
  const casterElement = () => state[state.caster];
  const desiredFacing = side => (side === 'left') !== state.flipped ? 'right' : 'left';
  const inward = side => side === 'left' ? 'right' : 'left';
  const nativeFacing = (sheet, element) => sheet?.facing?.[element] || sheet?.facings?.[element] || (element === 'air' || element === 'water' ? 'left' : 'right');
  const actorPoint = side => ({ x: side === 'left' ? arena.leftX : arena.rightX, y: arena.feetY });

  function imageState(sheet) {
    if (!sheet?.src) return null;
    if (imageStates.has(sheet.src)) return imageStates.get(sheet.src);
    const result = { image: new Image(), ready: false, error: false };
    imageStates.set(sheet.src, result);
    let finished = false;
    const finish = success => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      result.ready = success; result.error = !success;
      if (success) { sheet.sourceWidth ||= result.image.naturalWidth; sheet.sourceHeight ||= result.image.naturalHeight; }
      updateReadiness();
    };
    const timer = setTimeout(() => finish(false), 10000);
    result.image.onload = async () => {
      try { if (result.image.decode) await result.image.decode(); } catch {}
      finish(result.image.naturalWidth > 0);
    };
    result.image.onerror = () => finish(false);
    result.image.src = sheet.src;
    if (result.image.complete && result.image.naturalWidth) finish(true);
    return result;
  }

  function sequence(sheet, element, kind = '') {
    const explicit = sheet?.animations?.[element];
    if (Array.isArray(explicit)) return explicit;
    if (Array.isArray(explicit?.frames)) return explicit.frames;
    if (kind === 'aura') return sheet?.animations?.aura || frameList(0, 16);
    const count = kind === 'idle' ? 8 : 16;
    return frameList(element === 'air' || element === 'water' ? count : 0, count);
  }

  function cell(sheet, frame, kind = 'actor') {
    const width = sheet.sourceWidth / sheet.columns, height = sheet.sourceHeight / sheet.rows;
    const scale = sheet.displayScale ?? (kind === 'effect' ? .6 : 144 / (sheet.sourceBodyHeight || height * .75));
    const rawAnchor = sheet.frameAnchors?.[frame] || sheet.anchor;
    const point = Array.isArray(rawAnchor) ? { x: rawAnchor[0], y: rawAnchor[1] } : rawAnchor;
    const anchor = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : { x: .5, y: kind === 'effect' ? .5 : .94 };
    return { width, height, scale, anchor, column: frame % sheet.columns, row: Math.floor(frame / sheet.columns) };
  }

  function drawSprite(target, sheet, frame, point, { mirror = false, kind = 'actor', flash = false, size = 1 } = {}) {
    const loaded = imageState(sheet);
    if (!loaded?.ready || !Number.isInteger(frame) || frame < 0 || frame >= sheet.columns * sheet.rows) return null;
    const item = cell(sheet, frame, kind), width = item.width * item.scale * size, height = item.height * item.scale * size;
    target.save(); target.imageSmoothingEnabled = false;
    target.translate(Math.round(point.x), Math.round(point.y));
    if (mirror) target.scale(-1, 1);
    const x = Math.round(-item.anchor.x * width), y = Math.round(-item.anchor.y * height);
    if (flash) {
      const key = `${sheet.id}:${frame}:${Math.ceil(width)}:${Math.ceil(height)}`;
      let tile = tintTiles.get(key);
      if (!tile) {
        tile = document.createElement('canvas'); tile.width = Math.ceil(width); tile.height = Math.ceil(height);
        const layer = tile.getContext('2d'); layer.imageSmoothingEnabled = false;
        layer.drawImage(loaded.image, item.column * item.width, item.row * item.height, item.width, item.height, 0, 0, width, height);
        layer.globalCompositeOperation = 'source-atop'; layer.fillStyle = 'rgba(255,35,35,.72)'; layer.fillRect(0, 0, tile.width, tile.height);
        tintTiles.set(key, tile);
      }
      target.drawImage(tile, x, y);
    } else target.drawImage(loaded.image, item.column * item.width, item.row * item.height, item.width, item.height, x, y, width, height);
    target.restore();
    return { frame, mirror, sheet: sheet.id, x: Math.round(point.x), y: Math.round(point.y), anchorX: item.anchor.x, anchorY: item.anchor.y };
  }

  function walkPose(element, direction, frame) {
    const sheet = actorSheet(element, 'walk');
    const defaults = { fire: { down: 0, left: 1, right: 2, up: 3 }, water: { down: 4, left: 5, right: 6, up: 7 },
      earth: { down: 0, left: 1, right: 2, up: 3 }, air: { down: 4, left: 5, right: 6, up: 7 } };
    const row = sheet?.directions?.[element]?.[direction] ?? defaults[element]?.[direction] ?? 0;
    return { sheet, frame: row * (sheet?.columns || 4) + frame, mirror: false };
  }

  function idlePose(element, facing, time) {
    const sheet = isCaster(element) ? actorSheet(element, 'idle') : null;
    if (sheet && imageState(sheet)?.ready) {
      const frames = sequence(sheet, element, 'idle'), frame = frames[Math.floor(time / (sheet.frameMs || manifest.idleFrameMs || 160)) % frames.length];
      return { sheet, frame, mirror: nativeFacing(sheet, element) !== facing };
    }
    return walkPose(element, facing, 0);
  }

  function duration(definition = activeDefinition()) {
    if (definition.kind === 'idle') return sequence(sheets[definition.sheet], casterElement(), 'idle').length * (sheets[definition.sheet]?.frameMs || manifest.idleFrameMs || 160);
    if (definition.kind === 'entrance') return 1800;
    if (definition.kind === 'aura') return 3000;
    if (definition.kind === 'quickHit') return 340;
    return definition.damaging ? 2840 : 2000;
  }

  function launchPoint(sheet, element, frame, point, mirror) {
    const item = sheet && cell(sheet, frame);
    const core = sheet?.launchAnchors?.[element] || sheet?.launchAnchor;
    let offset = sheet?.launchOffsets?.[element] || { x: nativeFacing(sheet, element) === 'left' ? -50 : 50, y: -50 };
    if (core && item) offset = { x: (core.x - item.anchor.x) * item.width * item.scale, y: (core.y - item.anchor.y) * item.height * item.scale };
    return { x: point.x + offset.x * (mirror ? -1 : 1), y: point.y + offset.y };
  }

  function effectState(definition, time, caster, target) {
    if (!definition.damaging || !isCaster(casterElement()) || time < (definition.large ? 1000 : 1500) || time >= 2500) return null;
    const element = casterElement(), sheet = sheets[definition.projectileSheet || (definition.large ? 'largeProjectiles' : 'basicProjectiles')];
    if (!sheet) return null;
    const frames = sequence(sheet, element), flight = clamp((time - 1500) / 1000, 0, 1);
    const actor = sheets[definition.sheet], actorFrames = sequence(actor, element), mirrored = nativeFacing(actor, element) !== desiredFacing(state.caster);
    const release = launchPoint(actor, element, actorFrames[12] ?? 12, caster, mirrored);
    const start = definition.large ? { x: state.caster === 'left' ? -180 : arena.width + 180, y: element === 'earth' ? arena.feetY : 365 } : release;
    const end = { x: target.x, y: definition.large && element === 'earth' ? arena.feetY : definition.large ? 365 : arena.impactY };
    const point = { x: start.x + (end.x - start.x) * flight, y: start.y + (end.y - start.y) * flight };
    const frame = time < 1500 ? frames[clamp(Math.floor((time - 1000) / 125), 0, 3)] : frames[4 + clamp(Math.floor((time - 1500) / 125), 0, 7)];
    return { sheet, frame, point, release, mirror: nativeFacing(sheet, element) !== desiredFacing(state.caster) };
  }

  function impactPose(element, time) {
    const own = isCaster(element) ? sheets.basicProjectiles : null;
    const sheet = own || sheets.sharedImpact;
    if (!sheet) return null;
    const frames = own ? sequence(sheet, element).slice(12, 16) : sheet.animations?.impact || [12, 13, 14, 15];
    return { sheet, frame: frames[clamp(Math.floor(time / 85), 0, 3)], mirror: nativeFacing(sheet, element) !== desiredFacing(state.caster) };
  }

  function anchorMark(target, point, color = '#ffdb75') {
    target.save(); target.strokeStyle = color; target.lineWidth = 2;
    target.beginPath(); target.moveTo(point.x - 7, point.y); target.lineTo(point.x + 7, point.y); target.moveTo(point.x, point.y - 7); target.lineTo(point.x, point.y + 7); target.stroke(); target.restore();
  }

  function backdrop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#173342'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#203c49';
    for (let x = 0; x < canvas.width; x += 64) for (let y = 50; y < arena.feetY - 30; y += 64) ctx.fillRect(x + (y % 128 ? 14 : 0), y, 5, 5);
    ctx.fillStyle = '#486c57'; ctx.fillRect(0, arena.feetY, canvas.width, 5);
    ctx.fillStyle = '#263d36'; ctx.fillRect(0, arena.feetY + 5, canvas.width, canvas.height - arena.feetY - 5);
  }

  function render() {
    const definition = activeDefinition(), time = state.elapsed;
    const caster = actorPoint(state.caster), targetSide = state.caster === 'left' ? 'right' : 'left', target = actorPoint(targetSide);
    const damaging = definition.damaging && isCaster(casterElement());
    const hitTime = definition.kind === 'quickHit' ? time : time - 2500;
    const hit = (damaging || definition.kind === 'quickHit') && hitTime >= 0 && hitTime < 340;
    const flash = hit && hitTime < 210;
    let phase = definition.kind === 'idle' ? 'idle' : definition.kind === 'entrance' ? time < 1800 ? 'entrance' : 'idle'
      : definition.kind === 'aura' ? time < 500 ? 'forming' : time < 2500 ? 'active' : time < 3000 ? 'fizzle' : 'complete'
        : definition.kind === 'quickHit' ? hit ? 'impact' : 'complete'
          : time < 500 ? 'windup' : time < 1500 ? 'linger' : time < 2000 ? 'recovery' : damaging && time < 2500 ? 'flight' : hit ? 'impact' : 'complete';
    backdrop();
    let auraFrame = -1;
    if (definition.kind === 'aura' && time < 3000) {
      const sheet = sheets[definition.sheet], frames = sequence(sheet, 'aura', 'aura');
      const index = time < 500 ? Math.floor(time / 125) : time < 2500 ? 4 + Math.floor((time - 500) / 125) % 8 : 12 + clamp(Math.floor((time - 2500) / 125), 0, 3);
      auraFrame = frames[index];
      drawSprite(ctx, sheet, auraFrame, { x: caster.x, y: manifest.auraY || arena.feetY - 11 }, { kind: 'effect' });
    }
    const poses = {};
    for (const side of ['left', 'right']) {
      const element = state[side], point = actorPoint(side), facing = desiredFacing(side);
      let pose = idlePose(element, facing, time);
      if (definition.kind === 'entrance' && time < 1800) {
        const progress = clamp(time / 1800, 0, 1), start = side === 'left' ? -130 : arena.width + 130;
        point.x = start + (point.x - start) * progress;
        pose = walkPose(element, inward(side), Math.floor(time / 125) % 4);
      } else if (side === state.caster && isCaster(element) && !definition.kind && time < 2000) {
        const sheet = sheets[definition.sheet], frames = sequence(sheet, element);
        pose = { sheet, frame: frames[clamp(Math.floor(time / 125), 0, 15)], mirror: nativeFacing(sheet, element) !== facing };
      }
      poses[side] = drawSprite(ctx, pose.sheet, pose.frame, point, { mirror: pose.mirror, flash: side === targetSide && flash });
      if (state.anchors) anchorMark(ctx, point, colors[element]);
      Object.assign(stage.dataset, { [`${side}Element`]: element, [`${side}Facing`]: facing,
        [`${side}FeetX`]: String(Math.round(point.x)), [`${side}FeetY`]: String(point.y),
        [`${side}Frame`]: String(pose.frame ?? -1), [`${side}Mirror`]: String(Boolean(pose.mirror)),
        [`${side}Sheet`]: pose.sheet?.id || '', [`${side}AnchorX`]: String(poses[side]?.anchorX ?? ''), [`${side}AnchorY`]: String(poses[side]?.anchorY ?? '') });
    }
    const projectile = effectState(definition, time, caster, target);
    if (projectile) {
      drawSprite(ctx, projectile.sheet, projectile.frame, projectile.point, { mirror: projectile.mirror, kind: 'effect' });
      if (state.anchors) anchorMark(ctx, projectile.point);
    }
    let impact = null;
    if (hit) {
      impact = impactPose(casterElement(), hitTime);
      if (impact) drawSprite(ctx, impact.sheet, impact.frame, { x: target.x, y: arena.impactY }, { mirror: impact.mirror, kind: 'effect' });
    }
    Object.assign(stage.dataset, { animation: definition.id, phase, frame: String(poses[state.caster]?.frame ?? -1),
      elapsedMs: String(Math.round(time)), durationMs: String(duration()), playing: String(state.playing), casterSide: state.caster,
      projectileVisible: String(Boolean(projectile)), projectileX: projectile ? String(Math.round(projectile.point.x)) : '',
      projectileY: projectile ? String(Math.round(projectile.point.y)) : '', projectileFrame: String(projectile?.frame ?? -1),
      launchX: projectile ? String(Math.round(projectile.release.x)) : '', launchY: projectile ? String(Math.round(projectile.release.y)) : '',
      hitFlash: String(flash), impactFrame: String(impact?.frame ?? -1), auraFrame: String(auraFrame) });
    $('timeline').max = String(duration()); $('timeline').value = String(clamp(time, 0, duration()));
    $('time-label').textContent = `${(time / 1000).toFixed(2)} / ${(duration() / 1000).toFixed(2)} s`;
    $('frame-info').textContent = `${phase.toUpperCase()} · ${state.caster} caster · frame ${stage.dataset.frame} · feet ${Math.round(caster.x)}, ${caster.y}${projectile ? ` · effect ${Math.round(projectile.point.x)}, ${Math.round(projectile.point.y)}` : ''}`;
    for (const [element, entry] of comparisons) {
      const context = entry.canvas.getContext('2d'); context.clearRect(0, 0, 256, 260);
      context.fillStyle = '#4d6559'; context.fillRect(0, 218, 256, 2);
      const pose = walkPose(element, state.direction, Math.floor(time / 125) % 4);
      const info = drawSprite(context, pose.sheet, pose.frame, { x: 128, y: 218 });
      Object.assign(entry.canvas.dataset, { element, frame: String(pose.frame), phase: state.playing ? 'walking' : 'paused', feetX: '128', feetY: '218', facing: state.direction });
      entry.meta.textContent = info ? `frame ${pose.frame} · feet 128,218` : 'Waiting for reference sheet';
      if (state.anchors) anchorMark(context, { x: 128, y: 218 }, colors[element]);
    }
  }

  function updateReadiness() {
    const missing = Object.values(sheets).filter(sheet => imageStates.get(sheet.src)?.error);
    const loaded = Object.values(sheets).filter(sheet => imageStates.get(sheet.src)?.ready).length;
    const ready = Object.keys(sheets).length > 0 && loaded === Object.keys(sheets).length;
    stage.dataset.ready = String(ready); stage.dataset.errors = missing.map(sheet => sheet.id).join(',');
    status.dataset.state = missing.length ? 'error' : 'ready';
    status.textContent = !Object.keys(sheets).length ? 'Waiting for manifest.js and the preview sheets.'
      : missing.length ? `Some sheets could not load: ${missing.map(sheet => sheet.title || sheet.id).join(', ')}. Other previews remain available.`
        : ready ? `${loaded} original sheets ready. All motion is presentation only.` : `Loading original sheets… ${loaded}/${Object.keys(sheets).length}`;
  }

  function updateControls() {
    const definition = activeDefinition(), eligible = ['left', 'right'].filter(side => isCaster(state[side]));
    for (const option of $('caster-side').options) option.disabled = !eligible.includes(option.value);
    if (!eligible.includes(state.caster) && eligible.length) state.caster = eligible[0];
    $('caster-side').value = state.caster; $('caster-side').disabled = eligible.length === 0;
    $('left-element').value = state.left; $('right-element').value = state.right;
    $('left-label').textContent = `${names[state.left]}${state.caster === 'left' ? ' · caster' : ''}`;
    $('right-label').textContent = `${names[state.right]}${state.caster === 'right' ? ' · caster' : ''}`;
    $('play-toggle').textContent = state.playing ? 'Pause' : 'Play'; $('play-toggle').setAttribute('aria-pressed', String(state.playing));
    $('flip-facing').setAttribute('aria-pressed', String(state.flipped));
    $('timing-label').textContent = definition.kind === 'idle' ? `Eight-frame idle loop · ${sheets.idle?.frameMs || manifest.idleFrameMs || 160} ms per frame.`
      : definition.kind === 'entrance' ? 'Walking entrance: 1.8 seconds. Both wizards settle on the same ground line.'
        : definition.kind === 'aura' ? 'Shared green Aura: 500 ms form → two 1-second active loops → 500 ms fizzle.'
          : definition.kind === 'quickHit' ? 'Quick hit only: 210 ms red flash; four impact frames at 85 ms (340 ms total).'
            : definition.damaging ? '500 ms windup → 1-second charge → 500 ms recovery. Flight: 1.5–2.5 s; quick hit ends at 2.84 s.'
              : '500 ms windup → eight distinct linger frames for 1 second → 500 ms recovery. Total: 2 seconds.';
    if (!eligible.length && !['idle', 'entrance', 'aura'].includes(definition.kind)) $('timing-label').textContent = 'Fire and Water are reference targets. Choose Earth or Air on one side to preview a spell.';
  }

  function restart() { state.elapsed = 0; state.lastTick = performance.now(); state.playing = true; updateControls(); render(); }
  $('animation-select').innerHTML = definitions.map(item => `<option value="${escape(item.id)}">${escape(item.label)}</option>`).join('');
  $('animation-select').addEventListener('change', event => { state.animation = event.target.value; restart(); });
  for (const side of ['left', 'right']) $(`${side}-element`).addEventListener('change', event => { state[side] = event.target.value; updateControls(); restart(); });
  $('caster-side').addEventListener('change', event => { state.caster = event.target.value; restart(); });
  $('play-toggle').addEventListener('click', () => { if (!state.playing && state.elapsed >= duration()) state.elapsed = 0; state.playing = !state.playing; state.lastTick = performance.now(); updateControls(); render(); });
  $('restart').addEventListener('click', restart);
  $('swap-sides').addEventListener('click', () => { [state.left, state.right] = [state.right, state.left]; state.caster = state.caster === 'left' ? 'right' : 'left'; updateControls(); restart(); });
  $('flip-facing').addEventListener('click', () => { state.flipped = !state.flipped; updateControls(); render(); });
  $('speed').addEventListener('change', event => { state.speed = Number(event.target.value) || 1; state.lastTick = performance.now(); });
  $('loop').addEventListener('change', event => { state.loop = event.target.checked; });
  $('show-anchors').addEventListener('change', event => { state.anchors = event.target.checked; render(); });
  $('timeline').addEventListener('input', event => { state.elapsed = Number(event.target.value); state.playing = false; state.lastTick = performance.now(); updateControls(); render(); });
  $('comparison-direction').addEventListener('change', event => { state.direction = event.target.value; render(); });
  document.addEventListener('visibilitychange', () => { state.lastTick = performance.now(); });

  const comparisons = new Map();
  for (const element of ['fire', 'water', 'earth', 'air']) {
    const entry = document.createElement('article'); entry.className = 'comparison-card';
    entry.innerHTML = `<h3>${names[element]}</h3><canvas width="256" height="260" aria-label="${names[element]} walking sprite comparison"></canvas><p></p>`;
    $('comparison-grid').append(entry); comparisons.set(element, { canvas: entry.querySelector('canvas'), meta: entry.querySelector('p') });
  }
  for (const sheet of Object.values(sheets)) {
    const entry = document.createElement('article'); entry.className = 'sheet-card'; entry.dataset.sheet = sheet.id;
    entry.innerHTML = `<h3>${escape(sheet.title || sheet.id)}</h3><a class="sheet-image-link" href="${escape(sheet.src)}" target="_blank" rel="noopener"><img src="${escape(sheet.src)}" alt="${escape(sheet.title || sheet.id)} original sprite sheet" loading="lazy"></a><p>${sheet.columns} × ${sheet.rows} grid · ${sheet.columns * sheet.rows} cells${sheet.sourceWidth ? ` · ${sheet.sourceWidth} × ${sheet.sourceHeight}` : ''}</p><a class="sheet-download" href="${escape(sheet.src)}" download>Download original PNG ↓</a>`;
    $('sheet-grid').append(entry); imageState(sheet);
  }
  if (manifest.zip) $('download-pack').href = manifest.zip;
  updateControls(); updateReadiness(); render();
  function tick(now) {
    const delta = Math.max(0, now - state.lastTick); state.lastTick = now;
    if (state.playing) {
      state.elapsed += delta * state.speed;
      if (state.elapsed >= duration()) {
        if (state.loop) state.elapsed %= duration();
        else { state.elapsed = duration(); state.playing = false; updateControls(); }
      }
    }
    render(); requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
