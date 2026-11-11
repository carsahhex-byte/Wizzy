import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBattleScene } from '../src/battle-scene.js';
import { createSpellAnimator } from '../src/spell-animation.js';
import { ASSETS, WIZARD_SPRITES, EARTH_ANIMATION_SHEETS, GOLEM_ANIMATION_SHEETS } from '../src/assets.js';
import { IDLE_ANIMATION_SHEETS } from '../src/idle-sprites.js';

const approved = JSON.parse(await readFile(new URL('../designs/idle-wisp-free-review/metadata.json', import.meta.url)));
const approvedWizard = school => approved.wizards.find(wizard => wizard.id === school);
const schools = ['fire', 'water', 'earth'];
const nativeFacing = { fire: 'right', water: 'left', earth: 'right' };
const feet = [{ x: 236, y: 450 }, { x: 788, y: 450 }];
class Style {
  getPropertyValue(key) { return this[key] || ''; }
  getPropertyPriority() { return ''; }
  setProperty(key,value) { this[key] = String(value); }
  removeProperty(key) { delete this[key]; }
}
class Element {
  constructor(document) {
    this.ownerDocument = document; this.style = new Style(); this.dataset = {}; this.children = []; this.attributes = {};
    this.classList = { toggle: (name,enabled) => {
      const classes = new Set(this.className.split(' ')); if (enabled) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    }};
  }
  setAttribute(name,value) { this.attributes[name] = value; }
  set innerHTML(value) {
    this.children = [];
    if (value.includes('wizard-sprite')) for (const className of ['mage-shadow','wizard-sprite']) {
      const child = new Element(this.ownerDocument); child.className = className; this.append(child);
    }
  }
  append(...children) { this.children.push(...children); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = node => {
      if (selector.startsWith('.')) return node.className?.split(' ').includes(selector.slice(1));
      const match = selector.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
      if (!match) return false;
      const key = match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
      return node.dataset[key] === match[2];
    };
    const found=[];
    for (const child of this.children) {
      if (matches(child)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
}
const testGlobals = new WeakMap();
function fixture(t,{reduced=false}={}) {
  if (!testGlobals.has(t)) {
    const savedDocument = globalThis.document, savedImage = globalThis.Image;
    testGlobals.set(t,true);
    t.after(()=> {
      if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
      if (savedImage === undefined) delete globalThis.Image; else globalThis.Image = savedImage;
    });
  }
  const pending = new Map(), mediaListeners = new Set(), documentListeners = new Set(); let id = 0, now = 0;
  const media = {matches:reduced,addEventListener:(_,callback)=>mediaListeners.add(callback),
    removeEventListener:(_,callback)=>mediaListeners.delete(callback)};
  const view = {
    matchMedia: () => media, performance: {now:()=>now}, setTimeout,
    requestAnimationFrame: callback => { pending.set(++id,callback); return id; },
    cancelAnimationFrame: key => pending.delete(key),
  };
  const document = {defaultView:view,hidden:false,createElement: () => new Element(document),
    addEventListener: (name,callback) => { if (name==='visibilitychange') documentListeners.add(callback); }};
  globalThis.document = document;
  globalThis.Image = class {
    naturalWidth = 887;
    set src(value) { queueMicrotask(()=>this.onload?.()); }
    async decode() {}
  };
  const scene = createBattleScene();
  t.after(()=>scene.hide());
  return {scene,pending,wizards:scene.element.children.filter(child=>child.dataset.arenaSeat!==undefined),
    sprite:index=>scene.element.querySelector(`[data-arena-seat="${index}"]`).querySelector('.wizard-sprite'),
    tick: time => { now=time; const callbacks=[...pending.values()]; pending.clear(); callbacks.forEach(callback=>callback(time)); },
    setReduced: value => { media.matches=value; mediaListeners.forEach(callback=>callback({matches:value})); },
    setDocumentHidden: value => { document.hidden=value; documentListeners.forEach(callback=>callback()); }};
}
const players = values => values.map((school,index)=>({id:`seat-${index+1}`,school,golemActive:false}));
const ready = () => new Promise(resolve=>setImmediate(resolve));

function assertFeet(sprite,sheet,frame,index) {
  const width=sheet.sourceWidth/sheet.columns*sheet.displayScale;
  const height=sheet.sourceHeight/sheet.rows*sheet.displayScale;
  const anchor=sheet.frameAnchors[frame];
  const origin=sprite.style.transformOrigin.match(/^([\d.]+)px ([\d.]+)px$/);
  assert.ok(origin);
  assert.ok(Math.abs(Number(origin[1])-anchor.x*width)<1e-8);
  assert.ok(Math.abs(Number(origin[2])-anchor.y*height)<1e-8);
  // The parent is the logical192px standing box; its measured sole is at96,180.
  assert.equal(sprite.dataset.logicalX,'96');
  assert.equal(sprite.dataset.logicalY,'180');
  assert.equal(sprite.style.transform.includes('scaleX(-1)'),sheet.nativeFacing !== (index===0?'right':'left'));
}

test('approved clean idle metadata retains the exact sixteen-frame two-cycle blink sequence', () => {
  for (const school of schools) {
    const sheet=IDLE_ANIMATION_SHEETS[school], wizard=approvedWizard(school), source=approved.sheets[wizard.sheet];
    assert.deepEqual(sheet.animations.idle,wizard.sequence,school);
    assert.equal(sheet.frameMs,160);
    assert.equal(sheet.animations.idle.length,16);
    assert.equal(sheet.nativeFacing,nativeFacing[school]);
    for (const key of ['sourceWidth','sourceHeight','columns','rows','sourceBodyHeight']) assert.equal(sheet[key],source[key],`${school}.${key}`);
    assert.deepEqual(sheet.frameAnchors,source.frameAnchors,school);
    assert.equal(sheet.displayScale,144/source.sourceBodyHeight);
    const closed=new Set(wizard.blinkFrames);
    assert.equal(sheet.animations.idle.slice(0,8).filter(frame=>closed.has(frame)).length,0,`${school} first cycle stays open`);
    assert.equal(sheet.animations.idle.slice(8).filter(frame=>closed.has(frame)).length,1,`${school} second cycle blinks once`);
    assert.ok(Object.isFrozen(sheet) && Object.isFrozen(sheet.animations.idle));
  }
});

test('all schools use clean idle art with measured inward facing from either seat and in mirrors', t => {
  const state=fixture(t);
  for (const school of schools) for (const pairing of [[school,school],[school,'earth'],['earth',school]]) {
    state.scene.setCombatants(players(pairing));
    state.tick(0);
    for (const [index,wizard] of state.wizards.entries()) {
      const sheet=IDLE_ANIMATION_SHEETS[pairing[index]], sprite=state.sprite(index), frame=sheet.animations.idle[0];
      assert.equal(wizard.dataset.arenaSeat,String(index));
      assert.equal(wizard.dataset.element,pairing[index]);
      assert.equal(wizard.dataset.playerId,`seat-${index+1}`);
      assert.equal(wizard.dataset.direction,index===0?'right':'left');
      assert.equal(sprite.dataset.asset,sheet.asset);
      assert.equal(Number(sprite.dataset.frame),frame);
      assertFeet(sprite,sheet,frame,index);
      assert.equal(wizard.style.transform,`translate(${feet[index].x-96}px, ${feet[index].y-180}px)`);
    }
  }
});

test('every school paints its full approved blink cadence at160ms without a first-cycle blink', t => {
  for (const school of schools) {
    const state=fixture(t), sheet=IDLE_ANIMATION_SHEETS[school];
    state.scene.setCombatants(players([school,school]));
    for (let step=0;step<32;step+=1) {
      state.tick(step*160);
      for (const index of [0,1]) {
        const frame=sheet.animations.idle[step%16], sprite=state.sprite(index);
        assert.equal(Number(sprite.dataset.frame),frame,`${school} seat${index} at${step*160}ms`);
        assertFeet(sprite,sheet,frame,index);
      }
    }
    state.scene.hide();
  }
});

test('renders, stat changes and finishEntrance preserve the ongoing idle clock and blink phase', t => {
  const state=fixture(t), combatants=players(['fire','earth']);
  state.scene.setCombatants(combatants); state.tick(0); state.tick(640);
  assert.equal(state.sprite(0).dataset.frame,'4');
  for (let render=0;render<5;render+=1) {
    state.scene.setCombatants(combatants.map((player,index)=>({...player,hp:100-render,mana:index+render})));
    state.scene.setActive(render%2);
    state.scene.finishEntrance();
    assert.equal(state.sprite(0).dataset.frame,'4','rerender does not return to frame0');
    assert.equal(state.sprite(1).dataset.frame,'4');
  }
  state.tick(800);
  assert.equal(state.sprite(0).dataset.frame,'5');
  assert.equal(state.sprite(1).dataset.frame,'5');
  state.tick(1760);
  assert.equal(state.sprite(0).dataset.frame,'3','Fire reaches its second-cycle blink');
  state.scene.finishEntrance(); state.tick(1920);
  assert.equal(state.sprite(0).dataset.frame,'4','finishEntrance does not restart the cycle after a blink');
});

test('Golem form retains its approved pose sheet and returning Earth uses clean idle without losing time', t => {
  const state=fixture(t), combatants=players(['earth','earth']);
  combatants[1].golemActive=true;
  state.scene.setCombatants(combatants); state.scene.setActive(1);
  assert.equal(state.wizards[1].dataset.form,'golem');
  assert.equal(state.sprite(1).dataset.asset,GOLEM_ANIMATION_SHEETS.poses.asset);
  state.tick(0); state.tick(160);
  assert.equal(state.sprite(1).dataset.frame,'1');
  assert.equal(state.wizards[1].dataset.active,'true');
  combatants[1].golemActive=false;
  state.scene.setCombatants(combatants);
  assert.equal(state.sprite(1).dataset.asset,IDLE_ANIMATION_SHEETS.earth.asset);
  assert.equal(state.sprite(1).dataset.frame,'1');
  state.tick(640);
  assert.equal(state.sprite(1).dataset.frame,'4');
});

test('entrance keeps original Fire/Water walks and measured Earth walk before returning to clean idle', async t => {
  const state=fixture(t);
  for (const pairing of [['fire','water'],['water','earth']]) {
    state.scene.setCombatants(players(pairing));
    const key=pairing.join('-');
    assert.equal(state.scene.prepareEntrance(key),true);
    assert.equal(await state.scene.startEntrance(key),true);
    state.tick(0); state.tick(500);
    for (const [index,school] of pairing.entries()) {
      const sprite=state.sprite(index);
      if (school==='earth') {
        assert.equal(sprite.dataset.asset,EARTH_ANIMATION_SHEETS.walk.asset);
        assert.equal(sprite.dataset.logicalY,'180');
        assert.equal(sprite.style.transform.includes('scaleX(-1)'),index===1);
      } else {
        assert.equal(sprite.style.backgroundImage,`url("${ASSETS[WIZARD_SPRITES.asset]}")`);
        const row=WIZARD_SPRITES.directions[school][index===0?'right':'left'];
        assert.equal(sprite.style.backgroundPosition,`0px ${-row*192}px`);
      }
    }
    state.tick(1800);
    for (const [index,school] of pairing.entries()) assert.equal(state.sprite(index).dataset.asset,IDLE_ANIMATION_SHEETS[school].asset);
    assert.equal(state.scene.prepareEntrance(key),false);
  }
});

test('cast and hit presentation restore clean idle while its clock keeps moving', async t => {
  for (const school of schools) {
    const state=fixture(t), combatants=players([school,school]), animator=createSpellAnimator({root:state.scene.element});
    state.scene.setCombatants(combatants); state.tick(0); state.tick(640);
    const completion=animator.play({key:`clean-idle-${school}`,spellId:`${school[0].toUpperCase()+school.slice(1)}-1`,casterIndex:0,players:combatants});
    await ready(); state.tick(640);
    assert.equal(state.sprite(0).style.visibility,'hidden');
    state.tick(2500);
    assert.equal(state.sprite(0).style.visibility,'hidden','idle ticks cannot reveal a casting standing sprite');
    state.tick(3480); await completion;
    assert.notEqual(state.sprite(0).style.visibility,'hidden');
    assert.equal(state.sprite(0).dataset.asset,IDLE_ANIMATION_SHEETS[school].asset);
    assert.equal(state.sprite(1).dataset.asset,IDLE_ANIMATION_SHEETS[school].asset);
    state.tick(3520);
    assert.equal(Number(state.sprite(0).dataset.frame),IDLE_ANIMATION_SHEETS[school].animations.idle[22%16]);
    assert.equal(state.sprite(0).style.transform.includes('scaleX(-1)'),nativeFacing[school]!=='right');
    state.scene.hide();
  }
});

test('hidden scenes cancel idle callbacks and resuming cannot schedule an old hidden loop', t => {
  const state=fixture(t), combatants=players(['fire','water']);
  state.scene.setCombatants(combatants); state.tick(0); state.tick(640);
  const abandoned=[...state.pending.values()];
  state.scene.hide(); assert.equal(state.pending.size,0);
  for (const callback of abandoned) callback(10000);
  assert.equal(state.pending.size,0);
  state.tick(10000); state.scene.setCombatants(combatants); state.tick(10000);
  assert.equal(state.pending.size,1,'resuming has one shared idle loop');
  assert.equal(state.sprite(0).dataset.asset,IDLE_ANIMATION_SHEETS.fire.asset);
});

test('an abandoned idle callback cannot alter a resumed scene or replace its scheduled frame', t => {
  const state=fixture(t), combatants=players(['fire','earth']);
  state.scene.setCombatants(combatants); state.tick(0); state.tick(640);
  const abandoned=[...state.pending.values()];
  assert.equal(abandoned.length,1);
  state.scene.hide(); state.tick(10000);
  state.scene.setCombatants(combatants); state.tick(10000);
  const resumedRequests=[...state.pending.keys()];
  assert.equal(resumedRequests.length,1);
  assert.equal(state.sprite(0).dataset.frame,'4');
  assert.equal(state.sprite(1).dataset.frame,'4');
  for (const callback of abandoned) callback(50000);
  assert.deepEqual([...state.pending.keys()],resumedRequests,'the old callback cannot clear or duplicate the current request');
  assert.equal(state.sprite(0).dataset.frame,'4','the old timestamp cannot advance the resumed breathing phase');
  assert.equal(state.sprite(1).dataset.frame,'4');
  state.tick(10160);
  assert.equal(state.sprite(0).dataset.frame,'5');
  assert.equal(state.sprite(1).dataset.frame,'5');
  assert.equal(state.pending.size,1);
  state.scene.hide();
  assert.equal(state.pending.size,0,'the current request still belongs to the resumed loop and is cancellable');
});

test('reduced motion keeps clean open-eyed poses and stops all school idle scheduling', t => {
  const state=fixture(t,{reduced:true});
  state.scene.setCombatants(players(['fire','water']));
  assert.equal(state.scene.prepareEntrance('reduced'),false);
  assert.equal(state.pending.size,0);
  assert.equal(state.sprite(0).dataset.asset,IDLE_ANIMATION_SHEETS.fire.asset);
  assert.equal(state.sprite(0).dataset.frame,'0');
  assert.equal(state.sprite(1).dataset.asset,IDLE_ANIMATION_SHEETS.water.asset);
  assert.equal(state.sprite(1).dataset.frame,'8');
  const combatants=players(['earth','earth']); combatants[0].golemActive=true;
  state.scene.setCombatants(combatants);
  assert.equal(state.sprite(0).dataset.asset,GOLEM_ANIMATION_SHEETS.poses.asset);
  assert.equal(state.sprite(1).dataset.asset,IDLE_ANIMATION_SHEETS.earth.asset);
  assert.equal(state.pending.size,0);
});


test('browser visibility pauses idle time and resumes the same breathing phase', t => {
  const state=fixture(t);
  state.scene.setCombatants(players(['fire','water'])); state.tick(0); state.tick(640);
  state.setDocumentHidden(true);
  assert.equal(state.pending.size,0);
  state.tick(10000);
  assert.equal(state.sprite(0).dataset.frame,'4');
  state.setDocumentHidden(false); state.tick(10000);
  assert.equal(state.sprite(0).dataset.frame,'4','hidden wall time does not consume animation cycles');
  state.tick(10160);
  assert.equal(state.sprite(0).dataset.frame,'5');
  assert.equal(state.sprite(1).dataset.frame,'13');
});

test('a reduced-motion setting change freezes clean open eyes then resumes the retained clock', t => {
  const state=fixture(t);
  state.scene.setCombatants(players(['water','earth'])); state.tick(0); state.tick(640);
  state.setReduced(true);
  assert.equal(state.pending.size,0);
  assert.equal(state.sprite(0).dataset.frame,'8');
  assert.equal(state.sprite(1).dataset.frame,'0');
  state.tick(10000); state.setReduced(false); state.tick(10000);
  assert.equal(state.sprite(0).dataset.frame,'12');
  assert.equal(state.sprite(1).dataset.frame,'4');
  state.tick(10160);
  assert.equal(state.sprite(0).dataset.frame,'13');
  assert.equal(state.sprite(1).dataset.frame,'5');
});

test('replacement entrances cancel old animation callbacks and retain one clean idle loop', async t => {
  const state=fixture(t);
  state.scene.setCombatants(players(['fire','earth']));
  assert.equal(state.scene.prepareEntrance('old-duel'),true);
  assert.equal(await state.scene.startEntrance('old-duel'),true);
  state.tick(0); state.tick(500);
  const oldCallbacks=[...state.pending.values()];
  assert.equal(state.scene.prepareEntrance('new-duel'),true);
  assert.equal(await state.scene.startEntrance('new-duel'),true);
  for (const callback of oldCallbacks) callback(9000);
  assert.equal(state.scene.element.dataset.motion,'prepared');
  state.tick(0); state.tick(1800);
  assert.equal(state.scene.element.dataset.motion,'idle');
  assert.equal(state.pending.size,1);
  assert.equal(state.sprite(0).dataset.asset,IDLE_ANIMATION_SHEETS.fire.asset);
  assert.equal(state.sprite(1).dataset.asset,IDLE_ANIMATION_SHEETS.earth.asset);
});
