import { createGame, selectCard, castSelected, skipFate, resolveSpell, endTurn, beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh, validateSavedGame, migrateSavedGame } from './game.js';
import { ASSETS, ASSET_CROPS } from './assets.js';

const SAVE_KEY = 'wizzy.duel.v2';
const app = document.querySelector('#app');
const handoff = document.querySelector('#handoff');
let storageAvailable = true;
let logOpen = false;
let fitScreen = true;
let resolutionTimer;
let state = loadGame();

function loadGame() {
  const readSave=key=>{
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  };
  const saved=readSave(SAVE_KEY);
  if(validateSavedGame(saved))return saved;
  const migrated=migrateSavedGame(readSave('wizzy.duel.v1'));
  if(migrated)return migrated;
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
    <div class="resource-grid"><div class="resource mana"><i aria-hidden="true">◆</i><span>Mana</span><strong data-stat="${player.id}-mana">${player.mana}</strong></div><div class="resource shield"><i aria-hidden="true">⬟</i><span>Shield</span><strong>${player.shield}</strong></div><div class="resource element"><i aria-hidden="true">${player.id === 'fire' ? '♨' : '≈'}</i><span>${player.elementName}</span><strong>${player.element}</strong></div><div class="resource loaded"><i aria-hidden="true">⚄</i><span>Loaded</span><strong>+${player.loaded}</strong></div></div></div>
  </section>`;
}
function phaseHint(active) {
  if (state.status === 'finished') return `${state.players[state.winner].name} wins the duel!`;
  switch(state.phase) {
    case 'fate': return 'Fate window · cards are unavailable. Click Skip Fate to resolve your spell.';
    case 'resolving': return 'Resolving your spell…';
    case 'end': return 'Refresh your hand, or click End Turn again to pass.';
    case 'refresh': return `Select discards (${state.refreshCardIds.length}), then Hand Refresh again.`;
    case 'ready-to-pass': return 'Hand refreshed. Click End Turn to pass to the next wizard.';
    default: return `${active.name} wizard · select a card, then Cast Spell.`;
  }
}
function cardView(card, active, finished) {
  const selected = state.selectedCardId === card.id;
  const refreshSelected = state.refreshCardIds.includes(card.id);
  const pending = state.pendingCardId === card.id;
  const unavailable = !['main','refresh'].includes(state.phase) || finished;
  return `<button class="spell-card ${selected ? 'selected' : ''} ${refreshSelected ? 'discard-selected' : ''} ${['fate','resolving'].includes(state.phase) ? 'fate-muted' : ''} ${pending ? 'pending-card' : ''}" data-card-id="${escape(card.id)}" data-focus="${escape(card.id)}" aria-pressed="${state.phase === 'refresh' ? refreshSelected : selected}" aria-label="${escape(card.name)}. ${state.phase === 'refresh' ? (refreshSelected ? 'Selected for discard.' : 'Select to discard.') : 'Spell effect pending.'}" ${unavailable ? 'disabled' : ''}>
    ${art(active.id === 'fire' ? 'fireCard' : 'waterCard','card-image')}
    <span class="card-name">${escape(card.name)}</span><span class="card-copy"><strong>Spell effect pending</strong><span>Rules coming next</span></span>
    ${selected ? '<span class="card-badge">SELECTED</span>' : ''}${refreshSelected ? '<span class="card-badge discard-badge">✓ DISCARD</span>' : ''}${pending ? '<span class="card-badge pending-badge">CASTING</span>' : ''}
  </button>`;
}
function render() {
  const active = state.players[state.activePlayer];
  const finished = state.status !== 'playing';
  const isFate = state.phase === 'fate';
  const resolving = state.phase === 'resolving';
  const ending = ['end','refresh','ready-to-pass'].includes(state.phase);
  const showRefresh = ['end','refresh'].includes(state.phase) && !finished;
  const focusKey = document.activeElement?.dataset.focus;
  app.innerHTML = `<div class="game-shell">
    <header class="topbar"><span class="wordmark">WIZZY <small>BATTLE SIMULATOR</small></span><span class="save-state">${storageAvailable ? '✦ DUEL SAVED' : 'SAVING UNAVAILABLE'}</span><button class="view-toggle" id="toggle-fit" aria-label="${fitScreen?'Switch to larger view':'Fit game to screen'}">${fitScreen?'Larger view ↗':'Fit screen ↙'}</button><button class="settings-button" id="open-settings" aria-label="Open settings and game rules">⚙</button></header>
    <div class="game-board ${active.id} phase-${state.phase}" style="--forest:url('${ASSETS.forest}')">
    <section class="battle-scene" aria-label="Fire and Water wizards in the forest ruins"><div class="game-title"><span class="title-stars" aria-hidden="true">✦ ◆ ✦</span><h1>Wizzy</h1><p>Battle Simulator</p></div><div class="combatant fire-combatant ${state.activePlayer===0?'active-combatant':''}">${art('fireMage','mage-art')}<span class="mage-shadow"></span></div><span class="versus" aria-hidden="true">VS</span><div class="combatant water-combatant ${state.activePlayer===1?'active-combatant':''}">${art('waterMage','mage-art')}<span class="mage-shadow"></span></div></section>
    <div class="battle-hud">${playerPanel(state.players[0],0)}<section class="dice-area ${resolving?'spell-resolving':''}" aria-label="Dice display; dice effects await card rules">${art('diceFrame','dice-frame')}${art('dicePair','dice-pair')}<span class="dice-caption">${resolving?'SPELL RESOLVING':'DICE · RULES PENDING'}</span></section>${playerPanel(state.players[1],1)}</div>
    <section class="hand-chamber" aria-labelledby="hand-title">${handFrame()}<h2 class="sr-only" id="hand-title">${active.name} wizard’s hand</h2><div class="hand-content"><div class="hand-meta"><span>${active.name.toUpperCase()} WIZARD’S SPELLBOOK</span><span data-testid="hand-count">${active.hand.length} / 5 CARDS</span></div>
    <div class="cards ${active.id} cards-${active.hand.length}" aria-label="${active.name} wizard’s hand">${active.hand.map(card=>cardView(card,active,finished)).join('')||'<div class="empty-hand"><span>✧</span><p>No spells in hand.<br>Refresh your hand or draw on your next turn.</p></div>'}</div>
    <div class="hand-bottomline"><div class="pile" aria-label="${active.name} discard pile">${art('stoneSign','pile-sign')}<span class="pile-copy">Discard Pile<strong data-testid="discard-count">${active.discard.length} <small>cards</small></strong></span></div><span class="hand-note">${state.phase==='refresh'?'GREY CARDS WILL BE DISCARDED':isFate?'FATE WINDOW':ending?'ENDING YOUR TURN':'CHOOSE YOUR MAGIC'}</span><div class="pile tower-pile" aria-label="${active.name} spell tower">${art('stoneSign','pile-sign')}<span class="pile-copy">Spell Tower<strong data-testid="deck-count">${active.deck.length} <small>cards</small></strong></span></div></div></div></section>
    <div class="turn-controls"><div class="phase-hint" role="status">${phaseHint(active)}${state.phase==='refresh'?'<button class="text-button" id="cancel-refresh">Cancel refresh</button>':''}</div>
    <div class="action-bar"><div class="round-plaque" aria-label="Round ${state.round}, ${active.name} wizard’s turn">${art('round','round-art')}<span class="round-cover"><strong>Round <span data-testid="round-number">${state.round}</span></strong><span>${finished?'Duel complete':`${active.name}’s Turn`}</span></span></div>
    <button class="art-button cast-button" id="cast-spell" data-focus="cast" aria-label="${isFate?'Skip Fate':resolving?'Resolving spell':'Cast Spell'}" ${finished||resolving||(!isFate&&(state.phase!=='main'||!state.selectedCardId))?'disabled':''}>${art(isFate||resolving?'skipFate':'cast','button-art')}</button>
    <div class="end-controls"><button class="art-button refresh-button ${showRefresh?'is-revealed':''} ${state.phase==='refresh'?'is-confirming':''}" id="hand-refresh" data-focus="refresh" aria-label="${state.phase==='refresh'?`Confirm hand refresh, ${state.refreshCardIds.length} cards selected`:'Hand Refresh'}" ${!showRefresh?'disabled tabindex="-1"':''} ${!showRefresh?'aria-hidden="true"':''}>${art('refresh','button-art')}${state.phase==='refresh'?`<span class="refresh-count">${state.refreshCardIds.length} selected · confirm</span>`:''}</button><button class="art-button end-button" id="end-turn" data-focus="end" aria-label="${['end','ready-to-pass'].includes(state.phase)?`End Turn and pass to ${state.players[1-state.activePlayer].name}`:'End Turn'}" ${finished||['fate','resolving','refresh'].includes(state.phase)?'disabled':''}>${art('endTurn','button-art')}</button></div></div></div>
    <details class="combat-log" ${logOpen?'open':''}><summary aria-label="View combat log">${art('combatLog','log-button')}<span class="log-count">${state.log.length}</span><span class="chevron" aria-hidden="true">⌄</span></summary><ol>${state.log.slice().reverse().map(entry=>`<li><span class="log-round">R${entry.round}</span><span>${escape(entry.message)}</span></li>`).join('')}</ol></details>
    <footer class="game-footer"><span>LOCAL DUEL · TWO WIZARDS, ONE SCREEN</span><span>Spell effects coming next</span></footer></div></div>`;
  app.querySelector('.combat-log').addEventListener('toggle', event=>{logOpen=event.target.open;fitBoard();});
  if(focusKey) app.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  scheduleResolution();
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
  state=next;saveGame();render();
  if(message) document.querySelector('#announcement').textContent=message;
}
function scheduleResolution() {
  clearTimeout(resolutionTimer);
  if(state.phase==='resolving'&&state.status==='playing') {
    resolutionTimer=setTimeout(()=>{
      update(resolveSpell(state),'Spell resolved and moved to the discard pile. Effects are pending your next rules.');
      app.querySelector('#end-turn')?.focus({preventScroll:true});
    },650);
  }
}
function showHandoff() {
  const player=state.players[state.activePlayer];
  document.querySelector('#handoff-title').textContent=`${player.name}’s turn`;
  document.querySelector('#handoff-description').textContent=`Round ${state.round}. Pass the screen to the ${player.name} wizard. Your hand is ready.`;
  document.querySelector('#handoff-portrait').innerHTML=art(player.id==='fire'?'fireMage':'waterMage');
  handoff.showModal();
}
app.addEventListener('click',event=>{
  const card=event.target.closest('[data-card-id]');
  if(card){update(state.phase==='refresh'?toggleRefreshCard(state,card.dataset.cardId):selectCard(state,card.dataset.cardId));return;}
  const button=event.target.closest('button');if(!button)return;
  switch(button.id){
    case 'toggle-fit':fitScreen=!fitScreen;render();break;
    case 'open-settings':document.querySelector('#settings').showModal();break;
    case 'cast-spell':
      update(state.phase==='fate'?skipFate(state):castSelected(state));
      if(state.phase==='fate')app.querySelector('#cast-spell')?.focus({preventScroll:true});
      break;
    case 'end-turn':{
      const previous=state.activePlayer;update(endTurn(state));
      if(state.activePlayer!==previous)showHandoff();
      else if(state.phase==='end')app.querySelector('#hand-refresh')?.focus({preventScroll:true});
      break;
    }
    case 'hand-refresh':
      update(state.phase==='refresh'?confirmRefresh(state):beginRefresh(state));
      app.querySelector(state.phase==='refresh'?'[data-card-id]':'#end-turn')?.focus({preventScroll:true});
      break;
    case 'cancel-refresh':update(cancelRefresh(state));break;
  }
});

document.querySelector('#begin-turn').addEventListener('click',()=>{handoff.close();app.querySelector('[data-card-id]')?.focus({preventScroll:true});});
// Avoid revealing the next hand accidentally by dismissing a pass-screen dialog.
handoff.addEventListener('cancel',event=>event.preventDefault());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
document.querySelector('#request-restart').addEventListener('click',()=>{document.querySelector('#settings').close();document.querySelector('#restart').showModal();});
document.querySelector('#confirm-restart').addEventListener('click',()=>{clearTimeout(resolutionTimer);update(createGame(),'A new duel has begun. Fire goes first.');document.querySelector('#restart').close();});
saveGame();render();
