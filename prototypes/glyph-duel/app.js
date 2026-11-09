/* Standalone local experiment. Custom patterns live in their own local library. */
(() => {
  'use strict';
  const R = window.GlyphDuelRules;
  const library = window.GlyphShapeLibrary;
  const $ = id => document.getElementById(id);
  const SIZE = 16, START_HP = 100;
  const board = $('board'), ctx = board.getContext('2d');
  const colors = { background: '#101b27', grid: '#263343', ink: '#f8d088', target: '#f8d088',
    correct: '#85d5b0', missing: '#df7d8b', extra: '#f3bd68', counter: '#a6dbea' };
  let state = null, clock = null, raf = 0, alarm = 0, generation = 0;
  let stroke = null, undo = [], tool = 'draw', cursor = null;
  let preferredShape = 'circle';
  const builtins = ['circle', 'square', 'triangle'];
  const findPattern = id => builtins.includes(id) ? R.getPattern(id, SIZE) : library.get(id);
  const selectedPattern = () => findPattern(state?.selected || preferredShape) || R.getPattern('circle', SIZE);
  const inkBudget = (pattern, percentage) => Math.min(SIZE * SIZE, Math.ceil(pattern.cells.length * percentage / 100));

  const setText = (id, value) => { $(id).textContent = value; };
  const show = (id, visible) => { $(id).hidden = !visible; };
  const playerName = index => `Player ${index + 1}`;
  const attemptPlayer = () => state.role === 'attacker' ? state.caster : 1 - state.caster;
  const roundSeconds = () => R.getDrawSeconds(state.round, state.config);
  const percent = value => `${Math.round(value)}%`;

  function announce(message) { setText('announcement', message); }
  function stopClock() {
    generation++;
    cancelAnimationFrame(raf); clearTimeout(alarm);
    raf = 0; alarm = 0; clock = null;
  }
  function finishStroke() {
    if (!stroke) return;
    const finished = stroke; stroke = null;
    if (finished.changed) { undo.push(finished.before); if (undo.length > 50) undo.shift(); }
    try { if (board.hasPointerCapture(finished.pointer)) board.releasePointerCapture(finished.pointer); } catch {}
  }
  function stopAttempt() { finishStroke(); stopClock(); cursor = null; }

  function configFromForm() {
    const number = (id, min, max) => {
      const value = Number($(id).value);
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${$(id).labels?.[0]?.textContent.trim() || id} must be between ${min} and ${max}.`);
      return value;
    };
    const config = { mode: $('setup-form').querySelector('[name="mode"]:checked')?.value || 'duel',
      startSeconds: number('start-seconds', 1, 60), minSeconds: number('min-seconds', 1, 60),
      decrement: number('step-seconds', 0, 15), studySeconds: number('study-seconds', 1, 15),
      basePower: number('base-power', 1, 100), inkPercent: number('ink-percent', 100, 300), tolerance: Number($('tolerance').value) };
    if (!['duel', 'practice'].includes(config.mode) || ![0, 1].includes(config.tolerance)) throw new Error('Choose a supported mode and drawing tolerance.');
    R.getDrawSeconds(1, config);
    return config;
  }

  function startMatch(config) {
    stopAttempt();
    state = { config: { ...config }, mode: config.mode, round: 1, caster: 0, role: 'attacker', phase: 'choose',
      hp: [START_HP, START_HP], selected: selectedPattern().id, turn: null, ink: new Set(), history: [], best: 0, last: null };
    undo = []; tool = 'draw';
    show('setup', false); show('game', true);
    announce(config.mode === 'practice' ? 'Solo practice started. Choose a symbol.' : 'Local duel started. Player 1 chooses a spell.');
    render();
  }

  function paintGrid(context, width, height, { drawing = [], target = [], score = null, reference = false } = {}) {
    const w = width / SIZE, h = height / SIZE;
    const lineScale = context.canvas === board ? Math.min(3, window.devicePixelRatio || 1) : 1;
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background; context.fillRect(0, 0, width, height);
    function block(cell, color, inset = lineScale) {
      context.fillStyle = color;
      context.fillRect((cell % SIZE) * w + inset, Math.floor(cell / SIZE) * h + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2));
    }
    if (reference) for (const cell of target) block(cell, colors.target);
    else if (score) {
      for (const cell of score.missingCells) block(cell, colors.missing, 3);
      for (const cell of score.correctCells) block(cell, colors.correct);
      for (const cell of score.extraCells) block(cell, colors.extra);
    } else for (const cell of drawing) block(cell, state?.role === 'defender' ? colors.counter : colors.ink);
    context.strokeStyle = colors.grid; context.lineWidth = Math.max(1, lineScale);
    context.beginPath();
    for (let i = 0; i <= SIZE; i++) {
      context.moveTo(Math.round(i * w) + .5, 0); context.lineTo(Math.round(i * w) + .5, height);
      context.moveTo(0, Math.round(i * h) + .5); context.lineTo(width, Math.round(i * h) + .5);
    }
    context.stroke();
    // Slightly stronger quarter-grid guides help recall positions on every device.
    context.strokeStyle = '#415166'; context.beginPath();
    for (const i of [SIZE / 4, SIZE / 2, SIZE * 3 / 4]) {
      context.moveTo(i * w + .5, 0); context.lineTo(i * w + .5, height);
      context.moveTo(0, i * h + .5); context.lineTo(width, i * h + .5);
    }
    context.stroke();
  }

  function renderBoard() {
    const isReference = state?.phase === 'study';
    const isDrawing = state?.phase === 'draw';
    // Match physical display pixels so downscaling never erases thin grid lines.
    // Input and scoring always use the same 16 logical cells on every screen.
    const visibleWidth = board.getBoundingClientRect().width;
    if (visibleWidth > 0) {
      const physical = Math.max(SIZE * 4, Math.round(visibleWidth * Math.min(3, window.devicePixelRatio || 1)));
      if (board.width !== physical) { board.width = physical; board.height = physical; }
    }
    paintGrid(ctx, board.width, board.height, { drawing: isDrawing ? state.ink : [],
      target: isReference ? state.turn.pattern.cells : [], reference: isReference });
    board.dataset.reference = String(Boolean(isReference));
    board.dataset.ink = String(isDrawing ? state.ink.size : 0);
    if (cursor && isDrawing) {
      const cell = board.width / SIZE;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.strokeRect(cursor.x * cell + 2, cursor.y * cell + 2, cell - 4, cell - 4);
    }
  }

  function updateInk() {
    const budget = state?.turn?.budget || (state ? inkBudget(selectedPattern(), state.config.inkPercent) : 0);
    const count = ['result', 'finished'].includes(state?.phase) ? state.turn[state.role]?.cells.length || 0 : state?.ink.size || 0;
    setText('budget-text', `${count} / ${budget} blocks`);
    $('budget-fill').style.width = `${budget ? count / budget * 100 : 0}%`;
    $('undo').disabled = !undo.length && !stroke?.changed;
    $('clear').disabled = count === 0;
    for (const button of document.querySelectorAll('[data-tool]')) {
      button.classList.toggle('is-active', button.dataset.tool === tool);
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    }
  }

  function render() {
    if (!state) return;
    const phase = state.phase, drawing = phase === 'draw', studying = phase === 'study';
    if (phase === 'choose') {
      if (!findPattern(state.selected)) state.selected = 'circle';
      renderShapeOptions();
    }
    Object.assign($('game').dataset, { phase, mode: state.mode, role: state.role, round: String(state.round), caster: String(state.caster) });
    setText('round-label', `Round ${state.round}`);
    setText('turn-label', state.mode === 'practice' ? 'Solo practice' : `${playerName(state.caster)} attacks`);
    show('health-bars', state.mode === 'duel'); show('practice-summary', state.mode === 'practice');
    setText('practice-summary', `Best ${percent(state.best)} · Last ${state.last === null ? '—' : percent(state.last)}`);
    for (let i = 0; i < 2; i++) {
      setText(`player-${i}-name`, playerName(i)); setText(`player-${i}-hp`, `${state.hp[i]} / ${START_HP} HP`);
      $(`player-${i}-bar`).style.width = `${state.hp[i]}%`;
    }
    const labels = { choose: 'Choose your spell', study: 'Memorize the outline', draw: state.role === 'defender' ? 'Draw to counter' : 'Draw to cast',
      handoff: 'Pass the screen', result: 'Spell resolved', finished: 'Duel complete' };
    setText('phase-label', labels[phase]);
    const pattern = state.turn?.pattern || selectedPattern();
    setText('shape-label', pattern.name);
    show('edit-selected-shape', phase === 'choose' && Boolean(pattern.custom));
    show('spell-picker', phase === 'choose'); show('board-shell', drawing || studying);
    show('drawing-tools', drawing); show('submit-drawing', drawing);
    show('handoff', phase === 'handoff'); show('result', phase === 'result' || phase === 'finished');
    $('board').tabIndex = drawing ? 0 : -1;
    $('board').setAttribute('aria-label', `${pattern.name} ${studying ? 'reference outline' : 'drawing canvas'}, ${SIZE} by ${SIZE} blocks`);
    $('submit-drawing').textContent = state.role === 'defender' ? 'Finish counter' : 'Finish cast';
    for (const button of document.querySelectorAll('[data-shape]')) {
      button.classList.toggle('is-active', button.dataset.shape === state.selected);
      button.setAttribute('aria-pressed', String(button.dataset.shape === state.selected));
    }
    setText('begin-cast', `Study ${selectedPattern().name.toLowerCase()}`);
    const hints = {
      choose: `Both attempts get ${roundSeconds()} seconds. ${state.config.tolerance ? 'One-block position grace is on.' : 'Exact positions count.'}`,
      study: `${state.mode === 'practice' ? 'Your' : playerName(attemptPlayer()) + '’s'} reference. It disappears when the study timer ends.`,
      draw: `${state.config.tolerance ? 'One-block position grace. ' : 'Exact positions. '}Missing blocks and extra marks reduce accuracy. Erase returns ink.`,
      handoff: 'The cast is concealed. The counter uses the same original outline, time and ink budget.',
      result: 'Green = matched ink · rose = missing target · amber = extra ink. Percentages include both missing and extra marks.',
      finished: 'Start another duel or return to settings to tune the experiment.',
    };
    setText('hint', hints[phase]);
    if (phase === 'handoff') {
      setText('handoff-title', `${playerName(1 - state.caster)}, your counter`);
      setText('handoff-copy', `Take the screen, then press Ready. You’ll study the same ${pattern.name.toLowerCase()} for ${state.config.studySeconds} seconds and draw for ${state.turn.windowSeconds} seconds, with ${state.turn.budget} blocks.`);
    }
    if (!clock) {
      setText('clock-text', phase === 'choose' ? `${roundSeconds()}s to draw` : phase === 'handoff' ? 'Ready when you are' : 'Resolved');
      $('clock-fill').style.width = phase === 'choose' ? '100%' : '0%';
      $('game').classList.remove('is-urgent');
    }
    updateInk(); renderBoard();
  }

  function runClock(phase, end, duration) {
    stopClock(); const token = generation;
    clock = { phase, end, duration };
    function tick() {
      if (!clock || token !== generation || state?.phase !== phase) return;
      const remaining = Math.max(0, end - Date.now());
      setText('clock-text', `${phase === 'study' ? 'Study ' : ''}${(remaining / 1000).toFixed(1)}s`);
      $('clock-fill').style.width = `${Math.min(100, remaining / duration * 100)}%`;
      $('game').classList.toggle('is-urgent', phase === 'draw' && remaining <= Math.min(3000, duration / 3));
      if (remaining <= 0) {
        stopClock();
        if (phase === 'study') beginDrawing(end);
        else finishDrawing('timeout');
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    alarm = setTimeout(tick, Math.max(0, end - Date.now())); tick();
  }

  function beginStudy(role) {
    stopAttempt(); state.role = role; state.phase = 'study'; state.ink = new Set(); undo = []; tool = 'draw';
    render();
    // Bring the reference and controls into reach before its timer starts.
    $('phase-label').scrollIntoView({ block: 'start', behavior: 'auto' });
    announce(`${state.mode === 'practice' ? 'Practice' : playerName(attemptPlayer())}: memorize ${state.turn.pattern.name}.`);
    const duration = state.config.studySeconds * 1000;
    runClock('study', Date.now() + duration, duration);
  }
  function beginDrawing(startedAt) {
    if (!state || state.phase !== 'study') return;
    state.phase = 'draw'; state.ink = new Set(); undo = []; tool = 'draw';
    state.attemptStartedAt = startedAt;
    render(); announce(`Draw now. ${state.turn.windowSeconds} seconds, ${state.turn.budget} blocks.`);
    board.focus({ preventScroll: true });
    runClock('draw', startedAt + state.turn.windowSeconds * 1000, state.turn.windowSeconds * 1000);
  }
  function canDraw() {
    if (state?.phase !== 'draw') return false;
    if (!clock || Date.now() >= clock.end) { finishDrawing('timeout'); return false; }
    return true;
  }

  function resultBoard(title, ink, score) {
    const card = document.createElement('article'); card.className = 'score-card';
    const heading = document.createElement('h3'); heading.textContent = `${title} · ${percent(score.accuracy)}`;
    const canvas = document.createElement('canvas'); canvas.className = 'result-board'; canvas.width = 384; canvas.height = 384;
    canvas.setAttribute('aria-label', `${title} result: ${score.hits} matched, ${score.missing} missing, ${score.extra} extra blocks.`);
    paintGrid(canvas.getContext('2d'), 384, 384, { drawing: ink, score });
    const detail = document.createElement('p'); detail.textContent = `${score.hits} matched · ${score.missing} missing · ${score.extra} extra`;
    card.append(heading, canvas, detail); return card;
  }
  function showResult() {
    const t = state.turn;
    const attack = R.scoreDrawing(t.attacker.cells, t.pattern, { size: SIZE, tolerance: state.config.tolerance });
    const counter = state.mode === 'duel' ? R.scoreDrawing(t.defender.cells, t.pattern, { size: SIZE, tolerance: state.config.tolerance }) : null;
    const report = { round: state.round, caster: state.caster, shape: t.pattern.id, seconds: t.windowSeconds,
      budget: t.budget, attack, counter, attacker: t.attacker, defender: t.defender || null };
    $('result-boards').replaceChildren(resultBoard(state.mode === 'practice' ? 'Your drawing' : `${playerName(state.caster)} · cast`, t.attacker.cells, attack));
    if (state.mode === 'practice') {
      state.best = Math.max(state.best, attack.accuracy); state.last = attack.accuracy;
      setText('result-title', `${percent(attack.accuracy)} accuracy`);
      setText('result-summary', `${attack.hits} of ${t.pattern.cells.length} target blocks matched; ${attack.extra} extra marks.`);
      setText('result-details', `Accuracy = 2 × matched ÷ (target blocks + drawn blocks). ${state.config.tolerance ? 'Matches allow one block of position grace, one-to-one.' : 'Only exact positions match.'}`);
      state.phase = 'result'; setText('next-turn', `Next attempt · ${R.getDrawSeconds(state.round + 1, state.config)}s`);
    } else {
      const defender = 1 - state.caster;
      const outcome = R.resolveAttack({ attackerAccuracy: attack.accuracy, defenderAccuracy: counter.accuracy,
        basePower: state.config.basePower, defenderHp: state.hp[defender] });
      state.hp[defender] = outcome.remainingHp;
      report.damage = outcome.damage;
      $('result-boards').append(resultBoard(`${playerName(defender)} · counter`, t.defender.cells, counter));
      state.phase = state.hp[defender] <= 0 ? 'finished' : 'result';
      setText('result-title', state.phase === 'finished' ? `${playerName(state.caster)} wins` : outcome.damage ? `${outcome.damage} damage lands` : 'No damage lands');
      setText('result-summary', `${percent(attack.accuracy)} cast · ${percent(counter.accuracy)} counter · ${playerName(defender)} has ${state.hp[defender]} HP.`);
      setText('result-details', `${state.config.basePower} spell power × ${(attack.accuracy / 100).toFixed(3)} cast accuracy × ${(1 - counter.accuracy / 100).toFixed(3)} unblocked = ${outcome.damage} damage (rounded up once).`);
      const nextRound = state.caster === 1 ? state.round + 1 : state.round;
      setText('next-turn', state.phase === 'finished' ? 'Play again' : `${playerName(defender)} attacks · ${R.getDrawSeconds(nextRound, state.config)}s`);
    }
    state.history.push(report); render(); announce($('result-title').textContent);
  }
  function finishDrawing(reason) {
    if (state?.phase !== 'draw') return;
    const elapsed = Math.max(0, Math.min(state.turn.windowSeconds * 1000, Date.now() - state.attemptStartedAt));
    finishStroke(); stopClock(); cursor = null;
    const attempt = { cells: Array.from(state.ink).sort((a, b) => a - b), elapsedMs: elapsed, reason };
    state.turn[state.role] = attempt;
    state.ink = new Set(); undo = [];
    if (state.mode === 'duel' && state.role === 'attacker') {
      state.phase = 'handoff'; render(); announce('Cast locked. Pass the screen to the other player.');
    } else showResult();
  }

  function editCell(cell) {
    if (tool === 'erase') return state.ink.delete(cell);
    if (state.ink.has(cell)) return false;
    if (state.ink.size >= state.turn.budget) {
      setText('hint', 'Ink budget reached. Erase or undo to reclaim blocks.'); return false;
    }
    state.ink.add(cell); return true;
  }
  function locate(event) {
    const rect = board.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * SIZE), y = Math.floor((event.clientY - rect.top) / rect.height * SIZE);
    return x < 0 || x >= SIZE || y < 0 || y >= SIZE ? null : { x, y };
  }
  function drawLine(start, end) {
    let x = start.x, y = start.y, changed = false;
    const dx = Math.abs(end.x - x), dy = -Math.abs(end.y - y), sx = x < end.x ? 1 : -1, sy = y < end.y ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      changed = editCell(y * SIZE + x) || changed;
      if (x === end.x && y === end.y) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
    return changed;
  }
  board.addEventListener('pointerdown', event => {
    if (stroke || event.button !== 0 || !canDraw()) return;
    event.preventDefault(); cursor = null;
    const point = locate(event); if (!point) return;
    stroke = { pointer: event.pointerId, last: point, before: new Set(state.ink), changed: false };
    board.setPointerCapture(event.pointerId); stroke.changed = editCell(point.y * SIZE + point.x);
    updateInk(); renderBoard();
  });
  board.addEventListener('pointermove', event => {
    if (!stroke || stroke.pointer !== event.pointerId || !canDraw()) return;
    event.preventDefault();
    const points = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    for (const sample of points.length ? points : [event]) {
      const point = locate(sample);
      if (point) stroke.changed = drawLine(stroke.last || point, point) || stroke.changed;
      stroke.last = point;
    }
    updateInk(); renderBoard();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) board.addEventListener(name, event => {
    if (stroke?.pointer !== event.pointerId) return;
    if (!canDraw()) return;
    finishStroke(); updateInk();
  });
  function undoStroke() {
    if (!canDraw()) return; finishStroke();
    if (undo.length) state.ink = new Set(undo.pop());
    updateInk(); renderBoard();
  }
  for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
    if (!canDraw()) return; finishStroke(); tool = button.dataset.tool; updateInk();
  });
  $('undo').addEventListener('click', undoStroke);
  $('clear').addEventListener('click', () => {
    if (!canDraw() || !state.ink.size) return; finishStroke(); undo.push(new Set(state.ink)); state.ink.clear(); updateInk(); renderBoard();
  });
  board.addEventListener('keydown', event => {
    if (!canDraw()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoStroke(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'd', 'e'].includes(event.key)) return;
    event.preventDefault(); cursor ||= { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) };
    if (event.key === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
    if (event.key === 'ArrowRight') cursor.x = Math.min(SIZE - 1, cursor.x + 1);
    if (event.key === 'ArrowUp') cursor.y = Math.max(0, cursor.y - 1);
    if (event.key === 'ArrowDown') cursor.y = Math.min(SIZE - 1, cursor.y + 1);
    if (event.key === 'd' || event.key === 'e') tool = event.key === 'd' ? 'draw' : 'erase';
    if (event.key === ' ') { undo.push(new Set(state.ink)); editCell(cursor.y * SIZE + cursor.x); }
    updateInk(); renderBoard();
  });

  $('setup-form').addEventListener('submit', event => {
    event.preventDefault();
    if ($('setup-error')) { $('setup-error').hidden = true; $('setup-error').textContent = ''; }
    try { startMatch(configFromForm()); } catch (error) {
      announce(error.message);
      if ($('setup-error')) { $('setup-error').hidden = false; $('setup-error').textContent = error.message; }
    }
  });
  $('shape-options').addEventListener('click', event => {
    const button = event.target.closest?.('[data-shape]');
    if (state?.phase !== 'choose' || !button || !findPattern(button.dataset.shape)) return;
    state.selected = button.dataset.shape; preferredShape = state.selected; render();
  });
  $('begin-cast').addEventListener('click', () => {
    if (state?.phase !== 'choose') return;
    const pattern = selectedPattern();
    // Frozen pattern snapshot keeps this cast stable if another tab edits its library.
    state.turn = { pattern, budget: inkBudget(pattern, state.config.inkPercent), windowSeconds: roundSeconds() };
    beginStudy('attacker');
  });
  $('edit-selected-shape').addEventListener('click', () => {
    if (state?.phase === 'choose' && selectedPattern().custom) library.open(state.selected);
  });
  $('ready').addEventListener('click', () => { if (state?.phase === 'handoff') beginStudy('defender'); });
  $('submit-drawing').addEventListener('click', () => { if (canDraw()) finishDrawing('submitted'); });
  $('next-turn').addEventListener('click', () => {
    if (!state || !['result', 'finished'].includes(state.phase)) return;
    if (state.phase === 'finished') { startMatch(state.config); return; }
    if (state.mode === 'practice') state.round++;
    else { if (state.caster === 1) state.round++; state.caster = 1 - state.caster; }
    state.phase = 'choose'; state.role = 'attacker'; state.turn = null; state.ink.clear(); undo = []; render();
  });

  async function confirmReset(message) {
    const dialog = $('confirm-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return window.confirm(message);
    setText('confirm-message', message); dialog.returnValue = 'cancel';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      if (!dialog.open) dialog.showModal();
    });
  }
  $('restart-match').addEventListener('click', async () => {
    if (!state) return;
    if (await confirmReset('Restart this test? Drawings and this match’s results will be cleared. Timers keep running until you confirm.')) startMatch(state.config);
  });
  $('exit-to-setup').addEventListener('click', async () => {
    if (!state) return;
    if (!await confirmReset('Return to setup? This ends the current test. Timers keep running until you confirm.')) return;
    stopAttempt(); state = null; show('game', false); show('setup', true); renderBoard(); announce('Back at setup. Tune the settings and start another test.');
  });
  document.addEventListener('visibilitychange', () => {
    if (clock && Date.now() >= clock.end) {
      const expired = clock;
      stopClock();
      if (expired.phase === 'study') beginDrawing(expired.end); else finishDrawing('timeout');
    }
  });
  window.addEventListener('resize', () => {
    if (state && ['study', 'draw'].includes(state.phase)) renderBoard();
  });

  // Built-ins use schematic icons; custom cards preview the user's saved pixels.
  function paintPickerIcon(canvas, pattern) {
    const c = canvas.getContext('2d'), width = canvas.width, center = width / 2, radius = width * .3;
    if (pattern.custom) {
      c.fillStyle = colors.target;
      const cell = width / SIZE;
      for (const id of pattern.cells) c.fillRect(id % SIZE * cell + .5, Math.floor(id / SIZE) * cell + .5, cell - 1, cell - 1);
      return;
    }
    c.strokeStyle = colors.target; c.lineWidth = 3; c.lineJoin = 'miter'; c.beginPath();
    const shape = pattern.id;
    if (shape === 'circle') c.arc(center, center, radius, 0, Math.PI * 2);
    else if (shape === 'square') c.rect(center - radius, center - radius, radius * 2, radius * 2);
    else {
      c.moveTo(center, center - radius); c.lineTo(center + radius, center + radius); c.lineTo(center - radius, center + radius);
      c.closePath();
    }
    c.stroke();
  }
  function renderShapeOptions() {
    const patterns = [...builtins.map(id => R.getPattern(id, SIZE)), ...library.list()];
    const fragment = document.createDocumentFragment();
    for (const pattern of patterns) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'shape-option';
      button.dataset.shape = pattern.id; button.setAttribute('aria-label', `Choose ${pattern.name}`);
      button.setAttribute('aria-pressed', String(state?.selected === pattern.id));
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
      canvas.dataset.shapePreview = pattern.id; canvas.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = pattern.name;
      button.append(canvas, name); paintPickerIcon(canvas, pattern); fragment.append(button);
    }
    $('shape-options').replaceChildren(fragment);
  }
  library.subscribe(event => {
    if (event?.type === 'save' && findPattern(event.id)) {
      preferredShape = event.id;
      if (state?.phase === 'choose') state.selected = event.id;
    }
    if (!findPattern(preferredShape)) preferredShape = 'circle';
    if (state?.phase === 'choose') render();
    else if (!state) renderShapeOptions();
  });
  renderShapeOptions();
})();
