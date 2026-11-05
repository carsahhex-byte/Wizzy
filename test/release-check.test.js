import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../scripts/release-check.js', import.meta.url), 'utf8');
const current = '111111111111', next = '222222222222';
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ id = current, protocol = 'https:', hash = '#battle', fetchImpl } = {}) {
  const documentEvents = new Map(), windowEvents = new Map(), redirects = [], requests = [];
  const element = tag => ({
    tag, style: {}, attributes: {}, children: [], listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    append(...children) { this.children.push(...children); },
  });
  const body = element('body');
  const document = {
    baseURI: 'https://example.test/Wizzy/wizzy-111111111111.html', body,
    querySelector: () => ({ content: id }),
    addEventListener(name, callback) { documentEvents.set(name, callback); },
    createElement: element,
    getElementById(value) { return body.children.find(child => child.id === value); },
  };
  const location = { protocol, origin: 'https://example.test', hash, replace: url => redirects.push(url) };
  vm.runInNewContext(source, {
    document, location, URL, AbortController, setTimeout, clearTimeout,
    window: { addEventListener: (name, callback) => windowEvents.set(name, callback) },
    fetch: async (...args) => {
      requests.push(args);
      return fetchImpl ? fetchImpl(...args) : { ok: true, json: async () => ({ id: current, launch: `./wizzy-${current}.html` }) };
    },
  });
  return { body, documentEvents, windowEvents, redirects, requests };
}

test('matching releases keep the current page and bypass cached build metadata', async () => {
  const state = harness();
  await tick();
  assert.equal(state.requests.length, 1);
  const [url, options] = state.requests[0];
  assert.equal(new URL(url).pathname, '/Wizzy/build-info.json');
  assert.match(new URL(url).searchParams.get('check'), /^\d+$/);
  assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'omit');
  assert.deepEqual(state.redirects, []);
  assert.equal(state.body.children.length, 0);
});

test('an untouched stale page redirects to the fresh entry and keeps the battle route', async () => {
  const state = harness({ fetchImpl: async () => ({ ok: true, json: async () => ({ id: next, launch: `./wizzy-${next}.html` }) }) });
  await tick();
  assert.deepEqual(state.redirects, [`https://example.test/Wizzy/wizzy-${next}.html#battle`]);
});

test('interaction while checking preserves play until the user loads the update', async () => {
  let respond;
  const state = harness({ fetchImpl: () => new Promise(resolve => { respond = resolve; }) });
  state.documentEvents.get('pointerdown')();
  respond({ ok: true, json: async () => ({ id: next, launch: `./wizzy-${next}.html` }) });
  await tick();
  assert.deepEqual(state.redirects, []);
  const notice = state.body.children[0];
  assert.equal(notice.id, 'wizzy-release-update');
  assert.equal(notice.attributes.role, 'status');
  assert.equal(notice.children[1].textContent, 'Load latest game');
  notice.children[1].listeners.click();
  assert.deepEqual(state.redirects, [`https://example.test/Wizzy/wizzy-${next}.html#battle`]);
});

test('malformed, legacy and external launch metadata never navigates the game', async () => {
  for (const info of [
    { id: next },
    { id: 'bad', launch: './wizzy-bad.html' },
    { id: next, launch: 'https://elsewhere.test/game.html' },
    { id: next, launch: `../wizzy-${next}.html` },
    { id: next, launch: `./wizzy-${current}.html` },
  ]) {
    const state = harness({ fetchImpl: async () => ({ ok: true, json: async () => info }) });
    await tick();
    assert.deepEqual(state.redirects, []);
    assert.equal(state.body.children.length, 0);
  }
});

test('offline and missing metadata do not interrupt the existing game', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => ({ ok: false })]) {
    const state = harness({ fetchImpl });
    await tick();
    assert.deepEqual(state.redirects, []);
    assert.equal(state.body.children.length, 0);
  }
});

test('development and file editions do not make release requests', async () => {
  for (const options of [{ id: 'development' }, { protocol: 'file:' }]) {
    const state = harness(options);
    await tick();
    assert.equal(state.requests.length, 0);
    assert.deepEqual(state.redirects, []);
  }
});

test('returning through browser history checks again and defaults an empty route to title', async () => {
  let calls = 0;
  const state = harness({ hash: '', fetchImpl: async () => ({ ok: true, json: async () => {
    const id = calls++ ? next : current;
    return { id, launch: `./wizzy-${id}.html` };
  } }) });
  await tick();
  state.windowEvents.get('pageshow')({ persisted: true });
  await tick();
  assert.equal(state.requests.length, 2);
  assert.deepEqual(state.redirects, [`https://example.test/Wizzy/wizzy-${next}.html#title`]);
});
