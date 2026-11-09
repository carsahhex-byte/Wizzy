(function (root) {
  'use strict';
  const R = root.GlyphDuelRules, SIZE = 16, MAX_SHAPES = 50;
  const STORAGE_KEY = 'spell-sketch.custom-shapes.v1';
  const $ = id => document.getElementById(id);
  const dialog = $('shape-editor-dialog'), editor = $('shape-editor'), board = $('shape-editor-board');
  const subscribers = new Set(), sessionEdits = new Map();
  let patterns = [], persistentNotice = '', editingId = null, cells = new Set(), history = [];
  let tool = 'draw', stroke = null, cursor = { x: 7, y: 7 }, renderRequest = 0;

  function decodeStore(text) {
    if (!text) return { patterns: [], ignored: false, overflow: false };
    if (text.length > 1000000) throw new Error('Saved shape data is larger than this editor supports.');
    const value = JSON.parse(text), records = Array.isArray(value) ? value : value?.version === 1 ? value.patterns : null;
    if (!Array.isArray(records)) throw new Error('Saved shape data could not be read.');
    const found = new Map(); let ignored = false, overflow = false;
    for (const entry of records) {
      try {
        if (!entry || entry.size !== undefined && entry.size !== SIZE || !Array.isArray(entry.cells)) throw new Error('Invalid saved shape.');
        const pattern = R.createPattern(entry, SIZE);
        if (found.has(pattern.id)) { ignored = true; continue; }
        if (found.size >= MAX_SHAPES) { overflow = true; continue; }
        found.set(pattern.id, pattern);
      } catch { ignored = true; }
    }
    return { patterns: [...found.values()], ignored, overflow };
  }

  function paintMask(canvas, mask, grid = false) {
    const rect = canvas.getBoundingClientRect(), side = rect.width || (grid ? 400 : 64);
    const ratio = grid ? Math.max(1, root.devicePixelRatio || 1) : 1;
    const pixels = Math.max(16, Math.round(side * ratio));
    if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#eae3ce'; ctx.fillRect(0, 0, side, side);
    const step = side / SIZE;
    ctx.fillStyle = '#294a35';
    for (const id of mask) ctx.fillRect((id % SIZE) * step, Math.floor(id / SIZE) * step, step, step);
    if (grid) {
      ctx.strokeStyle = '#aeb6a0'; ctx.lineWidth = 1;
      for (let i = 0; i <= SIZE; i++) {
        const p = Math.round(i * step) + .5;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, side); ctx.moveTo(0, p); ctx.lineTo(side, p); ctx.stroke();
      }
      if (document.activeElement === board) { ctx.strokeStyle = '#b37e23'; ctx.lineWidth = 3; ctx.strokeRect(cursor.x * step + 2, cursor.y * step + 2, step - 4, step - 4); }
    }
  }

  function showNotice(text = '') {
    $('custom-shape-status').textContent = text;
    const global = $('shape-library-status'); global.textContent = persistentNotice; global.hidden = !persistentNotice;
  }

  function renderSavedList() {
    const list = $('custom-shape-list'); list.replaceChildren();
    if (!patterns.length) {
      const empty = document.createElement('p'); empty.className = 'custom-shape-empty';
      empty.textContent = 'No custom shapes yet. Create one to add it to the spell picker.'; list.append(empty);
    }
    for (const pattern of patterns) {
      const row = document.createElement('article'); row.className = 'custom-shape-row'; row.dataset.customShape = pattern.id;
      const preview = document.createElement('canvas'); preview.width = 64; preview.height = 64; preview.className = 'custom-shape-preview'; preview.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.className = 'custom-shape-name'; name.textContent = pattern.name;
      const meta = document.createElement('small'); meta.textContent = `${pattern.cells.length} blocks · 16 × 16`;
      const label = document.createElement('div'); label.className = 'custom-shape-copy'; label.append(name, meta);
      const actions = document.createElement('div'); actions.className = 'custom-shape-actions';
      for (const action of ['edit', 'delete']) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-quiet';
        button.textContent = action === 'edit' ? 'Edit' : 'Delete'; button.dataset.customAction = action; button.dataset.customId = pattern.id;
        button.setAttribute('aria-label', `${action === 'edit' ? 'Edit' : 'Delete'} ${pattern.name}`); actions.append(button);
      }
      row.append(preview, label, actions); list.append(row); paintMask(preview, pattern.cells);
    }
  }

  function notify(event) {
    renderSavedList();
    for (const callback of [...subscribers]) { try { callback(Object.freeze({ ...event })); } catch {} }
  }

  function readInitialStore() {
    try {
      const stored = decodeStore(root.localStorage.getItem(STORAGE_KEY)); patterns = stored.patterns;
      if (stored.overflow) persistentNotice = 'Only the first 50 valid saved shapes are shown. Existing storage has not been changed.';
      else if (stored.ignored) persistentNotice = 'Some saved shape entries could not be read. Valid shapes are available; existing storage has not been changed.';
    } catch { persistentNotice = 'Saved shapes could not be read. You can still create shapes for this tab; existing storage has not been changed.'; }
  }

  function persistEdits() {
    try {
      const stored = decodeStore(root.localStorage.getItem(STORAGE_KEY));
      if (stored.overflow) throw new Error('The stored library exceeds 50 shapes.');
      const merged = new Map(stored.patterns.map(pattern => [pattern.id, pattern]));
      for (const [id, pattern] of sessionEdits) { if (pattern) merged.set(id, pattern); else merged.delete(id); }
      if (merged.size > MAX_SHAPES) throw new Error('The stored library is full.');
      const next = [...merged.values()];
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, patterns: next }));
      patterns = next; sessionEdits.clear(); persistentNotice = ''; return true;
    } catch {
      persistentNotice = 'Shape changes are kept for this tab only. Browser storage is unavailable or full; keep this tab open to use them.';
      return false;
    }
  }

  function allowed() {
    return !$('setup').hidden || !$('game').hidden && $('game').dataset.phase === 'choose';
  }

  function updateEditor() {
    if (!dialog.open || editor.hidden) return;
    paintMask(board, cells, true);
    $('shape-editor-count').textContent = `${cells.size} / 256 blocks`;
    $('shape-editor-undo').disabled = history.length === 0;
    $('shape-editor-clear').disabled = cells.size === 0;
    board.setAttribute('aria-label', `16 by 16 custom shape editor. Row ${cursor.y + 1}, column ${cursor.x + 1}. ${tool === 'draw' ? 'Draw' : 'Erase'} tool. ${cells.size} blocks.`);
    for (const button of document.querySelectorAll('[data-editor-tool]')) button.setAttribute('aria-pressed', String(button.dataset.editorTool === tool));
  }

  function finishStroke() {
    if (!stroke) return;
    const previous = stroke; stroke = null;
    if (board.hasPointerCapture?.(previous.pointerId)) board.releasePointerCapture(previous.pointerId);
    if (previous.changed) { history.push(previous.before); if (history.length > 100) history.shift(); }
    updateEditor();
  }

  function open(id) {
    if (!allowed() || dialog.open) return false;
    const existing = id === undefined || id === null ? null : patterns.find(pattern => pattern.id === id);
    if (id !== undefined && id !== null && !existing) { showNotice('That saved shape is no longer available.'); return false; }
    editingId = existing?.id || null; cells = new Set(existing?.cells || []); history = []; tool = 'draw'; stroke = null;
    cursor = { x: 7, y: 7 }; $('shape-name').value = existing?.name || `Custom ${patterns.length + 1}`;
    $('shape-editor-title').textContent = existing ? 'Edit your shape' : 'Create a shape';
    $('save-shape').textContent = existing ? 'Save changes' : 'Create shape';
    $('shape-editor-status').textContent = persistentNotice || 'Draw at least one block, then save your pattern.';
    editor.hidden = false; dialog.showModal();
    root.requestAnimationFrame(() => { updateEditor(); board.focus({ preventScroll: true }); });
    return true;
  }

  function close() { finishStroke(); if (dialog.open) dialog.close(); editor.hidden = true; }
  function cellAt(event) {
    const rect = board.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return null;
    return { x: Math.min(15, Math.floor((event.clientX - rect.left) / rect.width * SIZE)), y: Math.min(15, Math.floor((event.clientY - rect.top) / rect.height * SIZE)) };
  }
  function mark(point) {
    const id = point.y * SIZE + point.x;
    const changed = tool === 'draw' ? !cells.has(id) : cells.has(id);
    if (tool === 'draw') cells.add(id); else cells.delete(id);
    if (stroke) stroke.changed ||= changed;
    cursor = point;
  }
  function line(from, to) {
    let x = from.x, y = from.y; const dx = Math.abs(to.x - x), sx = x < to.x ? 1 : -1;
    const dy = -Math.abs(to.y - y), sy = y < to.y ? 1 : -1; let error = dx + dy;
    while (true) { mark({ x, y }); if (x === to.x && y === to.y) break; const doubled = 2 * error; if (doubled >= dy) { error += dy; x += sx; } if (doubled <= dx) { error += dx; y += sy; } }
  }

  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || stroke || !dialog.open) return;
    const point = cellAt(event); if (!point) return;
    event.preventDefault(); board.focus({ preventScroll: true });
    stroke = { pointerId: event.pointerId, before: [...cells], last: point, changed: false };
    board.setPointerCapture(event.pointerId); mark(point); updateEditor();
  });
  board.addEventListener('pointermove', event => {
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.preventDefault(); const point = cellAt(event);
    if (!point) { stroke.last = null; return; }
    if (stroke.last) line(stroke.last, point); else mark(point);
    stroke.last = point; updateEditor();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) board.addEventListener(type, event => { if (stroke?.pointerId === event.pointerId) finishStroke(); });
  board.addEventListener('keydown', event => {
    if (!dialog.open) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault(); const [x, y] = moves[event.key]; cursor = { x: Math.max(0, Math.min(15, cursor.x + x)), y: Math.max(0, Math.min(15, cursor.y + y)) }; updateEditor();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); const before = [...cells]; const had = cells.has(cursor.y * SIZE + cursor.x); mark(cursor);
      if (had !== cells.has(cursor.y * SIZE + cursor.x)) { history.push(before); if (history.length > 100) history.shift(); } updateEditor();
    }
  });
  for (const event of ['focus', 'blur']) board.addEventListener(event, updateEditor);
  for (const button of document.querySelectorAll('[data-editor-tool]')) button.addEventListener('click', () => { finishStroke(); tool = button.dataset.editorTool; updateEditor(); });
  $('shape-editor-undo').addEventListener('click', () => { finishStroke(); if (history.length) cells = new Set(history.pop()); updateEditor(); });
  $('shape-editor-clear').addEventListener('click', () => { finishStroke(); if (cells.size) { history.push([...cells]); cells.clear(); } updateEditor(); });
  for (const id of ['close-shape-editor', 'cancel-shape-editor']) $(id).addEventListener('click', close);
  dialog.addEventListener('close', () => { finishStroke(); editor.hidden = true; });
  dialog.addEventListener('cancel', () => { finishStroke(); editor.hidden = true; });
  $('shape-editor-form').addEventListener('submit', event => {
    event.preventDefault(); if (!dialog.open || editor.hidden || !allowed()) return; finishStroke();
    try {
      if (!editingId && patterns.length >= MAX_SHAPES) throw new Error('You have 50 saved shapes. Edit or delete one before creating another.');
      let id = editingId || `custom-${root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
      if (!editingId) { const base = id; let suffix = 1; while (patterns.some(pattern => pattern.id === id)) id = `${base}-${suffix++}`; }
      const pattern = R.createPattern({ id, name: $('shape-name').value.trim(), cells: [...cells] }, SIZE);
      const next = new Map(patterns.map(value => [value.id, value])); next.set(id, pattern); patterns = [...next.values()];
      sessionEdits.set(id, pattern); const persisted = persistEdits(); editingId = id;
      close(); notify({ type: 'save', id }); showNotice(persisted ? `${pattern.name} saved on this device.` : persistentNotice);
    } catch (error) { $('shape-editor-status').textContent = error.message || 'Give your shape a name and draw at least one block.'; }
  });
  for (const id of ['open-shape-editor', 'edit-shapes-ingame']) $(id).addEventListener('click', () => open());
  $('custom-shape-list').addEventListener('click', event => {
    const button = event.target.closest('[data-custom-action]'); if (!button || !allowed()) return;
    const id = button.dataset.customId, pattern = patterns.find(value => value.id === id); if (!pattern) return;
    if (button.dataset.customAction === 'edit') { open(id); return; }
    if (!root.confirm(`Delete “${pattern.name}”? This removes it from your saved shape library.`)) return;
    patterns = patterns.filter(value => value.id !== id); sessionEdits.set(id, null);
    const persisted = persistEdits(); notify({ type: 'delete', id }); showNotice(persisted ? `${pattern.name} deleted.` : persistentNotice);
  });
  root.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      const remote = decodeStore(root.localStorage.getItem(STORAGE_KEY)), merged = new Map(remote.patterns.map(pattern => [pattern.id, pattern]));
      for (const [id, pattern] of sessionEdits) { if (pattern) merged.set(id, pattern); else merged.delete(id); }
      // Session edits remain usable even when a previous write was blocked.
      const pending = [...sessionEdits.values()].filter(Boolean), rest = [...merged.values()].filter(pattern => !sessionEdits.has(pattern.id));
      patterns = [...pending, ...rest].slice(0, MAX_SHAPES);
      if (!sessionEdits.size) persistentNotice = remote.overflow ? 'Only the first 50 valid saved shapes are shown. Existing storage has not been changed.' : remote.ignored ? 'Some saved shape entries could not be read. Valid shapes are available; existing storage has not been changed.' : '';
      notify({ type: 'reload' }); showNotice(persistentNotice);
    } catch { persistentNotice ||= 'Saved shapes could not be refreshed. Your current shapes remain available in this tab.'; showNotice(persistentNotice); }
  });
  root.addEventListener('resize', () => { if (!dialog.open || renderRequest) return; renderRequest = root.requestAnimationFrame(() => { renderRequest = 0; updateEditor(); }); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (dialog.open) updateEditor(); }).observe(board);

  readInitialStore(); renderSavedList(); showNotice(persistentNotice);
  root.GlyphShapeLibrary = Object.freeze({
    list: () => [...patterns], get: id => patterns.find(pattern => pattern.id === id) || null,
    subscribe: callback => { if (typeof callback !== 'function') throw new TypeError('A shape library subscriber must be a function.'); subscribers.add(callback); return () => subscribers.delete(callback); },
    open,
  });
})(window);
