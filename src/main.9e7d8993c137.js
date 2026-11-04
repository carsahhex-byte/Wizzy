import { createGame, selectCard, castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn, beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh, validateSavedGame, migrateSavedGame, getActingPlayerIndex, canSelectCard, canCastSelected, getEmberSpendRange, SPELL_RULES } from './game.d00cb03749fe.js';
import { ASSETS, ASSET_CROPS } from './assets.0db7bcf37e8f.js';
import { SPELL_CATALOG, DECK_LISTS, DECK_SIZE, SOURCE_INFO } from './spells.60141befac6b.js';

const SAVE_KEY = 'wizzy.duel.v6';
const app = document.querySelector('#app');
const handoff = document.querySelector('#handoff');
let storageAvailable = true;
let logOpen = false;
let fitScreen = true;
let resolutionTimer;
let diceAnimationTimer;
let state = loadGame();

function loadGame() {
  const readSave=key=>{
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  };
  const saved=readSave(SAVE_KEY);
  if(validateSavedGame(saved))return saved;
  for(const key of ['wizzy.duel.v5','wizzy.duel.v4','wizzy.duel.v3','wizzy.duel.v2','wizzy.duel.v1']){
    const migrated=migrateSavedGame(readSave(key));
    if(migrated)return migrated;
  }
  return createGame();
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
}
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

// Render original art through a CSS viewport; the PNG files remain untouched.
function art(key, className = '', crop = ASSET_CROPS[key]) {
  return `<span class="art ${className}" style="--art-ratio:${crop.w}/${crop.h}" aria-hidden="true"><img src="${ASSETS[key]}" alt="" draggable="false" style="width:${crop.width / crop.w * 100}%;height:${crop.height / crop.h * 100}%;left:${-crop.x / crop.w * 100}%;top:${-crop.y / crop.h * 100}%" /></span>`;
}
function handFrame() {
  const crop = (x,y,w,h) => ({width:1217,height:1293,x,y,w,h});
  return `<div class="hand-frame-shell" aria-hidden="true">${art('handFrame','frame-center',crop(140,320,900,650))}${art('handFrame','frame-top',crop(135,178,190,40))}${art('handFrame','frame-bottom',crop(135,1058,930,43))}${art('handFrame','frame-left',crop(14,300,40,650))}${art('handFrame','frame-right',crop(1163,300,41,650))}${art('handFrame','frame-tl',crop(13,176,105,105))}${art('handFrame','frame-tr',crop(1099,176,105,105))}${art('handFrame','frame-bl',crop(13,996,105,105))}${art('handFrame','frame-br',crop(1099,996,105,105))}</div>${art('handFrame','hand-title-art',crop(365,121,485,113))}`;
}
function playerPanel(player, index) {
  return `<section class="stat-panel ${player.id} ${state.activePlayer === index ? 'is-active' : ''}" aria-label="${player.name} wizard stats">
    ${art(player.id === 'fire' ? 'fireFrame' : 'waterFrame','stat-frame')}
    <div class="stat-heading"><span class="element-symbol" aria-hidden="true">${player.id === 'fire' ? '♨' : '◈'}</span><h2>${player.name}</h2><span class="player-label">P${index+1}</span>${state.activePlayer === index ? '<span class="active-dot" aria-label="Active wizard"></span>' : ''}</div>
    <div class="stat-body"><div class="health-row"><span>HP</span><strong data-stat="${player.id}-hp">${player.hp}<small> / ${player.maxHp}</small></strong></div><div class="health-track" role="progressbar" aria-label="${player.name} HP" aria-valuemin="0" aria-valuemax="${player.maxHp}" aria-valuenow="${player.hp}"><span style="width:${player.hp/player.maxHp*100}%"></span></div>
    <div class="resource-grid"><div class="resource mana"><i aria-hidden="true">◆</i><span>Mana</span><strong data-stat="${player.id}-mana">${player.mana}</strong></div><div class="resource shield"><i aria-hidden="true">⬟</i><span>Shield</span><strong>${player.shield}</strong></div><div class="resource element"><i aria-hidden="true">${player.id === 'fire' ? '♨' : '≈'}</i><span>${player.elementName}</span><strong>${player.element}</strong></div><div class="resource loaded"><i aria-hidden="true">⚄</i><span>Loaded</span><strong class="loaded-value" data-stat="${player.id}-loaded">+${player.loaded}${player.loadedPending?`<small title="Available next turn">+${player.loadedPending} next</small>`:''}</strong></div></div></div>
  </section>`;
}
function phaseHint(active) {
  if (state.status === 'finished') return `${state.players[state.winner].name} wins the duel!`;
  switch(state.phase) {
    case 'fate': return `${state.players[state.fatePlayer].name} · ${state.fatePlayer===state.activePlayer?'Attacking':'Defending'} Fate. Select a batch, or Skip Fate.`;
    case 'rolling': return 'Rolling two dice…';
    case 'resolving': return 'Resolving your spell…';
    case 'end': return 'End Turn passes. Hand Refresh lets you choose discards first.';
    case 'refresh': return `${state.refreshCardIds.length} selected. Hand Refresh confirms and passes; End Turn skips refresh.`;
    case 'ready-to-pass': return 'Hand refreshed. Click End Turn to pass to the next wizard.';
    default: return state.primaryUsed?'Primary spell resolved. End Turn to continue.':`${active.name} wizard · select a slab, then Cast Spell.`;
  }
}
function slabFace(card) {
  return `${art(card.art,'card-image')}<span class="card-name" style="--name-size:${card.name.length>12?18:21}px">${escape(card.name)}</span><span class="card-copy"><strong class="mana-cost">${card.manaCost} Mana</strong><span class="card-effect">${escape(card.effectText)}</span></span>`;
}
function cardView(card, active, finished) {
  const selected = state.phase==='fate'?state.selectedFateCardIds.includes(card.id):state.selectedCardId===card.id;
  const refreshSelected = state.refreshCardIds.includes(card.id);
  const pending = state.pendingCardId === card.id;
  const eligible=canSelectCard(state,card.id);
  const unavailable = finished || (state.phase!=='refresh'&&!eligible);
  const muted=state.phase==='fate'&&card.category!=='Fate';
  const inactiveFate=state.phase==='fate'&&card.category==='Fate'&&!eligible;
  return `<button class="spell-card slab-${card.type.toLowerCase()} ${selected ? 'selected' : ''} ${refreshSelected ? 'discard-selected' : ''} ${muted ? 'fate-muted' : ''} ${inactiveFate?'fate-unavailable':''} ${pending ? 'pending-card' : ''}" data-card-id="${escape(card.id)}" data-spell-id="${card.spellId}" data-slab-type="${card.type}" data-focus="${escape(card.id)}" aria-pressed="${state.phase === 'refresh' ? refreshSelected : selected}" aria-label="${escape(card.name)}. ${card.type}. ${card.manaCost} Mana. ${escape(card.effectText)} ${state.phase === 'refresh' ? (refreshSelected ? 'Selected for discard.' : 'Select to discard.') : ''}" title="${escape(card.name)} · ${card.manaCost} Mana. ${escape(card.effectText)}" ${unavailable ? 'disabled' : ''}>
    ${slabFace(card)}
    ${selected ? '<span class="card-badge">SELECTED</span>' : ''}${refreshSelected ? '<span class="card-badge discard-badge">✓ DISCARD</span>' : ''}${pending ? '<span class="card-badge pending-badge">CASTING</span>' : ''}
  </button>`;
}
const pipPositions={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function pips(value) {
  return value?Array.from({length:9},(_,i)=>`<i class="die-pip ${pipPositions[value].includes(i)?'visible':''}"></i>`).join(''):'<span class="unrolled-mark">?</span>';
}
function diceFace(value,index) {
  return `<span class="die-face" data-die-index="${index}" data-die-value="${value??''}">${art('dicePair','die-border',ASSET_CROPS[index===0?'diceLeft':'diceRight'])}<span class="die-surface">${pips(value)}</span></span>`;
}
const signed=value=>`${value>=0?'+':''}${value}`;
function diceView() {
  const pending=['fate','rolling'].includes(state.phase);
  const last=pending?null:state.lastRoll;
  const title=state.phase==='fate'?'Fate window':state.phase==='rolling'?'Rolling…':last?`Total: ${last.total}`:'Ready to roll';
  const equation=last?`${last.dice[0]} + ${last.dice[1]} ${signed(last.loadedBonus)} Loaded ${signed(last.attackingFate)} Fate ${signed(last.defendingFate)} Fate`:state.pendingSpell?`Loaded ${signed(state.pendingSpell.loadedBonus)} · Attack ${signed(state.pendingSpell.attackingFate)} · Defend ${signed(state.pendingSpell.defendingFate)}`:'Two six-sided dice';
  return `<section class="dice-area ${state.phase==='rolling'?'dice-rolling':''}" aria-label="${escape(last?`Dice ${last.dice.join(' and ')}. Modified total ${last.total}.`:title)}">${art('diceFrame','dice-frame')}<strong class="roll-total" data-testid="roll-total">${title}</strong><div class="dice-pair">${diceFace(last?.dice[0],0)}${diceFace(last?.dice[1],1)}</div><span class="roll-breakdown">${equation}</span><span class="dice-caption">${last?`${state.players[last.casterIndex].name.toUpperCase()} · ${escape(SPELL_CATALOG[last.spellId].name)} · LAST ROLL`:state.phase==='fate'?'CAST YOUR SELECTED FATE, OR SKIP':'ROLLS ONLY WHEN A SPELL REQUIRES THEM'}</span></section>`;
}
function hintView(active,selected) {
  if(state.phase==='main'&&state.primaryUsed)return `${phaseHint(active)}${selected?'<div class="hint-actions"><button class="text-button" id="inspect-selected">Read slab</button></div>':''}`;
  if(selected&&['main','fate'].includes(state.phase)){
    const label=state.phase==='fate'?`${state.selectedFateCardIds.length} Fate ${state.selectedFateCardIds.length===1?'slab':'slabs'} selected`:`${escape(selected.name)} · ${selected.manaCost} Mana${active.mana<selected.manaCost?' · Not enough mana':''}`;
    return `<span>${label}</span><div class="hint-actions"><button class="text-button" id="inspect-selected">Read slab</button>${state.phase==='fate'?'<button class="text-button" id="skip-fate">Skip Fate</button>':''}</div>`;
  }
  return phaseHint(active);
}
function render() {
  const active = state.players[state.activePlayer];
  const displayPlayer=state.players[getActingPlayerIndex(state)];
  const finished = state.status !== 'playing';
  const isFate = state.phase === 'fate';
  const resolving = ['rolling','resolving'].includes(state.phase);
  const ending = ['end','refresh','ready-to-pass'].includes(state.phase);
  const showRefresh = ['end','refresh'].includes(state.phase) && !finished;
  const selected=displayPlayer.hand.find(card=>card.id===state.selectedCardId);
  const fateCount=state.selectedFateCardIds.length;
  const castLabel=isFate?(fateCount?'Cast Fate':'Skip Fate'):resolving?'Resolving spell':'Cast Spell';
  const castArt=isFate?(fateCount?'castFate':'skipFate'):'cast';
  const focusKey = document.activeElement?.dataset.focus;
  app.innerHTML = `<div class="game-shell">
    <header class="topbar"><span class="wordmark">WIZZY <small>BATTLE SIMULATOR</small></span><span class="save-state">${storageAvailable ? '✦ DUEL SAVED' : 'SAVING UNAVAILABLE'}</span><button class="view-toggle" id="toggle-fit" aria-label="${fitScreen?'Switch to larger view':'Fit game to screen'}">${fitScreen?'Larger view ↗':'Fit screen ↙'}</button><button class="settings-button" id="open-settings" aria-label="Open settings and game rules">⚙</button></header>
    <div class="game-board ${active.id} phase-${state.phase}" style="--forest:url('${ASSETS.forest}')">
    <section class="battle-scene" aria-label="Fire and Water wizards in the forest ruins"><div class="game-title"><span class="title-stars" aria-hidden="true">✦ ◆ ✦</span><h1>Wizzy</h1><p>Battle Simulator</p></div><div class="combatant fire-combatant ${state.activePlayer===0?'active-combatant':''}">${art('fireMage','mage-art')}<span class="mage-shadow"></span></div><span class="versus" aria-hidden="true">VS</span><div class="combatant water-combatant ${state.activePlayer===1?'active-combatant':''}">${art('waterMage','mage-art')}<span class="mage-shadow"></span></div></section>
    <div class="battle-hud">${playerPanel(state.players[0],0)}${diceView()}${playerPanel(state.players[1],1)}</div>
    <section class="hand-chamber" aria-labelledby="hand-title">${handFrame()}<h2 class="sr-only" id="hand-title">${displayPlayer.name} wizard’s hand</h2><div class="hand-content"><div class="hand-meta"><span>${displayPlayer.name.toUpperCase()} · ${isFate?(state.fatePlayer===state.activePlayer?'ATTACKING FATE':'DEFENDING FATE'):'SPELLBOOK'}</span><span data-testid="hand-count">${displayPlayer.hand.length} / 5 SLABS</span></div>
    <div class="cards ${displayPlayer.id} cards-${displayPlayer.hand.length}" aria-label="${displayPlayer.name} wizard’s spell slabs">${displayPlayer.hand.map(card=>cardView(card,displayPlayer,finished)).join('')||'<div class="empty-hand"><span>✧</span><p>No spells in hand.<br>Refresh your hand or draw on your next turn.</p></div>'}</div>
    <div class="hand-bottomline"><div class="pile" aria-label="${displayPlayer.name} discard pile">${art('stoneSign','pile-sign')}<span class="pile-copy">Discard Pile<strong data-testid="discard-count">${displayPlayer.discard.length} <small>${displayPlayer.discard.length===1?'slab':'slabs'}</small></strong></span></div><span class="hand-note">${state.phase==='refresh'?'GREY SLABS WILL BE DISCARDED':isFate?'FATE WINDOW':ending?'ENDING YOUR TURN':'CHOOSE YOUR MAGIC'}</span><button class="pile tower-pile" id="view-deck" aria-label="View ${displayPlayer.name} spell slab decklist">${art('stoneSign','pile-sign')}<span class="pile-copy">Spell Tower<strong data-testid="deck-count">${displayPlayer.deck.length} <small>${displayPlayer.deck.length===1?'slab':'slabs'}</small></strong></span></button></div></div></section>
    <div class="turn-controls"><div class="phase-hint" role="status">${hintView(active,selected)}</div>
    <div class="action-bar"><div class="round-plaque" aria-label="Round ${state.round}, ${active.name} wizard’s turn">${art('round','round-art')}<span class="round-cover"><strong>Round <span data-testid="round-number">${state.round}</span></strong><span>${finished?'Duel complete':`${active.name}’s Turn`}</span></span></div>
    <button class="art-button cast-button" id="cast-spell" data-focus="cast" aria-label="${castLabel}" ${finished||resolving||(isFate?(fateCount>0&&!canCastSelected(state)):!canCastSelected(state))?'disabled':''}>${art(castArt,'button-art')}</button>
    <div class="end-controls"><button class="art-button refresh-button ${showRefresh?'is-revealed':''} ${state.phase==='refresh'?'is-confirming':''}" id="hand-refresh" data-focus="refresh" aria-label="${state.phase==='refresh'?`Confirm hand refresh and pass, ${state.refreshCardIds.length} slabs selected`:'Hand Refresh'}" ${!showRefresh?'disabled tabindex="-1"':''} ${!showRefresh?'aria-hidden="true"':''}>${art('refresh','button-art')}${state.phase==='refresh'?`<span class="refresh-count">${state.refreshCardIds.length} selected · confirm</span>`:''}</button><button class="art-button end-button ${ending?'is-ending':''}" id="end-turn" data-focus="end" aria-label="${['end','refresh','ready-to-pass'].includes(state.phase)?`End Turn and pass to ${state.players[1-state.activePlayer].name}`:'End Turn'}" ${finished||['fate','rolling','resolving'].includes(state.phase)?'disabled':''}>${art('endTurn','button-art')}</button></div></div></div>
    <details class="combat-log" ${logOpen?'open':''}><summary aria-label="View combat log">${art('combatLog','log-button')}<span class="log-count">${state.log.length}</span><span class="chevron" aria-hidden="true">⌄</span></summary><ol>${state.log.slice().reverse().map(entry=>`<li><span class="log-round">R${entry.round}</span><span>${escape(entry.message)}</span></li>`).join('')}</ol></details>
    <footer class="game-footer"><span>LOCAL DUEL · TWO WIZARDS, ONE SCREEN</span><span>FIRE · WATER · FATE</span></footer></div></div>`;
  app.querySelector('.combat-log').addEventListener('toggle', event=>{logOpen=event.target.open;fitBoard();});
  if(focusKey) app.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  scheduleCombat();
  fitBoard();
}
// The forest and every game element share one undistorted 1024 × 1536 canvas.
// Only this outer scale changes with the viewport; log expansion never resizes it.
function fitBoard() {
  const width=document.documentElement.clientWidth;
  const height=innerHeight;
  const scale=fitScreen?Math.min(width/1024,height/1536):Math.min(1,width/1024);
  app.style.setProperty('--board-scale',String(scale));
  app.style.width=`${1024*scale}px`;
  app.style.height=`${1536*scale}px`;
  app.style.marginTop=fitScreen?`${Math.max(0,(height-1536*scale)/2)}px`:'0px';
}
window.addEventListener('resize',fitBoard);
function update(next,message) {
  if(next===state)return;
  const wasPlaying=state.status==='playing';
  state=next;saveGame();render();
  document.querySelector('#announcement').textContent=message||state.log.at(-1)?.message||'';
  if(wasPlaying&&state.status==='finished'){
    document.querySelector('#victory-title').textContent=`${state.players[state.winner].name} wins!`;
    document.querySelector('#victory-description').textContent=`The opposing wizard has reached 0 HP. The duel is complete after ${state.round} ${state.round===1?'round':'rounds'}.`;
    document.querySelector('#victory').showModal();
  }
}
function clearCombatTimers() {
  clearTimeout(resolutionTimer);
  clearInterval(diceAnimationTimer);
}
function scheduleCombat() {
  clearCombatTimers();
  if(handoff.open||state.status!=='playing')return;
  if(state.phase==='rolling'){
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      diceAnimationTimer=setInterval(()=>{
        app.querySelectorAll('.die-face').forEach(face=>{
          const value=1+Math.floor(Math.random()*6);
          face.dataset.dieValue=String(value);
          face.querySelector('.die-surface').innerHTML=pips(value);
        });
      },90);
    }
    resolutionTimer=setTimeout(()=>update(rollDice(state)),650);
  }else if(state.phase==='resolving') {
    resolutionTimer=setTimeout(()=>{
      update(resolveSpell(state));
      app.querySelector('#end-turn')?.focus({preventScroll:true});
    },450);
  }
}
function showHandoff(playerIndex=state.activePlayer,kind='turn') {
  clearCombatTimers();
  const player=state.players[playerIndex];
  document.querySelector('#handoff-title').textContent=kind==='fate'?`${player.name} · defending Fate`:kind==='roll'?`${player.name} · roll the dice`:`${player.name}’s turn`;
  document.querySelector('#handoff-description').textContent=kind==='fate'?'Pass the screen to the defender. Select any Misfortune or Twist slabs, then Cast Fate to play the batch and continue, or Skip Fate.':kind==='roll'?'Both Fate windows are complete. Return the screen to the caster to roll and resolve the spell.':`Round ${state.round}. Pass the screen to the ${player.name} wizard. Your hand is ready.`;
  document.querySelector('#handoff-portrait').innerHTML=art(player.id==='fire'?'fireMage':'waterMage');
  document.querySelector('#begin-turn').innerHTML=`${kind==='fate'?'Choose Fate':kind==='roll'?'Roll dice':'Begin turn'} <span aria-hidden="true">→</span>`;
  handoff.showModal();
}
function finishFateWindow() {
  advanceFateWindow(skipFate(state));
}
function advanceFateWindow(next) {
  const previous=state;
  if(next===state)return;
  update(next);
  if(state.phase==='fate'&&state.fatePlayer!==previous.fatePlayer)showHandoff(state.fatePlayer,'fate');
  else if(state.phase==='rolling')showHandoff(state.activePlayer,'roll');
}
function commitSpell(emberSpend=0) {
  update(castSelected(state,{emberSpend}));
  app.querySelector(state.phase==='fate'?'#cast-spell':'.spell-card:not(:disabled)')?.focus({preventScroll:true});
}
function requestCast() {
  if(state.phase==='fate'){
    if(state.selectedFateCardIds.length)advanceFateWindow(castFateSelected(state));
    else finishFateWindow();
    return;
  }
  if(!canCastSelected(state))return;
  const player=state.players[state.activePlayer];
  const card=player.hand.find(card=>card.id===state.selectedCardId);
  const range=getEmberSpendRange(card.spellId,player.element);
  if(!range.mandatory&&range.max>0){
    document.querySelector('#ember-title').textContent=`${card.name}: spend Embers?`;
    document.querySelector('#ember-description').textContent=`Choose 0–${range.max} Embers before casting. The spell costs ${card.manaCost} mana. ${card.effectText}`;
    const input=document.querySelector('#ember-amount');
    input.min=String(range.min);input.max=String(range.max);input.value='0';
    document.querySelector('#ember-error').textContent='';
    document.querySelector('#ember-choice').showModal();
    input.focus();
  }else commitSpell(range.mandatory?range.max:0);
}
function showSlab(spellId) {
  const spell=SPELL_CATALOG[spellId];
  if(!spell)return;
  const dialog=document.querySelector('#slab-inspector');
  document.querySelector('#slab-heading').textContent=spell.name;
  document.querySelector('#slab-definition').textContent=`${spell.spellId} · ${spell.category}${spell.category==='Elemental'?` · ${spell.element}`:''}`;
  document.querySelector('#slab-face').innerHTML=slabFace(spell);
  document.querySelector('#slab-face').dataset.slabType=spell.type;
  document.querySelector('#slab-behavior').textContent=spell.category==='Fate'?'Play during the appropriate attacking or defending Fate window.':SPELL_RULES[spellId].requiresRoll?'Roll two dice after the attacker and defender finish their Fate choices.':'Resolves immediately, without a dice roll or Fate window.';
  if(!dialog.open)dialog.showModal();
}
function showDeck(playerId=state.players[getActingPlayerIndex(state)].id) {
  const player=state.players.find(player=>player.id===playerId);
  if(!player)return;
  const groups=['Elemental','Neutral','Fate'].map(category=>{
    const entries=DECK_LISTS[playerId].filter(entry=>SPELL_CATALOG[entry.spellId].category===category);
    const quantity=entries.reduce((sum,entry)=>sum+entry.quantity,0);
    return `<section class="deck-group"><h3>${category}<span>${quantity} slabs</span></h3>${entries.map(entry=>{
      const spell=SPELL_CATALOG[entry.spellId];
      return `<button class="deck-row slab-${spell.type.toLowerCase()}" data-inspect-spell="${spell.spellId}" aria-label="Read ${escape(spell.name)}, ${entry.quantity} copies, ${spell.manaCost} Mana"><span class="deck-thumbnail">${art(spell.art)}</span><span class="deck-spell-name">${escape(spell.name)}<small>${spell.spellId} · ${spell.type}</small></span><span class="deck-mana">${spell.manaCost}<small>Mana</small></span><strong class="deck-quantity" data-spell-id="${spell.spellId}">×${entry.quantity}</strong></button>`;
    }).join('')}</section>`;
  }).join('');
  document.querySelector('#deck-heading').textContent=`${player.name} deck · ${DECK_SIZE} spell slabs`;
  document.querySelector('#deck-summary').textContent=`${player.deck.length} in tower · ${player.hand.length} in hand · ${player.discard.length} discarded. Decklist v${SOURCE_INFO[playerId].version}.`;
  document.querySelector('#deck-entries').innerHTML=groups;
  document.querySelectorAll('[data-deck-player]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.deckPlayer===playerId)));
  const dialog=document.querySelector('#deck-inspector');
  if(!dialog.open)dialog.showModal();
}
document.querySelector('#deck-inspector').addEventListener('click',event=>{
  const spell=event.target.closest('[data-inspect-spell]');
  if(spell)showSlab(spell.dataset.inspectSpell);
  const tab=event.target.closest('[data-deck-player]');
  if(tab)showDeck(tab.dataset.deckPlayer);
});
app.addEventListener('click',event=>{
  const card=event.target.closest('[data-card-id]');
  if(card){update(state.phase==='refresh'?toggleRefreshCard(state,card.dataset.cardId):selectCard(state,card.dataset.cardId));return;}
  const button=event.target.closest('button');if(!button)return;
  switch(button.id){
    case 'toggle-fit':fitScreen=!fitScreen;render();break;
    case 'open-settings':document.querySelector('#settings').showModal();break;
    case 'view-deck':showDeck();break;
    case 'inspect-selected':{
      const selected=state.players[getActingPlayerIndex(state)].hand.find(card=>card.id===state.selectedCardId);
      if(selected)showSlab(selected.spellId);
      break;
    }
    case 'cast-spell':
      requestCast();break;
    case 'skip-fate':finishFateWindow();break;
    case 'end-turn':{
      const previous=state.activePlayer;update(endTurn(state));
      if(state.activePlayer!==previous)showHandoff();
      else if(state.phase==='end')app.querySelector('#hand-refresh')?.focus({preventScroll:true});
      break;
    }
    case 'hand-refresh':{
      const previous=state.activePlayer;
      update(state.phase==='refresh'?confirmRefresh(state):beginRefresh(state));
      if(state.activePlayer!==previous)showHandoff();
      else app.querySelector(state.phase==='refresh'?'[data-card-id]':'#end-turn')?.focus({preventScroll:true});
      break;
    }
    case 'cancel-refresh':update(cancelRefresh(state));break;
  }
});

document.querySelector('#begin-turn').addEventListener('click',()=>{handoff.close();scheduleCombat();app.querySelector('.spell-card:not(:disabled)')?.focus({preventScroll:true});});
// Avoid revealing the next hand accidentally by dismissing a pass-screen dialog.
handoff.addEventListener('cancel',event=>event.preventDefault());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
document.querySelector('#request-restart').addEventListener('click',()=>{document.querySelector('#settings').close();document.querySelector('#restart').showModal();});
document.querySelector('#settings-deck').addEventListener('click',()=>{document.querySelector('#settings').close();showDeck();});
function restartGame() {
  clearCombatTimers();
  for(const id of ['victory','restart','ember-choice'])document.getElementById(id).close();
  update(createGame(),'A new duel has begun. Fire goes first.');
}
document.querySelector('#confirm-restart').addEventListener('click',restartGame);
document.querySelector('#victory-restart').addEventListener('click',restartGame);
document.querySelector('#confirm-embers').addEventListener('click',()=>{
  const input=document.querySelector('#ember-amount');
  const amount=Number(input.value);
  if(!input.reportValidity()||!Number.isSafeInteger(amount)||amount<Number(input.min)||amount>Number(input.max)){
    document.querySelector('#ember-error').textContent=`Choose a whole number from ${input.min} to ${input.max}.`;
    return;
  }
  document.querySelector('#ember-choice').close();
  commitSpell(amount);
});
saveGame();render();
