import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnhancementFlourish, getEnhancementFlourishMoment, getEnhancementVisualTier } from '../src/enhancement-animation.js';
import { createSpellAnimator } from '../src/spell-animation.js';

class Style {
  getPropertyValue(key){return this[key]||'';}
  getPropertyPriority(){return '';}
  setProperty(key,value){this[key]=String(value);}
  removeProperty(key){delete this[key];}
}
class Element {
  constructor(document){this.ownerDocument=document;this.style=new Style();this.dataset={};this.children=[];}
  setAttribute(){}
  append(...nodes){this.children.push(...nodes);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){
    const match=node=>selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1))
      :node.dataset.arenaSeat===selector.match(/^\[data-arena-seat="([01])"\]$/)?.[1];
    return this.children.flatMap(node=>[...(match(node)?[node]:[]),...node.querySelectorAll(selector)]);
  }
}
function scene({school='fire',seat=0,reduced=false,golem=false}={}){
  let id=0;const pending=new Map();
  const view={matchMedia:()=>({matches:reduced}),setTimeout,
    requestAnimationFrame:fn=>{pending.set(++id,fn);return id;},cancelAnimationFrame:key=>pending.delete(key)};
  const document={defaultView:view,createElement:()=>new Element(document)};
  const root=new Element(document),players=[];
  for(const index of [0,1]){
    const type=index===seat?school:school==='water'?'fire':'water',node=new Element(document),sprite=new Element(document);
    Object.assign(node.dataset,{arenaSeat:String(index),element:type,arenaWizard:type,form:index===seat&&golem?'golem':'wizard'});
    sprite.className='wizard-sprite';sprite.style.visibility='visible';node.append(sprite);root.append(node);
    players.push({element:type,golemActive:index===seat&&golem});
  }
  return {root,document,players,pending,tick:time=>{const callbacks=[...pending.values()];pending.clear();for(const fn of callbacks)fn(time);}};
}
const ready=()=>new Promise(resolve=>setImmediate(resolve));
function images(t){
  const old=globalThis.Image;
  globalThis.Image=class{naturalWidth=1254;complete=false;set src(value){queueMicrotask(()=>{this.complete=true;this.onload?.();});}async decode(){}};
  t.after(()=>{if(old===undefined)delete globalThis.Image;else globalThis.Image=old;});
}
const visible=node=>node.style.display!=='none';

test('Enhancement art tiers follow final roll boundaries, including Fate totals over twelve',()=>{
  for(const [total,tier] of [[null,0],[undefined,0],[NaN,0],['12',0],[-2,0],[5,0],[6,6],[8,6],[9,9],[11,9],[12,12],[16,12]])
    assert.equal(getEnhancementVisualTier(total),tier,String(total));
  for(const total of [6,9,12]){
    const held=getEnhancementFlourishMoment(500,total);
    assert.equal(held.phase,'lingering');assert.equal(held.opacity,1);
    assert.equal(getEnhancementFlourishMoment(1499,total).phase,'lingering');
    assert.equal(getEnhancementFlourishMoment(2000,total).visible,false);
  }
  assert.equal(getEnhancementFlourishMoment(1000,6).visible,false,'existing 6+ actor needs no new celebration');
  assert.equal(getEnhancementFlourishMoment(1000,9).ringCount,1);
  assert.equal(getEnhancementFlourishMoment(1000,12).ringCount,2);
});

test('each school and seat gets bounded rough pixels with stronger nine and twelve celebrations',()=>{
  const palettes={fire:'#ffbf35',water:'#69dcff',earth:'#a4e266'};
  for(const school of Object.keys(palettes))for(const casterIndex of [0,1]){
    const {root}=scene({school,seat:casterIndex}),fx=createEnhancementFlourish({root});
    fx.draw(1000,{school,casterIndex,modifiedTotal:9});
    assert.equal(fx.element.hidden,false);assert.equal(fx.element.dataset.tier,'9');
    assert.equal(fx.element.dataset.logicalX,casterIndex===0?'236':'788');
    assert.equal(fx.element.dataset.lingerMs,'1000');
    assert.equal(fx.element.querySelectorAll('.enhancement-ring-pixel').filter(visible).length,28);
    assert.equal(fx.element.querySelectorAll('.enhancement-spark-pixel').filter(visible).length,18);
    assert.ok(fx.element.querySelectorAll('.enhancement-ring-pixel').some(n=>n.style.background===palettes[school]));
    fx.draw(1000,{school,casterIndex,modifiedTotal:12});
    assert.equal(fx.element.querySelectorAll('.enhancement-ring-pixel').filter(visible).length,56);
    assert.equal(fx.element.querySelectorAll('.enhancement-spark-pixel').filter(visible).length,32);
    for(const node of fx.element.children.filter(visible)){
      const [x,y]=node.style.transform.match(/-?\d+/g).map(Number);
      assert.equal(x%3,0);assert.equal(y%3,0);assert.ok(y>=270&&y<=450);
      assert.ok(Math.abs(x-(casterIndex===0?236:788))<130);
      assert.equal(node.style.filter,undefined,'no smooth glow replaces rough pixels');
    }
    fx.reset();assert.equal(fx.element.hidden,true);
    assert.equal(fx.element.children.filter(visible).length,0);
  }
});

test('a final Fate total wins over nominal award and capped actual gain never selects the tier',()=>{
  const {root}=scene(),fx=createEnhancementFlourish({root});
  fx.draw(1000,{school:'fire',casterIndex:0,modifiedTotal:8,enhancementBonus:30});
  assert.equal(fx.element.hidden,true);assert.equal(fx.element.dataset.tier,'6');
  fx.draw(1000,{school:'fire',casterIndex:0,modifiedTotal:12,enhancementBonus:30,enhancementGain:10,enhancementAfter:30});
  assert.equal(fx.element.dataset.tier,'12');assert.equal(fx.element.hidden,false);
  fx.draw(1000,{school:'fire',casterIndex:0,enhancementBonus:20});
  assert.equal(fx.element.dataset.tier,'9','legacy nominal award remains safe under a capped gain');
  fx.draw(1000,{school:'fire',casterIndex:0,modifiedTotal:5});
  assert.equal(fx.element.hidden,true);assert.equal(fx.element.children.filter(visible).length,0);
  fx.draw(2000,{school:'fire',casterIndex:0,modifiedTotal:12});assert.equal(fx.element.hidden,true);
});

test('existing actors keep one impact and completion while tier flourishes clean up for every seat and Golem',async t=>{
  images(t);
  for(const school of ['fire','water','earth'])for(const seat of [0,1])for(const total of [6,9,12]){
    const state=scene({school,seat,golem:school==='earth'}),animator=createSpellAnimator({root:state.root}),calls=[];
    const promise=animator.play({key:`${school}:${seat}:${total}`,kind:'enhancement',casterIndex:seat,
      players:state.players,modifiedTotal:total,enhancementBonus:total===6?10:total===9?20:30,
      onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')});
    await ready();state.tick(0);state.tick(500);state.tick(1000);
    const fx=state.root.querySelector('.enhancement-flourish'),actor=state.root.querySelector('.spell-animation-actor');
    assert.equal(actor.hidden,false);assert.equal(actor.dataset.element,school);
    assert.equal(fx.dataset.tier,String(total));assert.equal(!fx.hidden,total>=9);
    assert.deepEqual(calls,['impact']);
    state.tick(1999);assert.equal(fx.hidden,total<9);
    state.tick(2000);await promise;
    assert.deepEqual(calls,['impact','complete']);assert.equal(fx.hidden,true);
    assert.equal(animator.isPlaying(),false);assert.equal(state.pending.size,0);
    assert.equal(state.root.dataset.spellAnimating,undefined);
  }
});

test('cancel, replacement, deduplication and reduced motion leave no Enhancement particles',async t=>{
  images(t);const state=scene(),animator=createSpellAnimator({root:state.root}),calls=[];
  const first=animator.play({key:'cancel',kind:'enhancement',casterIndex:0,players:state.players,modifiedTotal:12,
    onImpact:()=>calls.push('impact'),onComplete:()=>calls.push('complete')});
  await ready();state.tick(0);state.tick(1000);
  const fx=state.root.querySelector('.enhancement-flourish');assert.equal(fx.hidden,false);
  animator.cancel({settle:false});await first;
  assert.equal(fx.hidden,true);assert.deepEqual(calls,['impact']);
  const duplicate=await animator.play({key:'cancel',kind:'enhancement',casterIndex:0,players:state.players,modifiedTotal:12});
  assert.equal(duplicate.duplicate,true);assert.equal(fx.hidden,true);
  const pending=animator.play({key:'replace',kind:'enhancement',casterIndex:0,players:state.players,modifiedTotal:9});
  await ready();state.tick(2000);state.tick(3000);assert.equal(fx.hidden,false);
  const primary=animator.play({key:'ordinary',spellId:'Fire-0',casterIndex:0,players:state.players});
  await pending;assert.equal(fx.hidden,true);await ready();state.tick(4000);state.tick(6000);await primary;
  const reduced=scene({reduced:true}),still=createSpellAnimator({root:reduced.root});
  const result=await still.play({key:'still',kind:'enhancement',casterIndex:0,players:reduced.players,modifiedTotal:12});
  assert.equal(result.skipped,true);assert.equal(reduced.root.querySelector('.enhancement-flourish').hidden,true);
  assert.equal(reduced.pending.size,0);
});
