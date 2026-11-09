import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('./rules.js', import.meta.url), 'utf8'), context);
const { getPattern, createPattern, scoreDrawing, resolveAttack, getDrawSeconds } = context.GlyphDuelRules;
const shapes = ['circle', 'square', 'triangle'];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);
const ownArray = array => Array.from(array);

function neighbors(cell, size, diagonal = true) {
  const x = cell % size, y = Math.floor(cell / size), result = [];
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!(ox || oy) || !diagonal && ox && oy) continue;
    const nx = x + ox, ny = y + oy;
    if (nx >= 0 && nx < size && ny >= 0 && ny < size) result.push(ny * size + nx);
  }
  return result;
}

test('classic script exposes its pure API on browser window or node globalThis', () => {
  assert.deepEqual(Object.keys(context.GlyphDuelRules).sort(), ['createPattern', 'getDrawSeconds', 'getPattern', 'resolveAttack', 'scoreDrawing']);
  const browser = { window: {} };
  vm.runInNewContext(readFileSync(new URL('./rules.js', import.meta.url), 'utf8'), browser);
  assert.equal(typeof browser.window.GlyphDuelRules.scoreDrawing, 'function');
});

test('all three masks are deterministic sorted outlines with comparable size and proportional ink budgets', () => {
  const boxes = [];
  for (const shape of shapes) {
    const pattern = getPattern(shape), repeated = getPattern(shape);
    assert.equal(pattern.id, shape); assert.equal(pattern.size, 16);
    assert.deepEqual(pattern, repeated);
    assert.ok(Object.isFrozen(pattern) && Object.isFrozen(pattern.cells));
    assert.deepEqual(ownArray(pattern.cells), ownArray(pattern.cells).sort((a, b) => a - b));
    assert.equal(new Set(pattern.cells).size, pattern.cells.length);
    assert.equal(pattern.budget, Math.ceil(pattern.cells.length * 1.15));
    assert.ok(pattern.cells.length >= 24 && pattern.cells.length <= 48, `${shape}: outline instead of a filled silhouette`);
    assert.ok(pattern.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 16 * 16));
    assert.ok(!pattern.cells.includes(8 * 16 + 8), `${shape}: center is empty`);
    const xs = pattern.cells.map(cell => cell % 16), ys = pattern.cells.map(cell => Math.floor(cell / 16));
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    assert.ok(box[0] >= 2 && box[1] >= 2 && box[2] <= 14 && box[3] <= 14);
    assert.ok(Math.abs((box[0] + box[2]) / 2 - 8) <= 1);
    assert.ok(Math.abs((box[1] + box[3]) / 2 - 8) <= 1);
    boxes.push(box);
  }
  for (const box of boxes) assert.ok(box[2] - box[0] >= 9 && box[3] - box[1] >= 9);
});

test('every outline is one connected closed line with no terminal pixels or gap into its center', () => {
  for (const size of [12, 16, 24, 32]) for (const shape of shapes) {
    const pattern = getPattern(shape, size), cells = new Set(pattern.cells), visited = new Set([pattern.cells[0]]), queue = [...visited];
    for (let i = 0; i < queue.length; i++) for (const next of neighbors(queue[i], size)) {
      if (cells.has(next) && !visited.has(next)) { visited.add(next); queue.push(next); }
    }
    assert.equal(visited.size, cells.size, `${shape} at ${size}: connected`);
    assert.ok(pattern.cells.every(cell => neighbors(cell, size).filter(next => cells.has(next)).length >= 2), `${shape}: no dangling tips`);
    const outside = new Set(), flood = [];
    for (let cell = 0; cell < size * size; cell++) {
      const x = cell % size, y = Math.floor(cell / size);
      if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && !cells.has(cell)) { outside.add(cell); flood.push(cell); }
    }
    for (let i = 0; i < flood.length; i++) for (const next of neighbors(flood[i], size, false)) {
      if (!cells.has(next) && !outside.has(next)) { outside.add(next); flood.push(next); }
    }
    assert.ok(!outside.has(Math.floor(size / 2) * size + Math.floor(size / 2)), `${shape}: outside cannot leak into its center`);
  }
});

test('perfect and empty drawings score exact endpoints without mutating targets or ink', () => {
  for (const shape of shapes) {
    const target = getPattern(shape), ink = new Set(target.cells), snapshot = ownArray(ink);
    const perfect = scoreDrawing(ink, target, { tolerance: 0 });
    assert.deepEqual([perfect.accuracy, perfect.hits, perfect.missing, perfect.extra, perfect.precision, perfect.recall], [100, ink.size, 0, 0, 1, 1]);
    assert.deepEqual(ownArray(perfect.correctCells), snapshot); assert.equal(perfect.missingCells.length, 0); assert.equal(perfect.extraCells.length, 0);
    const empty = scoreDrawing([], target);
    assert.deepEqual([empty.accuracy, empty.hits, empty.missing, empty.extra, empty.precision, empty.recall], [0, 0, target.cells.length, 0, 0, 0]);
    assert.deepEqual(ownArray(empty.missingCells), ownArray(target.cells));
    assert.deepEqual(ownArray(ink), snapshot);
  }
});

test('missing cells and extra ink both reduce Dice accuracy while precision and recall retain their meanings', () => {
  const target = getPattern('square'), half = ownArray(target.cells).slice(0, target.cells.length / 2);
  const partial = scoreDrawing(half, target, { tolerance: 0 });
  close(partial.accuracy, 100 * 2 * half.length / (half.length + target.cells.length));
  assert.equal(partial.precision, 1); assert.equal(partial.recall, .5);
  const extra = scoreDrawing([...target.cells, 0], target, { tolerance: 0 });
  close(extra.accuracy, 100 * 2 * target.cells.length / (2 * target.cells.length + 1));
  assert.equal(extra.recall, 1); assert.ok(extra.precision < 1); assert.deepEqual(ownArray(extra.extraCells), [0]);
});

test('one-cell Chebyshev tolerance accepts a complete diagonal translation, and exact mode does not', () => {
  for (const shape of shapes) {
    const target = getPattern(shape), moved = target.cells.map(cell => cell + target.size + 1);
    const tolerant = scoreDrawing(moved, target, { tolerance: 1 });
    assert.equal(tolerant.accuracy, 100); assert.equal(tolerant.hits, target.cells.length);
    assert.ok(scoreDrawing(moved, target, { tolerance: 0 }).accuracy < 100);
    assert.ok(tolerant.matchedPairs.every(pair => Math.abs(pair.drawn % target.size - pair.target % target.size) <= 1
      && Math.abs(Math.floor(pair.drawn / target.size) - Math.floor(pair.target / target.size)) <= 1));
  }
});

test('maximum matching reassigns an exact neighbor when that permits another legitimate match', () => {
  const score = scoreDrawing(new Set([1, 2]), new Set([0, 1]), { size: 16, tolerance: 1 });
  assert.equal(score.hits, 2); assert.equal(score.accuracy, 100);
  assert.deepEqual(ownArray(score.matchedPairs).map(pair => [pair.drawn, pair.target]), [[1, 0], [2, 1]]);
});

test('several nearby drawn cells cannot reuse one target cell, and duplicate IDs add no credit', () => {
  const score = scoreDrawing([0, 1, 2], [1], { tolerance: 1 });
  assert.equal(score.hits, 1); assert.equal(score.missing, 0); assert.equal(score.extra, 2); assert.equal(score.accuracy, 50);
  assert.equal(new Set(score.matchedPairs.map(pair => pair.target)).size, score.hits);
  assert.equal(new Set(score.matchedPairs.map(pair => pair.drawn)).size, score.hits);
  assert.equal(scoreDrawing([1, 1, 1], [1], { tolerance: 0 }).accuracy, 100);
  assert.equal(scoreDrawing([1], [0, 1, 2], { tolerance: 1 }).hits, 1);
  assert.equal(scoreDrawing([255], [255], { tolerance: 0 }).size, 16, 'bare masks use the new default grid');
});

test('filling the whole grid always gets low accuracy, even with forgiving matching', () => {
  const filled = Array.from({ length: 16 * 16 }, (_, cell) => cell);
  for (const shape of shapes) {
    const target = getPattern(shape), score = scoreDrawing(filled, target);
    assert.equal(score.hits, target.cells.length); assert.equal(score.recall, 1);
    assert.ok(score.accuracy <= 28, `${shape}: fill exploit earns ${score.accuracy}`);
    assert.equal(score.extra, filled.length - target.cells.length);
    assert.ok(filled.length > target.budget);
  }
});

test('attack damage rounds up once, respects defense and accuracy clamps, and never produces negative HP', () => {
  assert.deepEqual(Object.values(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 0 })), [30, 70, 100, 30, 100, 0]);
  assert.equal(resolveAttack({ attackerAccuracy: 50, defenderAccuracy: 50 }).damage, 8);
  assert.equal(resolveAttack({ attackerAccuracy: 0, defenderAccuracy: 0 }).damage, 0);
  assert.equal(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 100 }).damage, 0);
  assert.equal(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 99 }).damage, 1, 'positive unblocked power rounds up');
  assert.equal(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 99.999 }).damage, 1);
  assert.equal(resolveAttack({ attackerAccuracy: .001, defenderAccuracy: 99.999 }).damage, 1);
  assert.equal(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 0, basePower: 0 }).damage, 0, 'zero power never becomes flat damage');
  assert.equal(resolveAttack({ attackerAccuracy: 150, defenderAccuracy: -50 }).damage, 30);
  assert.equal(resolveAttack({ attackerAccuracy: -1, defenderAccuracy: 120 }).damage, 0);
  assert.equal(resolveAttack({ attackerAccuracy: 100, defenderAccuracy: 0, basePower: 200, defenderHp: 10 }).remainingHp, 0);
  const input = { attackerAccuracy: 80, defenderAccuracy: 25, basePower: 40, defenderHp: 17 }, snapshot = { ...input };
  const attack = resolveAttack(input); assert.equal(attack.damage, 24); assert.equal(attack.remainingHp, 0); assert.deepEqual(input, snapshot);
});

test('one missing pixel in every canonical counter outline lets one HP of a perfect cast through', () => {
  for (const shape of shapes) {
    const target = getPattern(shape), counter = ownArray(target.cells).slice(1);
    const attackScore = scoreDrawing(target.cells, target), counterScore = scoreDrawing(counter, target);
    assert.equal(attackScore.accuracy, 100); assert.equal(counterScore.missing, 1); assert.equal(counterScore.extra, 0);
    assert.ok(counterScore.accuracy > 98 && counterScore.accuracy < 100);
    const outcome = resolveAttack({ attackerAccuracy: attackScore.accuracy, defenderAccuracy: counterScore.accuracy });
    assert.equal(outcome.damage, 1); assert.equal(outcome.remainingHp, 99);
    assert.equal(resolveAttack({ attackerAccuracy: attackScore.accuracy, defenderAccuracy: 100 }).damage, 0);
  }
});

test('draw time decays per round to its floor and accepts valid custom settings', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, index) => getDrawSeconds(index + 1)), [12, 11, 10, 9, 8, 7, 6, 5, 4, 4, 4, 4]);
  assert.equal(getDrawSeconds(5, { startSeconds: 20, minSeconds: 3, decrement: 2 }), 12);
  assert.equal(getDrawSeconds(100, { startSeconds: 20, minSeconds: 3, decrement: 2 }), 3);
  assert.equal(getDrawSeconds(10, { startSeconds: 8, minSeconds: 8, decrement: 0 }), 8);
});

test('invalid grid, cell, tolerance, attack and timer settings are rejected rather than coerced', () => {
  for (const shape of ['star', '', '__proto__', null]) assert.throws(() => getPattern(shape));
  for (const size of [0, 11, 129, 16.5, '16', NaN]) assert.throws(() => getPattern('circle', size));
  for (const cells of [[-1], [256], [1.5], ['1'], [NaN], [Infinity], '123', {}]) assert.throws(() => scoreDrawing(cells, [1]));
  for (const tolerance of [-1, 2, .5, '1', NaN]) assert.throws(() => scoreDrawing([], [1], { tolerance }));
  assert.throws(() => scoreDrawing([], getPattern('square'), { size: 32 }));
  assert.throws(() => scoreDrawing([], [1], null));
  for (const accuracy of [NaN, Infinity, '50', null, undefined]) assert.throws(() => resolveAttack({ attackerAccuracy: accuracy, defenderAccuracy: 0 }));
  for (const basePower of [-1, NaN, Infinity, '30']) assert.throws(() => resolveAttack({ attackerAccuracy: 50, defenderAccuracy: 50, basePower }));
  for (const defenderHp of [-1, NaN, Infinity, '100']) assert.throws(() => resolveAttack({ attackerAccuracy: 50, defenderAccuracy: 50, defenderHp }));
  for (const round of [0, -1, 1.5, NaN, '1']) assert.throws(() => getDrawSeconds(round));
  for (const settings of [{ startSeconds: 0 }, { minSeconds: 0 }, { minSeconds: 13 }, { decrement: -1 }, { startSeconds: NaN }, { decrement: Infinity }, { minSeconds: '4' }, null]) assert.throws(() => getDrawSeconds(1, settings));
});

test('custom patterns trim names, sort and deduplicate ink, and freeze a copy without mutating inputs', () => {
  const cells = [255, 17, 0, 17], definition = { id: 'custom-Figure_1-2', name: '  My sigil  ', cells };
  const pattern = createPattern(definition);
  assert.equal(pattern.id, 'custom-Figure_1-2'); assert.equal(pattern.name, 'My sigil'); assert.equal(pattern.size, 16);
  assert.equal(pattern.custom, true); assert.equal(pattern.budget, 4);
  assert.deepEqual(ownArray(pattern.cells), [0, 17, 255]);
  assert.ok(Object.isFrozen(pattern) && Object.isFrozen(pattern.cells));
  assert.deepEqual(cells, [255, 17, 0, 17]); assert.equal(definition.name, '  My sigil  ');
  cells.push(42); definition.name = 'Changed';
  assert.deepEqual(ownArray(pattern.cells), [0, 17, 255]); assert.equal(pattern.name, 'My sigil');
  assert.throws(() => pattern.cells.push(42)); assert.throws(() => { pattern.name = 'Changed'; });
});

test('disconnected, singleton and arbitrary custom ink are valid targets that score perfectly against themselves', () => {
  for (const cells of [new Set([0, 255]), [88], new Uint16Array([1, 2, 19, 67, 248])]) {
    const pattern = createPattern({ id: 'custom-test', name: 'Test pattern', cells });
    const score = scoreDrawing(pattern.cells, pattern, { tolerance: 0 });
    assert.equal(score.size, 16); assert.equal(score.accuracy, 100);
    assert.equal(score.hits, pattern.cells.length); assert.equal(score.missing, 0); assert.equal(score.extra, 0);
  }
  const duplicates = createPattern({ id: 'custom-duplicates', name: 'Single pixel', cells: Array(1000).fill(3) });
  assert.equal(duplicates.cells.length, 1); assert.equal(duplicates.budget, 2, 'duplicate IDs cannot inflate the ink budget');
  function* ink() { yield 23; yield 0; yield 23; }
  assert.deepEqual(ownArray(createPattern({ id: 'custom-iterable', name: 'Iterable', cells: ink() }).cells), [0, 23]);
});

test('a filled custom board is intentionally allowed and its ink budget is capped to board area', () => {
  for (const size of [12, 16, 24, 32]) {
    const cells = Array.from({ length: size * size }, (_, cell) => cell);
    const pattern = createPattern({ id: 'custom-filled-' + size, name: 'Filled board', cells }, size);
    assert.equal(pattern.cells.length, size * size); assert.equal(pattern.budget, size * size);
    assert.equal(scoreDrawing(cells, pattern).accuracy, 100, 'filled ink is correct only when it is the actual custom target');
  }
});

test('custom pattern identifiers and single-line names are validated without unsafe coercion', () => {
  for (const id of ['circle', 'custom-', 'custom-with space', 'custom-a/b', 'custom-😀', null, undefined, 4]) {
    assert.throws(() => createPattern({ id, name: 'Valid name', cells: [0] }));
  }
  for (const name of ['', '   ', 'x'.repeat(41), 'line\nbreak', '\nValid', 'line\rbreak', '\tValid', 'bad\u0000name',
    'bad\u0085name', 'bad\u2028name', 'bad\u2029name', null, undefined, 1]) {
    assert.throws(() => createPattern({ id: 'custom-valid', name, cells: [0] }));
  }
  assert.equal(createPattern({ id: 'custom-valid', name: '  ' + 'x'.repeat(40) + '  ', cells: [0] }).name.length, 40);
  for (const definition of [null, undefined, [], 'pattern']) assert.throws(() => createPattern(definition));
});

test('custom empty or out-of-range ink and incompatible grid sizes are rejected', () => {
  for (const cells of [[], new Set(), null, undefined, {}, '1,2', [-1], [256], [1.5], ['2'], [NaN], [Infinity]]) {
    assert.throws(() => createPattern({ id: 'custom-valid', name: 'Valid', cells }));
  }
  assert.throws(() => createPattern({ id: 'custom-small', name: 'Too large', cells: [144] }, 12));
  for (const size of [0, 11, 129, 16.5, '16', null]) {
    assert.throws(() => createPattern({ id: 'custom-invalid-size', name: 'Test', cells: [0] }, size));
  }
  const pattern = createPattern({ id: 'custom-32', name: 'Large test', cells: [1023] }, 32);
  assert.equal(scoreDrawing([1023], pattern).size, 32);
  assert.throws(() => scoreDrawing([1023], pattern, { size: 16 }));
});
