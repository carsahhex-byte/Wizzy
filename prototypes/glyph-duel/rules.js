(function (root) {
  'use strict';

  const SHAPES = Object.freeze({ circle: 'Circle', square: 'Square', triangle: 'Triangle' });

  function gridSize(value) {
    if (!Number.isSafeInteger(value) || value < 12 || value > 128) {
      throw new RangeError('Grid size must be a whole number from 12 to 128.');
    }
    return value;
  }

  function finiteNumber(value, name, minimum = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
      throw new RangeError(name + ' must be a finite number at least ' + minimum + '.');
    }
    return value;
  }

  function traceLine(cells, size, start, end) {
    let x = start[0], y = start[1];
    const dx = Math.abs(end[0] - x), sx = x < end[0] ? 1 : -1;
    const dy = -Math.abs(end[1] - y), sy = y < end[1] ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      cells.add(y * size + x);
      if (x === end[0] && y === end[1]) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }

  // Two rasterized sides of a sharp polygon tip can share a one-cell stem.
  // Remove only those terminal pixels; the remaining outline stays a closed loop.
  function removeTerminalPixels(cells, size) {
    let removed;
    do {
      removed = [];
      for (const cell of cells) {
        const x = cell % size, y = Math.floor(cell / size);
        let neighbors = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (ox || oy) {
            const nx = x + ox, ny = y + oy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size && cells.has(ny * size + nx)) neighbors++;
          }
        }
        if (neighbors < 2) removed.push(cell);
      }
      for (const cell of removed) cells.delete(cell);
    } while (removed.length);
  }

  function getPattern(shape, size = 16) {
    size = gridSize(size);
    if (!Object.prototype.hasOwnProperty.call(SHAPES, shape)) throw new RangeError('Choose circle, square, or triangle.');
    const center = Math.floor(size / 2), radius = Math.floor(size / 3), cells = new Set();
    if (shape === 'circle') {
      let x = radius, y = 0, error = 1 - radius;
      while (x >= y) {
        for (const point of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
          cells.add((center + point[1]) * size + center + point[0]);
        }
        y++;
        if (error < 0) error += 2 * y + 1;
        else { x--; error += 2 * (y - x) + 1; }
      }
    } else {
      let points;
      if (shape === 'square') {
        points = [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]];
      } else {
        points = [[0, -radius], [radius, radius], [-radius, radius]];
      }
      points = points.map(point => [Math.round(center + point[0]), Math.round(center + point[1])]);
      points.forEach((point, index) => traceLine(cells, size, point, points[(index + 1) % points.length]));
      removeTerminalPixels(cells, size);
    }
    const sorted = Object.freeze(Array.from(cells).sort((a, b) => a - b));
    return Object.freeze({ id: shape, name: SHAPES[shape], size, cells: sorted, budget: Math.ceil(sorted.length * 115 / 100) });
  }

  /** Custom test masks may be disconnected or filled; only their data is constrained. */
  function createPattern(definition, size = 16) {
    size = gridSize(size);
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new TypeError('A custom pattern must be an object.');
    if (typeof definition.id !== 'string' || !/^custom-[A-Za-z0-9_-]+$/.test(definition.id)) {
      throw new RangeError('Custom pattern IDs must start with custom- and contain letters, numbers, underscores or hyphens.');
    }
    if (typeof definition.name !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(definition.name)) {
      throw new RangeError('Custom pattern names must be a single line without control characters.');
    }
    const name = definition.name.trim();
    if (!name.length || name.length > 40) throw new RangeError('Custom pattern names must contain 1 to 40 characters.');
    const source = definition.cells;
    if (source === null || source === undefined || typeof source === 'string' || typeof source[Symbol.iterator] !== 'function') {
      throw new TypeError('Custom pattern cells must be iterable cell IDs.');
    }
    const cells = Object.freeze(normalizedCells(source, size, 'Custom pattern'));
    if (!cells.length) throw new RangeError('Custom patterns need at least one cell.');
    return Object.freeze({ id: definition.id, name, size, cells,
      budget: Math.min(size * size, Math.ceil(cells.length * 115 / 100)), custom: true });
  }

  function normalizedCells(input, size, name) {
    if (input && typeof input === 'object' && 'cells' in input && 'size' in input && input.size !== size) {
      throw new RangeError(name + ' uses a different grid size.');
    }
    const values = input && typeof input === 'object' && 'cells' in input ? input.cells : input;
    if (values === null || values === undefined) return [];
    if (typeof values === 'string' || typeof values[Symbol.iterator] !== 'function') {
      throw new TypeError(name + ' must contain iterable cell IDs.');
    }
    const cells = new Set();
    for (const cell of values) {
      if (!Number.isSafeInteger(cell) || cell < 0 || cell >= size * size) throw new RangeError(name + ' has an invalid cell ID.');
      cells.add(cell);
    }
    return Array.from(cells).sort((a, b) => a - b);
  }

  /** Maximum-cardinality one-to-one matching, not independently dilated hits. */
  function scoreDrawing(drawn, target, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Scoring options must be an object.');
    const patternSize = target && typeof target === 'object' && 'cells' in target ? target.size : undefined;
    const size = gridSize(options.size === undefined ? patternSize === undefined ? 16 : patternSize : options.size);
    const tolerance = options.tolerance === undefined ? 1 : options.tolerance;
    if (tolerance !== 0 && tolerance !== 1) throw new RangeError('Tolerance must be zero or one cell.');
    const drawing = normalizedCells(drawn, size, 'Drawing'), goal = normalizedCells(target, size, 'Target');
    const targetIndices = new Map(goal.map((cell, index) => [cell, index]));
    const adjacency = drawing.map(cell => {
      const x = cell % size, y = Math.floor(cell / size), neighbors = [];
      for (let oy = -tolerance; oy <= tolerance; oy++) for (let ox = -tolerance; ox <= tolerance; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const index = targetIndices.get(ny * size + nx);
        if (index !== undefined) neighbors.push({ index, distance: ox * ox + oy * oy });
      }
      return neighbors.sort((a, b) => a.distance - b.distance || goal[a.index] - goal[b.index]).map(entry => entry.index);
    });
    const owner = Array(goal.length).fill(-1);
    function match(drawingIndex, visited) {
      for (const targetIndex of adjacency[drawingIndex]) {
        if (visited.has(targetIndex)) continue;
        visited.add(targetIndex);
        if (owner[targetIndex] === -1 || match(owner[targetIndex], visited)) {
          owner[targetIndex] = drawingIndex;
          return true;
        }
      }
      return false;
    }
    for (let index = 0; index < drawing.length; index++) match(index, new Set());
    const matchedPairs = [], matchedDrawing = new Set(), matchedTarget = new Set();
    owner.forEach((drawingIndex, targetIndex) => {
      if (drawingIndex !== -1) {
        const drawnCell = drawing[drawingIndex], targetCell = goal[targetIndex];
        matchedDrawing.add(drawnCell); matchedTarget.add(targetCell);
        matchedPairs.push({ drawn: drawnCell, target: targetCell });
      }
    });
    matchedPairs.sort((a, b) => a.drawn - b.drawn);
    const hits = matchedPairs.length, missing = goal.length - hits, extra = drawing.length - hits;
    const total = drawing.length + goal.length;
    return {
      hits, missing, extra, drawnCount: drawing.length, targetCount: goal.length, size, tolerance,
      accuracy: total ? 200 * hits / total : 100,
      precision: drawing.length ? hits / drawing.length : goal.length ? 0 : 1,
      recall: goal.length ? hits / goal.length : drawing.length ? 0 : 1,
      correctCells: drawing.filter(cell => matchedDrawing.has(cell)),
      matchedTargetCells: goal.filter(cell => matchedTarget.has(cell)),
      missingCells: goal.filter(cell => !matchedTarget.has(cell)),
      extraCells: drawing.filter(cell => !matchedDrawing.has(cell)), matchedPairs,
    };
  }

  function resolveAttack(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Attack settings must be an object.');
    const accuracy = (value, name) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be finite.');
      return Math.min(100, Math.max(0, value));
    };
    const attackerAccuracy = accuracy(options.attackerAccuracy, 'Attacker accuracy');
    const defenderAccuracy = accuracy(options.defenderAccuracy, 'Defender accuracy');
    const basePower = finiteNumber(options.basePower === undefined ? 30 : options.basePower, 'Base power');
    const defenderHp = finiteNumber(options.defenderHp === undefined ? 100 : options.defenderHp, 'Defender HP');
    const damage = Math.ceil(basePower * attackerAccuracy / 100 * (1 - defenderAccuracy / 100));
    return { damage, remainingHp: Math.max(0, defenderHp - damage), defenderHp, basePower, attackerAccuracy, defenderAccuracy };
  }

  function getDrawSeconds(round, settings = {}) {
    if (!Number.isSafeInteger(round) || round < 1) throw new RangeError('Round must be a positive whole number.');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Timing settings must be an object.');
    const start = finiteNumber(settings.startSeconds === undefined ? 12 : settings.startSeconds, 'Starting seconds', Number.MIN_VALUE);
    const minimum = finiteNumber(settings.minSeconds === undefined ? 4 : settings.minSeconds, 'Minimum seconds', Number.MIN_VALUE);
    const decrement = finiteNumber(settings.decrement === undefined ? 1 : settings.decrement, 'Seconds decrement');
    if (minimum > start) throw new RangeError('Minimum seconds cannot exceed starting seconds.');
    return Math.max(minimum, start - (round - 1) * decrement);
  }

  root.GlyphDuelRules = Object.freeze({ getPattern, createPattern, scoreDrawing, resolveAttack, getDrawSeconds });
})(typeof window !== 'undefined' ? window : globalThis);
