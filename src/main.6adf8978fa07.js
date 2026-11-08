import { createGame, rollInitiative, selectCard, castSelected, castFateSelected, skipFate, rollDice, resolveSpell, endTurn, beginRefresh, toggleRefreshCard, confirmRefresh, cancelRefresh, validateSavedGame, migrateSavedGame, getActingPlayerIndex, canSelectCard, canCastSelected, getEmberSpendRange, SPELL_RULES, SAVE_VERSION, HAND_LIMIT, OPENING_HAND_SIZE, activateEnhancement, rollEnhancement, canEnhance, MAX_ENHANCEMENT, ENHANCEMENT_THRESHOLD, activateAura, canActivateAura, AURA_COST, AURA_DURATION, AURA_BONUS } from './game.3d37460e93ec.js';
import { ASSETS, ASSET_CROPS, spellArtMarkup, spellSlabMarkup } from './assets.cfb23b68fab6.js';
import { SPELL_CATALOG, DECK_SIZE } from './spells.29cc03f8c6f5.js';
import { validateDeck } from './decks.c47034088730.js';
import { MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS } from './effects.7946353e2359.js';
import { createHub } from './hub.13e4bd5c8edb.js';
import { createMultiplayer } from './multiplayer.25ed3d0abb95.js';
import { createAccounts } from './accounts.92dd638f4166.js';
import { fitSlabText } from './slab-text.a18511f20227.js';
import { createBattleScene } from './battle-scene.e79256b8de9d.js';
import { createSpellAnimator } from './spell-animation.c11064fdc7c0.js';
import { getResolvedSpellVisuals } from './spell-visuals.bf5178322ac9.js';
import { createHealthBars } from './health-bars.b204b645d6fa.js';

const SAVE_KEY = `wizzy.duel.v${SAVE_VERSION}`;
const app = document.querySelector('#app');
const battleView = document.querySelector('#battle-view');
const handoff = document.querySelector('#handoff');
const battleScene = createBattleScene();
const spellAnimator = createSpellAnimator({root:battleScene.element});
const healthBars = createHealthBars({onSettled:()=>showPendingVictory()});
let spellVisualQueue = [];
let activeSpellVisual = null;
let presentedPlayers = null;
let spellVisualGeneration = 0;
let pendingVictory = false;
let arenaSequence = 0;
let localEntranceKey = null;
const onlineEntranceRooms = new Set();
let storageAvailable = true;
let logOpen = false;
let fitScreen = true;
let resolutionTimer;
let diceAnimationTimer;
let emberChoice = null;
const twistDirections = Object.create(null);
let pendingBattleDecks = null;
let shouldEnterAfterRestart = false;
let state = loadGame();
let localState = state;
let multiplayer = null;
let accounts = null;
let accountIdentity = null;
let changingAccount = false;
let battleMode = 'local';
let lastBattleMode = 'local';
let onlinePlayerIndex = null;
let onlineCode = null;
let onlineBusy = false;
let onlineStatus = '';
let pendingModeDecks = null;
const openingAcknowledged = { local: state.phase !== 'initiative', online: true };
try { lastBattleMode=localStorage.getItem('wizzy.battle.mode')==='online'?'online':'local'; } catch {}

const isOnlineBattle = () => battleMode === 'online';
const displayedPlayerIndex = () => isOnlineBattle() ? onlinePlayerIndex : getActingPlayerIndex(state);
const canActOnline = () => !spellVisualBusy() && !['setup','initiative'].includes(state.phase) && (!isOnlineBattle() || (!onlineBusy && multiplayer?.isActive() && getActingPlayerIndex(state) === onlinePlayerIndex));
const canRollOpeningOnline = () => isOnlineBattle() && !onlineBusy && multiplayer?.isActive() && state.phase === 'initiative' && state.initiative?.rolls[onlinePlayerIndex] === null;
function createLocalGame(decks) {
  cancelSpellPresentation();
  localEntranceKey = `local-${++arenaSequence}`;
  return createGame(Date.now(),decks);
}
function arenaEntranceKey() {
  if (!isOnlineBattle()) return localEntranceKey;
  if (state.phase === 'initiative' && onlineCode) onlineEntranceRooms.add(onlineCode);
  return onlineEntranceRooms.has(onlineCode) ? `online-${onlineCode}` : null;
}
const deckCount = player => player.deckCount ?? player.deck.length;
const handCount = player => player.handCount ?? player.hand.length;

function loadGame() {
  const readSave=key=>{
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  };
  const saved=readSave(SAVE_KEY);
  if(validateSavedGame(saved))return saved;
  for(const key of ['wizzy.duel.v12','wizzy.duel.v11','wizzy.duel.v10']){
    const migrated=migrateSavedGame(readSave(key));
    if(migrated)return migrated;
  }
  // Older catalogs remain retired; all previous saved keys stay intact.
  return createGame();
}
function saveGame() {
  if(isOnlineBattle())return;
  localState=state;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(localState)); storageAvailable = true; }
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
  player = displayedStats(player,index);
  return `<section class="stat-panel ${player.id} ${state.phase!=='initiative'&&state.activePlayer === index ? 'is-active' : ''}" aria-label="${player.name} wizard stats">
    ${art(player.id === 'fire' ? 'fireFrame' : 'waterFrame','stat-frame')}
    <div class="stat-heading"><span class="element-symbol" aria-hidden="true">${player.id === 'fire' ? '♨' : '◈'}</span><h2>${player.name}</h2><span class="player-label">${state.startingPlayer===null?'':state.startingPlayer===index?'1ST':'2ND'}</span>${state.phase!=='initiative'&&state.activePlayer === index ? '<span class="active-dot" aria-label="Active wizard"></span>' : ''}</div>
    <div class="stat-body"><div class="health-row"><span>HP</span><strong data-stat="${player.id}-hp">${player.hp}<small> / ${player.maxHp}</small></strong></div><div data-health-bar-slot="${index}"></div>
    <div class="resource-grid"><div class="resource mana"><i aria-hidden="true">◆</i><span>Mana</span><strong data-stat="${player.id}-mana" data-current="${player.mana}" data-cap="${MAX_MANA}" aria-label="${player.mana} Mana, maximum ${MAX_MANA}">${player.mana}<small class="stat-limit"> / ${MAX_MANA}</small></strong></div><div class="resource shield"><i aria-hidden="true">⬟</i><span>Shield</span><strong data-stat="${player.id}-shield" data-current="${player.shield}" data-cap="${MAX_SHIELD}" aria-label="${player.shield} Shield, maximum ${MAX_SHIELD}">${player.shield}<small class="stat-limit"> / ${MAX_SHIELD}</small></strong></div><div class="resource element"><i aria-hidden="true">${player.id === 'fire' ? '♨' : '≈'}</i><span>${player.elementName}</span><strong data-stat="${player.id}-element" data-current="${player.element}" data-cap="${player.id==='fire'?MAX_EMBERS:MAX_FLOW}">${player.element}<small class="stat-limit"> / ${player.id==='fire'?MAX_EMBERS:MAX_FLOW}</small></strong></div><div class="resource loaded"><i aria-hidden="true">⚄</i><span>Loaded</span><strong class="loaded-value" data-stat="${player.id}-loaded">+${player.loaded}${player.loadedPending?`<small title="Available next turn">+${player.loadedPending} next</small>`:''}</strong></div></div></div>
  </section>`;
}
function phaseHint(active) {
  const visual = activeSpellVisual || spellVisualQueue[0];
  if (visual) return `${state.players[visual.casterIndex].name} · ${SPELL_CATALOG[visual.spellId].name} is resolving…`;
  if (state.status === 'finished') return `${state.players[state.winner].name} wins the duel!`;
  if(state.phase==='setup')return 'Build and save your new Fire and Water decks in the Deck workshop.';
  if(state.phase==='initiative')return isOnlineBattle()
    ? onlineBusy?'Sending your opening roll…':state.initiative.rolls[onlinePlayerIndex]===null?'Roll your opening die. The higher roll goes first.':'Your opening die is rolled. Waiting for the other wizard.'
    : 'Both wizards roll one die to decide who goes first.';
  if(isOnlineBattle()&&!canActOnline()){
    if(onlineBusy)return 'Sending your move…';
    const actor=state.players[getActingPlayerIndex(state)];
    return state.phase==='fate'?`Waiting for ${actor.name} to finish Fate.`:`Waiting for ${active.name} to play or end their turn.`;
  }
  switch(state.phase) {
    case 'fate': return `${state.players[state.fatePlayer].name} · ${state.fatePlayer===state.activePlayer?'Attacking':'Defending'} Fate. Play one slab or Skip. ${state.pendingSpell?.fatePasses||0}/2 consecutive passes.`;
    case 'rolling': return 'Rolling two dice…';
    case 'enhancing': return `${active.name} is rolling Enhancement. ${ENHANCEMENT_THRESHOLD}+ gains 10%.`;
    case 'resolving': return 'Resolving your spell…';
    case 'end': return 'End Turn passes. Hand Refresh lets you choose discards first.';
    case 'refresh': return `${state.refreshCardIds.length} selected. Hand Refresh confirms and passes; End Turn skips refresh.`;
    case 'ready-to-pass': return 'Hand refreshed. Click End Turn to pass to the next wizard.';
    default: return state.primaryUsed?(state.primaryAction==='aura'?`Aura activated: +${AURA_BONUS}% damage for your next ${active.auraTurns} own turns. The activation turn does not count. End Turn to continue.`:state.primaryAction==='enhancement'&&state.lastRoll?.kind==='enhancement'?`${state.lastRoll.success?'Enhancement gained!':'Enhancement missed.'} ${active.enhancement}% for your next damaging spell. End Turn to continue.`:'Primary spell resolved. End Turn to continue.'):`${active.name} · cast a slab, Enhance, or activate Aura.`;
  }
}
function slabFace(card) {
  const slab=spellSlabMarkup(card.spellId,'card-image');
  if(slab)return `${slab}<span class="slab-mana">${card.manaCost} Mana</span><span class="sr-only">${escape(card.name)}. ${escape(card.effectText)}</span>`;
  return `${art(card.art,'card-image')}${spellArtMarkup(card.spellId)}<span class="card-name" style="--name-size:${card.name.length>12?18:21}px">${escape(card.name)}</span><span class="card-copy"><strong class="mana-cost">${card.manaCost} Mana</strong><span class="card-effect">${escape(card.effectText)}</span></span>`;
}
function cardView(card, active, finished) {
  const selected = state.phase==='fate'?state.selectedFateCardIds.includes(card.id):state.selectedCardId===card.id;
  const refreshSelected = state.refreshCardIds.includes(card.id);
  const pending = state.pendingCardId === card.id;
  const eligible=canActOnline()&&canSelectCard(state,card.id);
  const unavailable = finished || !canActOnline() || (state.phase!=='refresh'&&!eligible);
  const muted=state.phase==='fate'&&card.category!=='Fate';
  const inactiveFate=state.phase==='fate'&&card.category==='Fate'&&!eligible;
  return `<button class="spell-card slab-${card.type.toLowerCase()} ${selected ? 'selected' : ''} ${refreshSelected ? 'discard-selected' : ''} ${muted ? 'fate-muted' : ''} ${inactiveFate?'fate-unavailable':''} ${pending ? 'pending-card' : ''}" data-card-id="${escape(card.id)}" data-spell-id="${card.spellId}" data-slab-type="${card.type}" data-focus="${escape(card.id)}" aria-pressed="${state.phase === 'refresh' ? refreshSelected : selected}" aria-label="${escape(card.name)}. ${card.type}. ${card.manaCost} Mana. ${escape(card.effectText)} ${state.phase === 'refresh' ? (refreshSelected ? 'Selected for discard.' : 'Select to discard.') : ''}" title="${escape(card.name)} · ${card.manaCost} Mana. ${escape(card.effectText)}" ${unavailable ? 'disabled' : ''}>
    ${slabFace(card)}
    ${selected ? '<span class="card-badge">SELECTED</span>' : ''}${refreshSelected ? '<span class="card-badge discard-badge">✓ DISCARD</span>' : ''}${pending ? '<span class="card-badge pending-badge">CASTING</span>' : ''}
  </button>`;
}
function enhancementAvailable(playerIndex){
  return canActOnline()&&state.activePlayer===playerIndex&&canEnhance(state,playerIndex)
    &&(!isOnlineBattle()||onlinePlayerIndex===playerIndex);
}
function enhancementWidgets(){
  const index=state.activePlayer;
  const player=displayedStats(state.players[index],index);
  const maxed=player.enhancement>=MAX_ENHANCEMENT;
  const description=maxed?'MAX 30%':state.phase==='enhancing'?'ROLLING…':`${player.name.toUpperCase()} · 0 MANA · ${ENHANCEMENT_THRESHOLD}+`;
  const auraAvailable=canActOnline()&&canActivateAura(state,index)&&(!isOnlineBattle()||onlinePlayerIndex===index);
  const auraCaption=player.auraTurns?`ACTIVE · +${AURA_BONUS}% · ${player.auraTurns} TURNS`:`${AURA_COST} MANA · ${AURA_DURATION} OWN TURNS`;
  return `<div class="enhancement-status" aria-label="Both wizards’ damage bonuses">${state.players.map((wizard,i)=>displayedStats(wizard,i)).map((wizard,i)=>`<div class="enhancement-label ${wizard.id}" data-enhancement-player="${i}" data-enhancement="${wizard.enhancement}" aria-label="${wizard.name}: ${wizard.enhancement}% Enhancement; ${wizard.auraTurns?`${AURA_BONUS}% Aura, ${wizard.auraTurns} own turns remaining`:'Aura inactive'}"><small>${wizard.name.toUpperCase()}</small><strong>${wizard.enhancement}% Enh.</strong><span class="aura-status" data-aura-turns-player="${i}" data-aura-turns="${wizard.auraTurns}">${wizard.auraTurns?`+${AURA_BONUS}% Aura · ${wizard.auraTurns} turns`:'Aura inactive'}</span></div>`).join('')}</div><div class="enhance-controls" aria-label="${player.name} primary actions"><button type="button" class="enhance-button ${player.id}" data-enhance-player="${index}" data-focus="enhance-${index}" aria-label="${player.name} Enhancement. ${maxed?'Maximum 30% reached.':`Roll 2d6: ${ENHANCEMENT_THRESHOLD}+ gains 10% for your next damaging spell, instead of a primary spell. Zero Mana. Current ${player.enhancement}%.`}" title="Instead of a primary spell: roll ${ENHANCEMENT_THRESHOLD}+ to gain 10% for your next damaging spell. 0 Mana." ${enhancementAvailable(index)?'':'disabled'}>${art('enhanceButtons','enhance-button-art',ASSET_CROPS[player.id==='fire'?'enhanceFire':'enhanceWater'])}<span class="enhance-button-caption">${description}</span></button><button type="button" class="enhance-button aura-button" data-aura-player="${index}" data-focus="aura-${index}" aria-label="${player.name} Aura. ${player.auraTurns?`Active: 10% damage, ${player.auraTurns} own turns remaining.`:`Spend ${AURA_COST} Mana for 10% damage for ${AURA_DURATION} subsequent own turns; activation does not count. Uses your primary action. No dice.`}" title="${player.auraTurns?'Aura is already active':`1 Mana: +10% damage for your next 3 own turns. Activation does not count. Uses your primary action.`}" ${auraAvailable?'':'disabled'}>${art('auraButton','enhance-button-art aura-button-art')}<span class="enhance-button-caption">${auraCaption}</span></button></div>`;
}
const pipPositions={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function pips(value) {
  return value?Array.from({length:9},(_,i)=>`<i class="die-pip ${pipPositions[value].includes(i)?'visible':''}"></i>`).join(''):'<span class="unrolled-mark">?</span>';
}
function diceFace(value,index) {
  return `<span class="die-face" data-die-index="${index}" data-die-value="${value??''}">${art('dicePair','die-border',ASSET_CROPS[index===0?'diceLeft':'diceRight'])}<span class="die-surface">${pips(value)}</span></span>`;
}
function renderOpeningRoll() {
  const dialog=document.querySelector('#opening-roll');
  if(battleView.hidden||state.status!=='playing'){
    if(dialog.open)dialog.close();
    return;
  }
  const initiative=state.initiative;
  if(!initiative||initiative.legacy){if(dialog.open)dialog.close();return;}
  if(state.phase==='initiative')openingAcknowledged[battleMode]=false;
  const completed=initiative.winner!==null;
  if(state.phase!=='initiative'&&(openingAcknowledged[battleMode]||!completed)){
    if(dialog.open)dialog.close();
    return;
  }
  const focusPlayer=document.activeElement?.dataset.openingPlayer;
  const winner=completed?state.players[initiative.winner]:null;
  const second=completed?state.players[1-initiative.winner]:null;
  document.querySelector('#opening-title').textContent=winner?`${winner.name} goes first!`:initiative.history.length?'Tie! Roll again':'Roll for first turn';
  const previousTie=initiative.history.at(-1);
  document.querySelector('#opening-roll-content').innerHTML=`<p class="opening-explanation">${completed?`${winner.name} won the opening roll. ${second.name} draws one extra slab when their first turn begins.`:'Each wizard rolls one six-sided die. The higher roll starts. Fate and Loaded do not affect this roll.'}</p><div class="opening-players">${state.players.map((player,index)=>{
    const value=initiative.rolls[index];
    const own=!isOnlineBattle()||onlinePlayerIndex===index;
    const disabled=completed||value!==null||onlineBusy;
    return `<section class="opening-player ${player.id} ${own?'is-own':''}" aria-label="${player.name} opening roll"><strong>${player.name}${isOnlineBattle()&&own?' · YOU':''}</strong><div class="opening-die">${diceFace(value,index)}</div><span class="opening-value" data-testid="opening-value-${index}">${value===null?'Not rolled':value}</span>${own&&!completed?`<button class="secondary-button" data-opening-player="${index}" ${disabled?'disabled':''}>${value!==null?'Rolled':onlineBusy?'Rolling…':`Roll ${player.name}`}</button>`:!completed?'<span class="opening-wait">Waiting for their roll</span>':''}</section>`;
  }).join('')}</div>${previousTie?`<p class="opening-tie">Previous round tied ${previousTie.rolls[0]}–${previousTie.rolls[1]}. Both dice reset.</p>`:''}<p class="dialog-footnote">Both players start with ${OPENING_HAND_SIZE} slabs. The second player draws 1 when their first turn begins. Hand limit: ${HAND_LIMIT}.</p>`;
  const continueButton=document.querySelector('#opening-continue');
  continueButton.hidden=!completed;
  continueButton.textContent=completed?(isOnlineBattle()?initiative.winner===onlinePlayerIndex?'Begin your turn':'View battle':`Begin ${winner.name}’s turn`):'Begin battle';
  if(!dialog.open)dialog.showModal();
  if(focusPlayer!==undefined)dialog.querySelector(`[data-opening-player="${focusPlayer}"]`)?.focus({preventScroll:true});
}
const signed=value=>`${value>=0?'+':''}${value}`;
function diceView() {
  if(state.phase==='initiative')return `<section class="dice-area" aria-label="Opening rolls">${art('diceFrame','dice-frame')}<strong class="roll-total">Opening roll</strong><div class="dice-pair">${diceFace(state.initiative.rolls[0],0)}${diceFace(state.initiative.rolls[1],1)}</div><span class="roll-breakdown">FIRE · WATER</span><span class="dice-caption">HIGHER ROLL TAKES THE FIRST TURN</span></section>`;
  const rolling=['rolling','enhancing'].includes(state.phase);
  const last=rolling?null:state.lastRoll;
  const enhancement=last?.kind==='enhancement';
  const immediate=!rolling&&!last&&state.primaryUsed&&!state.pendingSpell;
  const aura=immediate&&state.primaryAction==='aura';
  const title=rolling?'Rolling…':last?`Total: ${last.total}`:aura?'Aura active':immediate?'Spell resolved':state.phase==='setup'?'Build your decks':'Ready to roll';
  const equation=enhancement?`${last.dice[0]} + ${last.dice[1]} · ${ENHANCEMENT_THRESHOLD}+ NEEDED · ${last.success?'SUCCESS':'MISS'}`:last?`${last.dice[0]} + ${last.dice[1]} ${signed(last.loadedBonus)} Loaded ${signed(last.attackingFate)} Fate ${signed(last.defendingFate)} Fate`:state.phase==='enhancing'?`RAW 2d6 · ${ENHANCEMENT_THRESHOLD}+ GAINS 10%`:state.pendingSpell?`Loaded ${signed(state.pendingSpell.loadedBonus)} · Attack ${signed(state.pendingSpell.attackingFate)} · Defend ${signed(state.pendingSpell.defendingFate)}`:immediate?'No dice required':'Two six-sided dice';
  const caption=enhancement?`${state.players[last.casterIndex].name.toUpperCase()} · ENHANCEMENT ${last.enhancementBefore}% → ${last.enhancementAfter}%`:last?`${state.players[last.casterIndex].name.toUpperCase()} · ${escape(SPELL_CATALOG[last.spellId].name)} · ${state.phase==='fate'?'FATE CHAIN OPEN':'RESOLVED ROLL'}`:state.phase==='enhancing'?'ENHANCEMENT · NO FATE OR LOADED':aura?`+${AURA_BONUS}% DAMAGE · ${state.players[state.activePlayer].auraTurns} UPCOMING OWN TURNS`:immediate?'IMMEDIATE SPELL · NO FATE':'ROLL FIRST · THEN DEFENDING FATE';
  return `<section class="dice-area ${rolling?'dice-rolling':''}" data-roll-kind="${state.phase==='enhancing'||enhancement?'enhancement':aura?'aura':'spell'}" aria-label="${escape(last?`Dice ${last.dice.join(' and ')}. ${enhancement?'Enhancement':'Modified'} total ${last.total}.`:title)}">${art('diceFrame','dice-frame')}<strong class="roll-total" data-testid="roll-total">${title}</strong><div class="dice-pair">${diceFace(last?.dice[0],0)}${diceFace(last?.dice[1],1)}</div><span class="roll-breakdown">${equation}</span><span class="dice-caption">${caption}</span></section>`;
}
function selectedTwistDirections(){
  const player=state.players[getActingPlayerIndex(state)];
  return Object.fromEntries(player.hand.filter(card=>state.selectedFateCardIds.includes(card.id)&&card.spellId==='FAT-003').map(card=>[card.id,twistDirections[card.id]??(state.fatePlayer===state.activePlayer?2:-2)]));
}
function twistOptions(){
  if(state.phase!=='fate'||!canActOnline())return '';
  return Object.entries(selectedTwistDirections()).map(([id,value],index)=>`<div class="twist-choice" role="group" aria-label="Twist ${index+1} roll change"><span>Twist ${index+1}</span>${[-2,2].map(amount=>`<button class="text-button" type="button" data-twist-card="${escape(id)}" data-twist-value="${amount}" aria-pressed="${value===amount}">${signed(amount)}</button>`).join('')}</div>`).join('');
}
function hintView(active,selected) {
  if(isOnlineBattle()&&!canActOnline())return phaseHint(active);
  if(state.phase==='main'&&state.primaryUsed)return `${phaseHint(active)}${selected?'<div class="hint-actions"><button class="text-button" id="inspect-selected">Read slab</button></div>':''}`;
  if(selected&&['main','fate'].includes(state.phase)){
    const label=state.phase==='fate'?`${escape(selected.name)} · one Fate response`:`${escape(selected.name)} · ${selected.manaCost} Mana${active.mana<selected.manaCost?' · Not enough mana':''}`;
    return `<span>${label}</span>${twistOptions()}<div class="hint-actions"><button class="text-button" id="inspect-selected">Read slab</button>${state.phase==='fate'?'<button class="text-button" id="skip-fate">Skip Fate</button>':''}</div>`;
  }
  return phaseHint(active);
}
function render() {
  const active = state.players[state.activePlayer];
  const displayPlayer=state.players[displayedPlayerIndex()];
  const finished = state.status !== 'playing' && !spellVisualBusy();
  const opening = state.phase === 'initiative';
  const isFate = state.phase === 'fate';
  const resolving = ['rolling','enhancing','resolving'].includes(state.phase) || spellVisualBusy();
  const ending = ['end','refresh','ready-to-pass'].includes(state.phase);
  const showRefresh = ['end','refresh'].includes(state.phase) && !finished && (!isOnlineBattle()||state.activePlayer===onlinePlayerIndex);
  const selected=displayPlayer.hand.find(card=>card.id===state.selectedCardId);
  const fateCount=state.selectedFateCardIds.length;
  const castLabel=isFate?(fateCount?'Cast Fate':'Skip Fate'):resolving?'Resolving spell':'Cast Spell';
  const castArt=isFate?(fateCount?'castFate':'skipFate'):'cast';
  const focusKey = document.activeElement?.dataset.focus;
  document.querySelector('#battle-session-label').textContent=isOnlineBattle()?`ROOM ${onlineCode} · YOU ARE ${displayPlayer.name.toUpperCase()}`:'LOCAL DUEL · FIRE / WATER';
  document.querySelector('#battle-connection').textContent=isOnlineBattle()?(onlineStatus||'Connected · private hand'):'';
  document.querySelector('#battle-connection').hidden=!isOnlineBattle();
  document.querySelector('#battle-new').hidden=isOnlineBattle();
  document.querySelector('#battle-online-lobby').hidden=!isOnlineBattle();
  document.querySelector('#request-restart').disabled=isOnlineBattle();
  document.querySelector('#victory-restart').hidden=isOnlineBattle();
  document.querySelector('#victory-online').hidden=!isOnlineBattle();
  app.innerHTML = `<div class="game-shell">
    <header class="topbar"><span class="wordmark">WIZZY <small>BATTLE SIMULATOR</small></span><span class="save-state">${storageAvailable ? '✦ DUEL SAVED' : 'SAVING UNAVAILABLE'}</span><button class="view-toggle" id="toggle-fit" aria-label="${fitScreen?'Switch to larger view':'Fit game to screen'}">${fitScreen?'Larger view ↗':'Fit screen ↙'}</button><button class="settings-button" id="open-settings" aria-label="Open settings and game rules">⚙</button></header>
    <div class="game-board ${active.id} phase-${state.phase}" style="--forest:url('${ASSETS.forest}')">
    <div data-battle-scene-slot></div>
    <div class="battle-hud">${playerPanel(state.players[0],0)}${diceView()}${playerPanel(state.players[1],1)}</div>
    <section class="hand-chamber" aria-labelledby="hand-title">${handFrame()}<h2 class="sr-only" id="hand-title">${displayPlayer.name} wizard’s hand</h2><div class="hand-content"><div class="hand-meta"><span>${isOnlineBattle()?'YOUR ':''}${displayPlayer.name.toUpperCase()} · ${isOnlineBattle()&&!canActOnline()?'WAITING':isFate?(state.fatePlayer===state.activePlayer?'ATTACKING FATE':'DEFENDING FATE'):'SPELLBOOK'}</span><span data-testid="hand-count">${handCount(displayPlayer)} / ${HAND_LIMIT} SLABS</span></div>
    <div class="cards ${displayPlayer.id} cards-${displayPlayer.hand.length}" aria-label="${displayPlayer.name} wizard’s spell slabs">${displayPlayer.hand.map(card=>cardView(card,displayPlayer,finished)).join('')||'<div class="empty-hand"><span>✧</span><p>No spells in hand.<br>Refresh your hand or draw on your next turn.</p></div>'}</div>
    ${enhancementWidgets()}<div class="hand-bottomline"><div class="pile" aria-label="${displayPlayer.name} discard pile">${art('stoneSign','pile-sign')}<span class="pile-copy">Discard Pile<strong data-testid="discard-count">${displayPlayer.discard.length} <small>${displayPlayer.discard.length===1?'slab':'slabs'}</small></strong></span></div><span class="hand-note">${isOnlineBattle()&&!canActOnline()?'YOUR PRIVATE HAND':state.phase==='refresh'?'GREY SLABS WILL BE DISCARDED':isFate?'FATE WINDOW':ending?'ENDING YOUR TURN':'CHOOSE YOUR MAGIC'}</span><button class="pile tower-pile" id="view-deck" aria-label="View ${displayPlayer.name} spell slab decklist">${art('stoneSign','pile-sign')}<span class="pile-copy">Spell Tower<strong data-testid="deck-count">${deckCount(displayPlayer)} <small>${deckCount(displayPlayer)===1?'slab':'slabs'}</small></strong></span></button></div></div></section>
    <div class="turn-controls"><div class="phase-hint" role="status">${hintView(active,selected)}${isOnlineBattle()&&state.pendingSpell?'<button class="text-button" id="inspect-pending">Read pending spell</button>':''}</div>
    <div class="action-bar"><div class="round-plaque" aria-label="${opening?'Opening roll':`Round ${state.round}, ${active.name} wizard’s turn`}">${art('round','round-art')}<span class="round-cover"><strong>Round <span data-testid="round-number">${state.round}</span></strong><span>${finished?'Duel complete':opening?'Opening roll':`${active.name}’s Turn`}</span></span></div>
    <button class="art-button cast-button" id="cast-spell" data-focus="cast" aria-label="${castLabel}" ${finished||resolving||!canActOnline()||(isFate?(fateCount>0&&!canCastSelected(state)):!canCastSelected(state))?'disabled':''}>${art(castArt,'button-art')}</button>
    <div class="end-controls"><button class="art-button refresh-button ${showRefresh?'is-revealed':''} ${state.phase==='refresh'?'is-confirming':''}" id="hand-refresh" data-focus="refresh" aria-label="${state.phase==='refresh'?`Confirm hand refresh and pass, ${state.refreshCardIds.length} slabs selected`:'Hand Refresh'}" ${!showRefresh||!canActOnline()?'disabled tabindex="-1"':''} ${!showRefresh?'aria-hidden="true"':''}>${art('refresh','button-art')}${state.phase==='refresh'?`<span class="refresh-count">${state.refreshCardIds.length} selected · confirm</span>`:''}</button><button class="art-button end-button ${ending?'is-ending':''}" id="end-turn" data-focus="end" aria-label="${['end','refresh','ready-to-pass'].includes(state.phase)?`End Turn and pass to ${state.players[1-state.activePlayer].name}`:'End Turn'}" ${finished||!canActOnline()||(isOnlineBattle()&&state.activePlayer!==onlinePlayerIndex)||['fate','rolling','enhancing','resolving'].includes(state.phase)?'disabled':''}>${art('endTurn','button-art')}</button></div></div></div>
    <details class="combat-log" ${logOpen?'open':''}><summary aria-label="View combat log">${art('combatLog','log-button')}<span class="log-count">${state.log.length}</span><span class="chevron" aria-hidden="true">⌄</span></summary><ol>${state.log.slice().reverse().map(entry=>`<li><span class="log-round">R${entry.round}</span><span>${escape(entry.message)}</span></li>`).join('')}</ol></details>
    <footer class="game-footer"><span>${isOnlineBattle()?'TWO SCREENS · YOUR HAND IS PRIVATE':'LOCAL DUEL · TWO WIZARDS, ONE SCREEN'}</span><span>FIRE · WATER · FATE</span></footer></div></div>`;
  const entranceKey = arenaEntranceKey();
  if (entranceKey) battleScene.prepareEntrance(entranceKey);
  else battleScene.finishEntrance();
  battleScene.setActive(state.phase === 'initiative' ? null : state.activePlayer);
  app.querySelector('[data-battle-scene-slot]').replaceWith(battleScene.element);
  healthBars.mount(app,state.players.map((player,index)=>displayedStats(player,index)));
  app.querySelector('.combat-log').addEventListener('toggle', event=>{logOpen=event.target.open;fitBoard();});
  if(focusKey) app.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  scheduleCombat();
  fitBoard();
  syncEmberChoice();
  renderOpeningRoll();
}
// The forest and every game element share one undistorted 1024 × 1536 canvas.
// Only this outer scale changes with the viewport; log expansion never resizes it.
function fitBoard() {
  const width=document.documentElement.clientWidth;
  const height=Math.max(1,innerHeight-(document.querySelector('.battle-navigation')?.offsetHeight||0));
  const scale=fitScreen?Math.min(width/1024,height/1536):Math.min(1,width/1024);
  app.style.setProperty('--board-scale',String(scale));
  app.style.width=`${1024*scale}px`;
  app.style.height=`${1536*scale}px`;
  app.style.marginTop=fitScreen?`${Math.max(0,(height-1536*scale)/2)}px`:'0px';
  positionEmberChoice();
  fitSlabText(app);
  document.querySelectorAll('dialog[open]').forEach(dialog=>fitSlabText(dialog));
}
window.addEventListener('resize',fitBoard);
function spellVisualBusy() {
  return Boolean(activeSpellVisual || spellVisualQueue.length);
}
function displayedStats(player,index) {
  return presentedPlayers?.[index] ? {...player,...presentedPlayers[index]} : player;
}
function cancelSpellPresentation() {
  spellVisualGeneration += 1;
  spellAnimator.cancel({settle:false});
  activeSpellVisual=null;
  spellVisualQueue=[];
  presentedPlayers=null;
  pendingVictory=false;
  healthBars.reset();
}
function showPendingVictory() {
  if(!pendingVictory || spellVisualBusy() || healthBars.isAnimating() || battleView.hidden || state.status!=='finished')return;
  pendingVictory=false;
  document.querySelector('#victory-title').textContent=`${state.players[state.winner].name} wins!`;
  document.querySelector('#victory-description').textContent=`The opposing wizard has reached 0 HP. The duel is complete after ${state.round} ${state.round===1?'round':'rounds'}.`;
  if(!document.querySelector('#victory').open)document.querySelector('#victory').showModal();
}
function playNextSpellVisual() {
  if(activeSpellVisual || !spellVisualQueue.length || battleView.hidden)return;
  const event=spellVisualQueue.shift();
  activeSpellVisual=event;
  const generation=spellVisualGeneration;
  const isCurrent=()=>generation===spellVisualGeneration && activeSpellVisual===event;
  const impact=()=>{
    if(!isCurrent())return;
    // The engine already resolved and saved the spell. Only its displayed
    // counters wait for impact; animation callbacks never apply combat effects.
    if(!spellVisualQueue.length)presentedPlayers=null;
    render();
  };
  const complete=()=>{
    if(!isCurrent())return;
    activeSpellVisual=null;
    if(spellVisualQueue.length)playNextSpellVisual();
    else {
      presentedPlayers=null;
      render();
      showPendingVictory();
    }
  };
  battleScene.finishEntrance();
  spellAnimator.play({...event,onImpact:impact,onComplete:complete})
    .then(result=>{if(result.duplicate)complete();}).catch(complete);
}
function update(next,message) {
  if(next===state)return;
  const wasPlaying=state.status==='playing';
  const visuals=battleView.hidden?[]:getResolvedSpellVisuals(state,next);
  if(visuals.length){
    // A newer online spell can arrive while the last hit is still recovering.
    if(!presentedPlayers)presentedPlayers=state.players.map(player=>Object.fromEntries(
      ['hp','shield','element','loaded','loadedPending','enhancement','auraTurns'].map(key=>[key,player[key]])
    ));
    const duelKey=isOnlineBattle()?`online-${onlineCode}`:localEntranceKey||'saved-local';
    spellVisualQueue.push(...visuals.map(event=>({...event,key:`${duelKey}:${event.key}`})));
  }
  if(wasPlaying && next.status==='finished' && !battleView.hidden)pendingVictory=true;
  state=next;saveGame();render();
  document.querySelector('#announcement').textContent=message||state.log.at(-1)?.message||'';
  playNextSpellVisual();
  showPendingVictory();
}
function clearCombatTimers() {
  clearTimeout(resolutionTimer);
  clearInterval(diceAnimationTimer);
}
function scheduleCombat() {
  clearCombatTimers();
  if(isOnlineBattle()||battleView.hidden||spellVisualBusy()||handoff.open||document.querySelector('#restart').open||state.status!=='playing')return;
  if(['rolling','enhancing'].includes(state.phase)){
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      diceAnimationTimer=setInterval(()=>{
        app.querySelectorAll('.die-face').forEach(face=>{
          const value=1+Math.floor(Math.random()*6);
          face.dataset.dieValue=String(value);
          face.querySelector('.die-surface').innerHTML=pips(value);
        });
      },90);
    }
    resolutionTimer=setTimeout(()=>{
      if(state.phase==='enhancing'){
        update(rollEnhancement(state));
        app.querySelector('#end-turn')?.focus({preventScroll:true});
      }else advanceFateWindow(rollDice(state));
    },650);
  }else if(state.phase==='resolving') {
    resolutionTimer=setTimeout(()=>{
      update(resolveSpell(state));
      app.querySelector('#end-turn')?.focus({preventScroll:true});
    },450);
  }
}
function showHandoff(playerIndex=state.activePlayer,kind='turn') {
  if(isOnlineBattle())return;
  clearCombatTimers();
  const player=state.players[playerIndex];
  document.querySelector('#handoff-title').textContent=kind==='fate'?`${player.name} · ${playerIndex===state.activePlayer?'attacking':'defending'} Fate`:`${player.name}’s turn`;
  document.querySelector('#handoff-description').textContent=kind==='fate'?`The dice have rolled${state.lastRoll?` ${state.lastRoll.dice.join(' + ')} for a modified total of ${state.lastRoll.total}`:''}. Pass the screen to ${player.name}. Play one Fate slab or Skip Fate. Your opponent can respond after every card. Two consecutive passes resolve the spell.`:`Round ${state.round}. Pass the screen to the ${player.name} wizard. Your hand is ready.`;
  document.querySelector('#handoff-portrait').innerHTML=art(player.id==='fire'?'fireMage':'waterMage');
  document.querySelector('#begin-turn').innerHTML=`${kind==='fate'?'Choose Fate':'Begin turn'} <span aria-hidden="true">→</span>`;
  handoff.showModal();
}
function finishFateWindow() {
  if(isOnlineBattle()){sendOnlineAction('skipFate');return;}
  advanceFateWindow(skipFate(state));
}
function advanceFateWindow(next) {
  const previous=state;
  if(next===state)return;
  update(next);
  if(state.phase==='fate'&&state.fatePlayer!==previous.fatePlayer)showHandoff(state.fatePlayer,'fate');
}
function commitSpell(emberSpend=0) {
  if(isOnlineBattle()){sendOnlineAction('castSpell',{emberSpend});return;}
  update(castSelected(state,{emberSpend}));
  app.querySelector(state.phase==='fate'?'#cast-spell':'.spell-card:not(:disabled)')?.focus({preventScroll:true});
}
function closeEmberChoice(restoreFocus=false) {
  const choice=emberChoice;
  emberChoice=null;
  const dialog=document.querySelector('#ember-choice');
  if(dialog.open)dialog.close();
  if(restoreFocus&&choice)app.querySelector(`[data-card-id="${CSS.escape(choice.cardId)}"]`)?.focus({preventScroll:true});
}
function positionEmberChoice() {
  const dialog=document.querySelector('#ember-choice');
  if(!dialog?.open||!emberChoice)return;
  const anchor=app.querySelector(`[data-card-id="${CSS.escape(emberChoice.cardId)}"]`);
  if(!anchor)return;
  const card=anchor.getBoundingClientRect();
  const view=window.visualViewport;
  const minLeft=(view?.offsetLeft||0)+8;
  const minTop=(view?.offsetTop||0)+8;
  const width=view?.width||innerWidth;
  const height=view?.height||innerHeight;
  const popup=dialog.getBoundingClientRect();
  const left=Math.max(minLeft,Math.min(card.left+card.width/2-popup.width/2,minLeft+width-popup.width-16));
  const top=Math.max(minTop,Math.min(card.top-popup.height-12,minTop+height-popup.height-16));
  dialog.style.left=`${left}px`;
  dialog.style.top=`${top}px`;
  dialog.style.setProperty('--ember-arrow-left',`${Math.max(18,Math.min(popup.width-26,card.left+card.width/2-left-6))}px`);
}
function syncEmberChoice() {
  if(!emberChoice)return;
  const player=state.players[state.activePlayer];
  const card=player.hand.find(entry=>entry.id===emberChoice.cardId);
  if(battleView.hidden||state.phase!=='main'||!canActOnline()||!canCastSelected(state)
    ||state.selectedCardId!==emberChoice.cardId||state.activePlayer!==emberChoice.playerIndex
    ||state.round!==emberChoice.round||!card){closeEmberChoice();return;}
  const range=getEmberSpendRange(card.spellId,player.element);
  if(range.mandatory||range.max===0){closeEmberChoice();return;}
  document.querySelector('#ember-description').textContent=`${player.element} available · choose 0–${range.max}.`;
  document.querySelector('#ember-amount').max=String(range.max);
  positionEmberChoice();
}
function requestCast() {
  if(!canActOnline())return;
  if(state.phase==='fate'){
    if(state.selectedFateCardIds.length){
      const options={twistDirections:selectedTwistDirections()};
      if(isOnlineBattle())sendOnlineAction('castFate',options);
      else advanceFateWindow(castFateSelected(state,options));
    }
    else finishFateWindow();
    return;
  }
  if(!canCastSelected(state))return;
  const player=state.players[state.activePlayer];
  const card=player.hand.find(card=>card.id===state.selectedCardId);
  const range=getEmberSpendRange(card.spellId,player.element);
  if(!range.mandatory&&range.max>0){
    const dialog=document.querySelector('#ember-choice');
    if(dialog.open){document.querySelector('#ember-amount').focus({preventScroll:true});return;}
    emberChoice={cardId:card.id,playerIndex:state.activePlayer,round:state.round};
    document.querySelector('#ember-title').textContent=`${card.name} · Embers`;
    document.querySelector('#ember-description').textContent=`${player.element} available · choose 0–${range.max}.`;
    const input=document.querySelector('#ember-amount');
    input.min=String(range.min);input.max=String(range.max);input.value='0';
    document.querySelector('#ember-error').textContent='';
    dialog.classList.add('ember-popover');
    dialog.setAttribute('aria-modal','false');
    dialog.setAttribute('aria-describedby','ember-description');
    dialog.show();
    positionEmberChoice();
    input.focus({preventScroll:true});
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
  const timing=spell.category==='Fate'?'Play one Fate slab in your post-roll response. Players alternate until two consecutive passes. Twist may add 2 or subtract 2.':SPELL_RULES[spellId].requiresRoll?'Pay Mana and roll two dice. The defender responds first, then players alternate one Fate slab at a time until two consecutive passes. Your Enhancement increases outgoing damage before Shield.':'Resolves immediately, without a dice roll or Fate window.';
  document.querySelector('#slab-behavior').textContent=`${spell.effectText} ${timing}`;
  if(!dialog.open)dialog.showModal();
  fitSlabText(dialog);
}
function showDeck(playerId=state.players[displayedPlayerIndex()].id) {
  const player=state.players.find(player=>player.id===playerId);
  if(!player?.deckDefinition||isOnlineBattle()&&player!==state.players[onlinePlayerIndex])return;
  const groups=['Elemental','Fate'].map(category=>{
    const entries=player.deckDefinition.entries.filter(entry=>SPELL_CATALOG[entry.spellId].category===category);
    const quantity=entries.reduce((sum,entry)=>sum+entry.quantity,0);
    return `<section class="deck-group"><h3>${category}<span>${quantity} slabs</span></h3>${entries.map(entry=>{
      const spell=SPELL_CATALOG[entry.spellId];
      return `<button class="deck-row slab-${spell.type.toLowerCase()}" data-inspect-spell="${spell.spellId}" aria-label="Read ${escape(spell.name)}, ${entry.quantity} copies, ${spell.manaCost} Mana"><span class="deck-thumbnail">${spellSlabMarkup(spell.spellId)||art(spell.art)}</span><span class="deck-spell-name">${escape(spell.name)}<small>${spell.spellId} · ${spell.type}</small></span><span class="deck-mana">${spell.manaCost}<small>Mana</small></span><strong class="deck-quantity" data-spell-id="${spell.spellId}">×${entry.quantity}</strong></button>`;
    }).join('')}</section>`;
  }).join('');
  document.querySelector('#deck-heading').textContent=`${player.name} deck · ${DECK_SIZE} spell slabs`;
  document.querySelector('#deck-summary').textContent=`${deckCount(player)} in tower · ${handCount(player)} in hand · ${player.discard.length} discarded. Current battle deck · ${player.deckDefinition.entries.length} distinct spells.`;
  document.querySelector('#deck-entries').innerHTML=groups;
  document.querySelectorAll('[data-deck-player]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.deckPlayer===playerId));
    button.hidden=isOnlineBattle()&&button.dataset.deckPlayer!==state.players[onlinePlayerIndex].id;
  });
  const dialog=document.querySelector('#deck-inspector');
  if(!dialog.open)dialog.showModal();
  fitSlabText(dialog);
}
document.querySelector('#deck-inspector').addEventListener('click',event=>{
  const spell=event.target.closest('[data-inspect-spell]');
  if(spell)showSlab(spell.dataset.inspectSpell);
  const tab=event.target.closest('[data-deck-player]');
  if(tab)showDeck(tab.dataset.deckPlayer);
});
app.addEventListener('click',event=>{
  const aura=event.target.closest('[data-aura-player]');
  if(aura){
    const playerIndex=Number(aura.dataset.auraPlayer);
    if(!canActOnline()||!canActivateAura(state,playerIndex))return;
    if(isOnlineBattle())sendOnlineAction('aura');
    else {
      update(activateAura(state));
      app.querySelector('#end-turn')?.focus({preventScroll:true});
    }
    return;
  }
  const enhancement=event.target.closest('[data-enhance-player]');
  if(enhancement){
    const playerIndex=Number(enhancement.dataset.enhancePlayer);
    if(!enhancementAvailable(playerIndex))return;
    if(isOnlineBattle())sendOnlineAction('enhance');
    else update(activateEnhancement(state));
    return;
  }
  const twist=event.target.closest('[data-twist-card]');
  if(twist){
    twistDirections[twist.dataset.twistCard]=Number(twist.dataset.twistValue);
    render();
    app.querySelector(`[data-twist-card="${CSS.escape(twist.dataset.twistCard)}"][data-twist-value="${twist.dataset.twistValue}"]`)?.focus({preventScroll:true});
    return;
  }
  const card=event.target.closest('[data-card-id]');
  if(card){
    if(!canActOnline())return;
    if(isOnlineBattle())sendOnlineAction(state.phase==='refresh'?'toggleRefreshCard':'selectCard',{cardId:card.dataset.cardId});
    else update(state.phase==='refresh'?toggleRefreshCard(state,card.dataset.cardId):selectCard(state,card.dataset.cardId));
    return;
  }
  const button=event.target.closest('button');if(!button)return;
  switch(button.id){
    case 'toggle-fit':fitScreen=!fitScreen;render();break;
    case 'open-settings':document.querySelector('#settings').showModal();break;
    case 'view-deck':showDeck();break;
    case 'inspect-pending':if(state.pendingSpell)showSlab(state.pendingSpell.spellId);break;
    case 'inspect-selected':{
      const selected=state.players[displayedPlayerIndex()].hand.find(card=>card.id===state.selectedCardId);
      if(selected)showSlab(selected.spellId);
      break;
    }
    case 'cast-spell':
      requestCast();break;
    case 'skip-fate':finishFateWindow();break;
    case 'end-turn':{
      if(!canActOnline())break;
      if(isOnlineBattle()){sendOnlineAction('endTurn');break;}
      const previous=state.activePlayer;update(endTurn(state));
      if(state.activePlayer!==previous)showHandoff();
      else if(state.phase==='end')app.querySelector('#hand-refresh')?.focus({preventScroll:true});
      break;
    }
    case 'hand-refresh':{
      if(!canActOnline())break;
      if(isOnlineBattle()){sendOnlineAction(state.phase==='refresh'?'confirmRefresh':'beginRefresh');break;}
      const previous=state.activePlayer;
      update(state.phase==='refresh'?confirmRefresh(state):beginRefresh(state));
      if(state.activePlayer!==previous)showHandoff();
      else app.querySelector(state.phase==='refresh'?'[data-card-id]':'#end-turn')?.focus({preventScroll:true});
      break;
    }
    case 'cancel-refresh':if(!isOnlineBattle())update(cancelRefresh(state));break;
  }
});

document.querySelector('#begin-turn').addEventListener('click',()=>{handoff.close();scheduleCombat();app.querySelector('.spell-card:not(:disabled)')?.focus({preventScroll:true});});
document.querySelector('#opening-roll').addEventListener('click',event=>{
  const button=event.target.closest('[data-opening-player]');
  if(!button||button.disabled||state.phase!=='initiative')return;
  if(isOnlineBattle())sendOnlineAction('rollInitiative');
  else update(rollInitiative(state,Number(button.dataset.openingPlayer)));
});
document.querySelector('#opening-continue').addEventListener('click',()=>{
  if(state.phase==='initiative')return;
  openingAcknowledged[battleMode]=true;
  document.querySelector('#opening-roll').close();
  battleScene.startEntrance(arenaEntranceKey());
  app.querySelector('.spell-card:not(:disabled)')?.focus({preventScroll:true});
});
document.querySelector('#opening-home').addEventListener('click',()=>leaveBattle('home'));
document.querySelector('#opening-roll').addEventListener('cancel',event=>event.preventDefault());
// Avoid revealing the next hand accidentally by dismissing a pass-screen dialog.
handoff.addEventListener('cancel',event=>event.preventDefault());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
document.querySelector('#request-restart').addEventListener('click',()=>{document.querySelector('#settings').close();requestNewBattle();});
document.querySelector('#settings-deck').addEventListener('click',()=>{document.querySelector('#settings').close();showDeck();});
function restartGame() {
  if(isOnlineBattle())return;
  clearCombatTimers();
  for(const id of ['victory','restart','ember-choice'])document.getElementById(id).close();
  const decks=pendingBattleDecks||hub.getSavedDecks();
  pendingBattleDecks=null;
  if(shouldEnterAfterRestart){shouldEnterAfterRestart=false;enterBattle();}
  openingAcknowledged.local=false;
  update(createLocalGame(decks),'A new duel has begun with your saved decks. Roll to decide who starts.');
}
document.querySelector('#confirm-restart').addEventListener('click',restartGame);
document.querySelector('#victory-restart').addEventListener('click',restartGame);
document.querySelector('#confirm-embers').addEventListener('click',()=>{
  if(!emberChoice)return;
  syncEmberChoice();
  if(!emberChoice)return;
  const input=document.querySelector('#ember-amount');
  const amount=Number(input.value);
  if(!input.reportValidity()||!Number.isSafeInteger(amount)||amount<Number(input.min)||amount>Number(input.max)){
    document.querySelector('#ember-error').textContent=`Choose a whole number from ${input.min} to ${input.max}.`;
    positionEmberChoice();
    return;
  }
  closeEmberChoice();
  commitSpell(amount);
});
document.querySelector('#ember-choice').addEventListener('close',()=>{emberChoice=null;});
document.querySelector('#ember-choice').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeEmberChoice(true);}
  if(event.key==='Enter'&&event.target.id==='ember-amount'){
    event.preventDefault();document.querySelector('#confirm-embers').click();
  }
});
document.querySelector('[data-close="ember-choice"]').addEventListener('click',()=>closeEmberChoice(true));
document.addEventListener('pointerdown',event=>{
  if(emberChoice&&!event.target.closest('#ember-choice,#cast-spell'))closeEmberChoice();
});
window.addEventListener('scroll',positionEmberChoice,true);
window.visualViewport?.addEventListener('resize',positionEmberChoice);
window.visualViewport?.addEventListener('scroll',positionEmberChoice);
const hub=createHub({root:document.querySelector('#hub'),assets:ASSETS,onInspectSpell:showSlab,onMultiplayer:()=>openOnlineLobby(),onAccount:()=>openAccountScreen(),onSaveLocal:data=>{
  if(!accounts?.hasSession())return;
  const username=accounts.getSession()?.account?.username;
  hub.setAccountStatus({username,state:'syncing',message:'Saving to your account…'});
  accounts.save(data).catch(error=>hub.setAccountStatus({username,state:'offline',message:error?.message||'Saved on this device. Cloud sync will need a retry.'}));
},onBattle:({decks,forceNew=false}={})=>{
  if(forceNew){restoreLocalBattle();requestNewBattle(decks,true);return;}
  pendingModeDecks=decks||hub.getSavedDecks();
  document.querySelector('#resume-local').hidden=localState.status!=='playing'||localState.phase==='setup';
  document.querySelector('#resume-local-detail').textContent=`Round ${localState.round}. Keep the current hands and progress. Future turn draws and refreshes fill up to ${HAND_LIMIT}.`;
  document.querySelector('#resume-online').hidden=!multiplayer?.isActive();
  document.querySelector('#battle-mode').showModal();
}});
multiplayer=createMultiplayer({
  root:document.querySelector('#online-view'),getSavedDecks:()=>hub.getSavedDecks(),getProfile:()=>hub.getProfile(),
  getAccountSession:()=>accounts?.getSession(),
  prepareAccountBattle:async()=>{
    if(accounts?.hasSession()){
      const session=accounts.getSession()||await accounts.resume();
      if(!session)throw new Error('Reconnect or sign in to your account before starting this battle.');
      await accounts.flush();
    }
  },
  onEnterMatch:view=>receiveOnlineView(view,true),
  onMatchUpdate:view=>{if(isOnlineBattle()&&view.code===onlineCode)receiveOnlineView(view);},
  onExit:details=>{
    if(changingAccount)return;
    if(details?.message)document.querySelector('#announcement').textContent=details.message;
    if(details?.reason==='expired'){
      if(isOnlineBattle())openOnlineLobby();
      return;
    }
    leaveBattle('home');
  },
  onStatus:message=>{
    onlineStatus=typeof message==='string'?message:message?.message||'';
    if(isOnlineBattle()){
      document.querySelector('#battle-connection').textContent=onlineStatus||'Connected · private hand';
      document.querySelector('#announcement').textContent=onlineStatus;
    }
  },
});
accounts=createAccounts({
  root:document.querySelector('#account-view'),getLocalData:()=>hub.getLocalData(),
  onAccountData:(account,details={})=>{
    const changed=accountIdentity!==null&&accountIdentity!==account.id;
    const newLogin=['login','register'].includes(details.source)&&accountIdentity!==account.id;
    if(changed||newLogin)discardOnlineIdentity();
    accountIdentity=account.id;
    hub.applyAccountData(account);
    hub.setAccountStatus({username:account.username,state:'synced',message:'Your profile and saved decks are synced.'});
  },
  onSignedOut:()=>{
    discardOnlineIdentity();accountIdentity=null;
    hub.clearAccountData();
    hub.setAccountStatus({state:'guest',message:'Playing locally on this device.'});
  },
  onExit:details=>leaveBattle(details?.screen==='deck'?'deck':'home'),
  onStatus:(message,details={})=>hub.setAccountStatus({username:details.username,state:details.busy?'syncing':details.unsynced||details.kind==='error'?'offline':details.signedIn?'synced':'guest',message}),
});
function discardOnlineIdentity(){
  changingAccount=true;
  try { if(multiplayer?.getSession())multiplayer.leave(); }
  finally { changingAccount=false; }
  if(isOnlineBattle()){
    restoreLocalBattle();
    if(!battleView.hidden)leaveBattle('home');
  }
}
function openAccountScreen(){
  cancelSpellPresentation();
  battleScene.hide();
  clearCombatTimers();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  restoreLocalBattle();hub.hide();multiplayer?.hide();battleView.hidden=true;
  if(location.hash!=='#account')history.pushState(null,'','#account');
  accounts.show();
}
function restoreLocalBattle(){
  if(isOnlineBattle()){clearCombatTimers();state=localState;}
  battleMode='local';onlineBusy=false;
}
function receiveOnlineView(view,enter=false){
  if(!view?.state||![0,1].includes(view.playerIndex))return;
  if(enter){
    cancelSpellPresentation();
    if(!isOnlineBattle())localState=state;
    clearCombatTimers();
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    if(onlineCode!==view.code)openingAcknowledged.online=view.state.phase!=='initiative';
    battleMode='online';onlineCode=view.code;onlinePlayerIndex=view.playerIndex;
    state=view.state;enterBattle();
  }else update(view.state);
}
async function sendOnlineAction(type,payload={}){
  if(!isOnlineBattle()||(type==='rollInitiative'?!canRollOpeningOnline():!canActOnline()))return;
  const openingRound=type==='rollInitiative'?state.initiative.round:null;
  onlineBusy=true;render();
  try {
    const result=await multiplayer.action(type,payload);
    // Both opening dice may be requested together. A stale response refreshes
    // the view; retry this player's still-unrolled die only in that same round.
    if(!result&&type==='rollInitiative'&&isOnlineBattle()&&state.phase==='initiative'
      &&state.initiative.round===openingRound&&state.initiative.rolls[onlinePlayerIndex]===null)await multiplayer.action(type,payload);
  }
  catch(error){onlineStatus=error?.message||'Your move could not be sent. Try again.';}
  finally { onlineBusy=false;if(isOnlineBattle())render(); }
}
function openOnlineLobby(){
  cancelSpellPresentation();
  battleScene.hide();
  clearCombatTimers();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  restoreLocalBattle();hub.hide();accounts?.hide();battleView.hidden=true;
  if(location.hash!=='#online')history.pushState(null,'','#online');
  multiplayer.show();
}
function isUntouchedBattle(){
  if(state.phase==='setup')return true;
  if(state.phase==='initiative')return !state.initiative.history.length&&state.initiative.rolls.every(value=>value===null);
  return false;
}
const localDecksReady=decks=>validateDeck(decks?.fire)&&validateDeck(decks?.water);
function showDeckSetup(decks=hub.getSavedDecks()){
  const element=validateDeck(decks.fire)?'water':'fire';
  leaveBattle('deck');
  hub.showDeckSetup('Build and save a 30-slab Fire deck and Water deck before starting a shared-screen battle.',element);
}
function enterBattle(){
  if(!isOnlineBattle()&&state.phase==='setup'){
    const decks=hub.getSavedDecks();
    if(!localDecksReady(decks)){showDeckSetup(decks);return;}
    openingAcknowledged.local=false;
    state=createLocalGame(decks);saveGame();
  }
  if(!isOnlineBattle() && state.phase === 'initiative' && !localEntranceKey) localEntranceKey = `local-${++arenaSequence}`;
  hub.hide();multiplayer?.hide();accounts?.hide();battleView.hidden=false;
  lastBattleMode=battleMode;
  try { localStorage.setItem('wizzy.battle.mode',lastBattleMode); } catch {}
  if(location.hash!=='#battle')history.pushState(null,'','#battle');
  render();document.querySelector('#battle-home').focus({preventScroll:true});
}
function leaveBattle(screen='home'){
  cancelSpellPresentation();
  battleScene.hide();
  clearCombatTimers();
  pendingBattleDecks=null;shouldEnterAfterRestart=false;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  restoreLocalBattle();multiplayer?.hide();accounts?.hide();battleView.hidden=true;hub.show(screen);
}
function requestNewBattle(decks=hub.getSavedDecks(),enterAfter=false){
  if(isOnlineBattle())return;
  if(!localDecksReady(decks)){showDeckSetup(decks);return;}
  if(state.phase==='setup'){
    openingAcknowledged.local=false;
    update(createLocalGame(decks));
    if(enterAfter)enterBattle();
    return;
  }
  clearCombatTimers();
  pendingBattleDecks=decks;shouldEnterAfterRestart=enterAfter;
  document.querySelector('#restart').showModal();
}
document.querySelector('#battle-home').addEventListener('click',()=>leaveBattle());
document.querySelector('#battle-new').addEventListener('click',()=>requestNewBattle());
document.querySelector('#battle-online-lobby').addEventListener('click',openOnlineLobby);
document.querySelector('#victory-online').addEventListener('click',()=>{multiplayer.leave();openOnlineLobby();});
document.querySelector('#choose-local').addEventListener('click',()=>{
  document.querySelector('#battle-mode').close();restoreLocalBattle();
  const decks=pendingModeDecks||hub.getSavedDecks();
  pendingModeDecks=null;
  if(!localDecksReady(decks)){pendingModeDecks=null;showDeckSetup(decks);return;}
  if(isUntouchedBattle()){
    openingAcknowledged.local=false;
    update(createLocalGame(decks));
    enterBattle();
  }else requestNewBattle(decks,true);
});
document.querySelector('#resume-local').addEventListener('click',()=>{
  document.querySelector('#battle-mode').close();restoreLocalBattle();
  pendingModeDecks=null;enterBattle();
});
document.querySelector('#choose-online').addEventListener('click',openOnlineLobby);
document.querySelector('#resume-online').addEventListener('click',()=>{
  document.querySelector('#battle-mode').close();
  const session=multiplayer.getSession();
  if(session?.state)receiveOnlineView(session,true);
  else openOnlineLobby();
});
document.querySelector('[data-close="restart"]').addEventListener('click',()=>{pendingBattleDecks=null;shouldEnterAfterRestart=false;});
document.querySelector('#restart').addEventListener('cancel',()=>{pendingBattleDecks=null;shouldEnterAfterRestart=false;});
document.querySelector('#restart').addEventListener('close',scheduleCombat);
function syncAppRoute(){
  const screen=location.hash.slice(1);
  if(screen==='account'){openAccountScreen();return;}
  if(screen==='online'){openOnlineLobby();return;}
  if(screen==='battle'){
    if(lastBattleMode==='online'){
      const session=multiplayer.getSession();
      if(session?.state)receiveOnlineView(session,true);
      else openOnlineLobby();
    }else{restoreLocalBattle();enterBattle();}
    return;
  }
  leaveBattle(['title','home','character','friends','deck'].includes(screen)?screen:'title');
}
window.addEventListener('hashchange',syncAppRoute);
window.addEventListener('popstate',syncAppRoute);
const touchIcon=document.createElement('link');touchIcon.rel='apple-touch-icon';touchIcon.href=ASSETS.appIcon;document.head.append(touchIcon);
saveGame();render();syncAppRoute();
accounts.resume().catch(()=>{});
