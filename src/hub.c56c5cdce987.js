import { ASSETS, ASSET_CROPS, MAP_UI_CROPS, spellArtMarkup, spellSlabMarkup } from './assets.16c339a8ba87.js';
import { SPELL_CATALOG, DECK_SIZE, SPELLBOOK_VERSION } from './spells.116e6e94e9df.js';
import { MAX_HP, MAX_MANA, MAX_SHIELD, MAX_FLOW, MAX_EMBERS } from './effects.e851a71ef139.js';
import { createStarterDeck, getDeckValidation, validateDeck, normalizeDeck, setDeckQuantity, getEligibleSpells, getDeckCount, validateDeckSlot, normalizeDeckSlot, serializeDeck, parseDeckListForActive, MAX_DECK_FILE_BYTES } from './decks.1fed6bf0f1db.js';
import { SPELLBOOK_1, SPELLBOOK_2, SPELLBOOKS, getDeckSpellbook, getSpellbookSpells, ACTIVE_SPELLBOOK_ID, getActiveSpells } from './spellbooks.dc9c46f0173c.js';
import { createHubStorage, restoreHubDraft as restoreDraft } from './hub-storage.f9e34dd2ac83.js';
import { ELEMENTS, ELEMENT_INFO } from './elements.f91c53cdab44.js';
import { fitSlabText } from './slab-text.308873e88ad9.js';
import { DISTRICTS, getDistrict, normalizeDistrictId, parseStorybookRoute } from './districts.41d180c8958a.js';

const HUB_SCREENS = new Set(['title', 'home', 'character', 'friends', 'deck', 'storybook', 'battle-setup']);
// The square artwork includes ocean around the city. Its artwork and labels
// share one coordinate system, so the coast moves with every pan and zoom.
const MAP_SIZE = 2048;
const mapScale = (width, height, zoom) => Math.max(width, height) / MAP_SIZE * zoom;
const escapeHub = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cloneHub = value => structuredClone(value);
const elementName = value => ELEMENT_INFO[value]?.name || 'Fire';
const elementSymbol = value => ({ fire: '♨', water: '≈', earth: '◆' })[value] || '✧';
const deckSignature = deck => JSON.stringify([...deck.entries].sort((a, b) => a.spellId.localeCompare(b.spellId)));


function hubArt(key, className = '', cropOverride = null) {
  const crop = ASSET_CROPS[key] && { ...ASSET_CROPS[key], ...cropOverride };
  if (!crop || !ASSETS[key]) return '';
  return `<span class="wz-cropped ${className}" style="aspect-ratio:${crop.w}/${crop.h}${crop.clipPath?`;clip-path:${crop.clipPath}`:''}"><img alt="" draggable="false" src="${escapeHub(ASSETS[key])}" style="width:${crop.width / crop.w * 100}%;height:${crop.height / crop.h * 100}%;left:${-crop.x / crop.w * 100}%;top:${-crop.y / crop.h * 100}%"></span>`;
}

function mapUiArt(name, className = '') {
  const crop=MAP_UI_CROPS[name];
  return crop?hubArt(crop.asset,`wz-map-ui-art ${className}`,crop):'';
}

function mapFrameArt() {
  return `<div class="wz-map-frame-art" aria-hidden="true">${[
    ['mapFrameTop','wz-frame-top'],['mapFrameBottom','wz-frame-bottom'],
    ['mapFrameLeft','wz-frame-left'],['mapFrameRight','wz-frame-right'],
    ['mapFrameNW','wz-frame-nw'],['mapFrameNE','wz-frame-ne'],
    ['mapFrameSW','wz-frame-sw'],['mapFrameSE','wz-frame-se'],
  ].map(([name,style])=>mapUiArt(name,style)).join('')}</div>`;
}

function hubHead(element) {
  if (element === 'earth') return hubArt('earthMage');
  return element === 'water'
    ? hubArt('waterMage', '', { x: 362, y: 114, w: 620, h: 490 })
    : hubArt('fireMage', '', { x: 240, y: 117, w: 640, h: 500 });
}

function hubIcon(name, className = '') {
  const positions = { character: '0% 0%', deck: '50% 0%', friends: '100% 0%', battle: '0% 100%', pin: '50% 100%', compass: '100% 100%' };
  const symbols = { character: '♟', deck: '▤', friends: '♟♟', battle: '⚔', pin: '◆', compass: '✦' };
  return `<span class="wz-icon ${className}" aria-hidden="true" style="--wz-icon-position:${positions[name] || positions.compass}"><span>${symbols[name] || '✦'}</span></span>`;
}

/** Mobile navigation and local deck editing. The battle host owns duel state. */
export function createHub({ root, onBattle = () => {}, onMultiplayer = () => {}, onAccount = () => {}, onSaveLocal = () => {}, onInspectSpell = () => {}, assets = {} }) {
  if (!root) throw new Error('The Wizzy hub needs a root element.');
  root.classList.add('wz-hub-root');
  root.hidden = true;
  const scene = assets.titleScene || ASSETS.titleScene || ASSETS.forest;
  const map = assets.seattleExpanded || ASSETS.seattleExpanded;
  const atlas = assets.iconAtlas || ASSETS.iconAtlas;
  const storybook = assets.storybookIcon || ASSETS.storybookIcon;
  const storybookPaper = assets.storybookPaper || ASSETS.storybookPaper;
  if (scene) root.style.setProperty('--wz-title-scene', `url("${scene}")`);
  if (map) root.style.setProperty('--wz-map-scene', `url("${map}")`);
  if (storybookPaper) root.style.setProperty('--wz-storybook-paper', `url("${storybookPaper}")`);
  if (atlas) {
    root.style.setProperty('--wz-icon-atlas', `url("${atlas}")`);
    root.classList.add('wz-has-atlas');
  }

  let deviceStorage = null;
  try { deviceStorage = globalThis.localStorage; } catch {}
  const persistence = createHubStorage(deviceStorage);
  let storageAvailable = persistence.isAvailable();
  let screen = 'title';
  let visible = false;
  let selectedElement = 'fire';
  let selectedBattleElements = ['fire', 'water'];
  let battleSetupReturn = 'home';
  let filter = 'All';
  let inDeckOnly = false;
  let storybookDistrictId = null;
  let mapReturnDistrictId = null;
  const expandedDistricts = new Set();
  const mapStart = { zoom: 4, cx: .505, cy: .436 };
  let mapView = { ...mapStart };
  let mapDrag = null;
  let suppressMapClickUntil = 0;
  const mapObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => applyMapView()) : null;
  let notice = '';
  let deckTransferNotice = '';
  let activeMigrationNotice = '';
  let deckTransferError = false;
  let deckTransferGeneration = 0;
  let noticeTimer;
  let profile = { name: 'Wizzy', element: 'fire' };
  let selectedSpellbookId = ACTIVE_SPELLBOOK_ID;
  const emptyBook = bookId => ({ savedDecks: Object.fromEntries(ELEMENTS.map(element => [element, createStarterDeck(element, bookId)])), drafts: null, cloudDecks: null });
  let books = { [SPELLBOOK_1]: emptyBook(SPELLBOOK_1), [SPELLBOOK_2]: emptyBook(SPELLBOOK_2) };
  for (const book of Object.values(books)) book.drafts = cloneHub(book.savedDecks);
  let savedDecks = books[ACTIVE_SPELLBOOK_ID].savedDecks;
  let drafts = books[ACTIVE_SPELLBOOK_ID].drafts;
  let activeAccountId = null;
  let cloudDecks = null;
  let accountUsername = '';
  let accountStatus = { state: 'guest', message: '' };
  let guestSnapshot = null;

  const restored = persistence.load();
  storageAvailable = restored.available;
  if (restored.state) {
    ({ profile, savedDecks, drafts, cloudDecks, accountId: activeAccountId, accountUsername } = restored.state);
    books[SPELLBOOK_1] = { savedDecks, drafts, cloudDecks };
    if (restored.state.spellbook2) books[SPELLBOOK_2] = restored.state.spellbook2;
    selectedSpellbookId = ACTIVE_SPELLBOOK_ID;
    ({ savedDecks, drafts, cloudDecks } = books[selectedSpellbookId]);
    if (activeAccountId) accountStatus = { state: 'offline', message: 'Saved on this device. Connect to sync your account.' };
    if (restored.recovered) notice = 'Your saved Wizzy data was restored from this device.';
    if (restored.state.activeMigrationNotice) deckTransferNotice = activeMigrationNotice = restored.state.activeMigrationNotice;
  }
  if (!storageAvailable) notice = 'Device storage could not be read. Build your decks for this session in Deck.';
  selectedElement = profile.element;
  selectedBattleElements = defaultBattleElements(profile.element);
  guestSnapshot = activeAccountId ? restored.guestSnapshot : snapshotHub();
  // Promote recovered saves to stable mirrored keys before the next update.
  if (restored.state) persistHub();

  function stashBook() { books[selectedSpellbookId] = { savedDecks, drafts, cloudDecks }; }
  function snapshotHub() {
    stashBook();
    return cloneHub({ profile, ...books[SPELLBOOK_1], spellbook2: books[SPELLBOOK_2], selectedSpellbookId, activeMigrationNotice });
  }
  function selectSpellbook(bookId, { persist = true } = {}) {
    if (bookId !== ACTIVE_SPELLBOOK_ID) return;
    stashBook();
    selectedSpellbookId = bookId;
    ({ savedDecks, drafts, cloudDecks } = books[bookId]);
    deckTransferGeneration++;
    deckTransferNotice = '';
    notice = '';
    filter = 'All'; inDeckOnly = false;
    if (persist) persistHub();
  }



  function persistHub() {
    const stored = persistence.save({ ...snapshotHub(), accountId: activeAccountId, accountUsername });
    storageAvailable = persistence.isAvailable();
    if (stored && !activeAccountId) guestSnapshot = snapshotHub();
    return stored;
  }
  function messageHub(text) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; if (visible) render(); }, 4500);
  }
  function footerHub() {
    const build = document.querySelector('meta[name="wizzy-build"]')?.content;
    const storageLabel = !storageAvailable ? 'DEVICE SAVING UNAVAILABLE' : !activeAccountId ? 'SAVED ON THIS DEVICE' : accountStatus.state === 'synced' ? 'ACCOUNT DECKS SYNCED' : accountStatus.state === 'syncing' ? 'SYNCING ACCOUNT…' : 'SAVED LOCALLY · SYNC PENDING';
    return `<footer class="wz-footer"><span>${storageLabel}</span><span>${build && build !== 'development' ? `BUILD ${escapeHub(build)}` : 'WIZZY · FIRST JOURNEY'}</span></footer>`;
  }
  function accountPanelHub() {
    return `<button class="wz-account-entry" data-wz-action="account"><span aria-hidden="true">✦</span><span><strong>${activeAccountId ? escapeHub(accountUsername || 'Your account') : 'Sign in to your Wizzy'}</strong><small>${escapeHub(activeAccountId ? accountStatus.message || 'Your profile and decks follow your account.' : 'Keep your saved decks across phones.')}</small></span><b aria-hidden="true">›</b></button>`;
  }
  function topHub(title, subtitle = '') {
    return `<header class="wz-header"><button class="wz-back" data-wz-action="home" aria-label="Back to Seattle map">‹</button><div><p class="wz-eyebrow">${subtitle || 'WIZZY · SEATTLE'}</p><h1 tabindex="-1">${title}</h1></div><button class="wz-mini-avatar" data-wz-action="character" aria-label="Open your character">${hubHead(profile.element)}</button></header>`;
  }
  function elementSwitch(context) {
    const element = context === 'profile' ? profile.element : selectedElement;
    return `<div class="wz-element-switch" role="group" aria-label="${context === 'profile' ? 'Choose your wizard element' : 'Choose a deck to edit'}">${ELEMENTS.map(id => `<button class="wz-element-tab wz-${id} ${element === id ? 'wz-active' : ''}" data-wz-action="${context === 'profile' ? 'profile-element' : 'deck-element'}" data-wz-element="${id}" data-wz-focus="${context}-${id}" aria-pressed="${element === id}"><span aria-hidden="true">${elementSymbol(id)}</span> ${elementName(id)}</button>`).join('')}</div>`;
  }
  function titleHub() {
    return `<section class="wz-phone wz-title-screen"><div class="wz-title-shade"></div><div class="wz-title-brand"><p class="wz-eyebrow">A LITTLE MAGIC. A WHOLE CITY.</p><h1 tabindex="-1">Wizzy</h1><p class="wz-title-subtitle">YOUR JOURNEY BEGINS IN SEATTLE</p></div><div class="wz-title-entry"><span class="wz-spark wz-spark-left" aria-hidden="true">✦</span><button class="wz-pixel-button wz-enter" data-wz-action="enter">Enter Game <span aria-hidden="true">→</span></button><span class="wz-spark wz-spark-right" aria-hidden="true">✦</span><p>EXPLORE THE CITY. FIND YOUR MAGIC.</p><button class="wz-title-account" data-wz-action="account">${activeAccountId ? 'Your account' : 'Sign in / Create account'}</button></div><div class="wz-title-bottom"><span class="wz-tiny-star" aria-hidden="true">✧</span><p>FIRE · WATER · EARTH · FATE</p></div>${footerHub()}</section>`;
  }
  function homeHub() {
    return `<section class="wz-phone wz-home-screen">
      <div class="wz-home-stone" aria-hidden="true">${Array.from({length:72},()=>mapUiArt('mapStoneTexture','wz-map-stone-tile')).join('')}</div>
      <header class="wz-map-header"><button type="button" class="wz-small-wordmark wz-map-back" data-wz-action="title" aria-label="Return to Wizzy title screen" title="Back to title">${mapUiArt('mapTopBack')}</button><button type="button" class="wz-profile-chip wz-map-banner" data-wz-action="character" aria-label="Open ${escapeHub(profile.name)}’s ${elementName(profile.element)} character" title="Open your character">${mapUiArt('mapBanner')}</button></header>
      <div class="wz-map-toolbar"><div class="wz-map-view-controls" role="group" aria-label="Map view"><button type="button" class="wz-map-toolbar-fit" data-wz-action="map-overview" aria-label="Show the whole Seattle map" title="Whole map">${mapUiArt('mapToolbarFit')}</button><button type="button" data-wz-action="map-zoom-out" aria-label="Zoom out on map">${mapUiArt('mapToolbarZoomOut')}</button><output class="wz-map-zoom" aria-label="Map zoom">4×</output><button type="button" data-wz-action="map-zoom-in" aria-label="Zoom in on map">${mapUiArt('mapToolbarZoomIn')}</button><button type="button" data-wz-action="map-center" aria-label="Center map on South Lake Union" title="South Lake Union">${mapUiArt('mapToolbarCompass')}</button></div></div>
      <div class="wz-map-frame">
      <div class="wz-map-viewport" tabindex="0" role="region" aria-label="Seattle district map, drag to explore" aria-describedby="wz-map-instructions">
        <div class="wz-map-world">
          <div class="wz-map-art" aria-hidden="true"></div>
          <div class="wz-map-city" aria-label="Storybook districts">
          ${DISTRICTS.map(item => `<button type="button" class="wz-district-marker" data-wz-action="district" data-wz-district="${item.id}" data-wz-focus="district-${item.id}" style="left:${item.position.x*100}%;top:${item.position.y*100}%;--wz-marker-offset-y:${({1:4,10:-4,14:4,15:-4})[item.id]||0}px" aria-label="District ${item.id}: ${escapeHub(item.name)}. Open Storybook chapter." title="${item.id} · ${escapeHub(item.name)}"><span class="wz-district-number" aria-hidden="true">${item.id}</span></button>`).join('')}
          <div class="wz-you-marker" role="img" aria-label="Your location, preview position only"><span class="wz-location-dot" aria-hidden="true"></span></div>
          </div>
        </div>
      </div>
      ${mapFrameArt()}</div>
      <p id="wz-map-instructions" class="sr-only">Drag the map with a mouse or finger. Tap a numbered district to read its Storybook chapter. Fit shows the complete city. With the map focused, use arrow keys to explore, plus and minus to zoom, or Home to center South Lake Union.</p>

      <nav class="wz-map-controls" aria-label="Game screens"><div class="wz-left-controls"><button type="button" class="wz-map-button wz-storybook-button" data-wz-action="storybook" aria-label="Open your Storybook district journal" title="Your Seattle Storybook">${mapUiArt('mapStorybook')}</button><button type="button" class="wz-map-button wz-character-button" data-wz-action="character" aria-label="Open your character">${mapUiArt('mapCharacter')}</button></div><div class="wz-right-controls"><button type="button" class="wz-map-button wz-battle-button" data-wz-action="battle" aria-label="Open battle playtest">${mapUiArt('mapBattle')}</button><button type="button" class="wz-map-button" data-wz-action="friends" aria-label="Open Friends">${mapUiArt('mapFriends')}</button><button type="button" class="wz-map-button" data-wz-action="deck" aria-label="Open deck workshop">${mapUiArt('mapDeck')}</button></div></nav><p class="wz-map-preview">MAP PREVIEW · LOCATION NOT CONNECTED</p>${footerHub()}</section>`;
  }

  function storybookHub() {
    return `<section class="wz-phone wz-panel-screen wz-storybook-screen">${topHub('Storybook', 'YOUR SEATTLE JOURNEY')}<div class="wz-storybook-scroll" data-wz-scroll="storybook"><div class="wz-journal-districts">${DISTRICTS.map(item => `<details class="wz-journal-district" id="wz-story-district-${item.id}" data-wz-story-district="${item.id}" ${expandedDistricts.has(item.id)?'open':''}><summary id="wz-district-summary-${item.id}" data-wz-focus="journal-${item.id}" aria-controls="wz-district-content-${item.id}"><span class="wz-journal-number" aria-hidden="true">${item.id}</span><span><strong>${escapeHub(item.name)}</strong></span><span class="wz-journal-arrow" aria-hidden="true"><i></i></span></summary><div class="wz-district-content" id="wz-district-content-${item.id}"><h2 class="wz-mainquest-title">Mainquest ${item.id}</h2><p class="wz-mainquest-boss"${item.boss?'':' aria-hidden="true"'}>${escapeHub(item.boss)||'&nbsp;'}</p></div></details>`).join('')}</div></div>${footerHub()}</section>`;
  }
  function resetStorybook() {
    storybookDistrictId=null;
    expandedDistricts.clear();
    for(const details of root.querySelectorAll('[data-wz-story-district][open]'))details.open=false;
  }
  function focusStorybookDistrict(id) {
    const details=root.querySelector(`[data-wz-story-district="${id}"]`);
    const scroll=root.querySelector('.wz-storybook-scroll');
    if(!details||!scroll)return;
    details.open=true;
    expandedDistricts.add(id);
    scroll.scrollTop+=details.getBoundingClientRect().top-scroll.getBoundingClientRect().top-10;
    details.querySelector('summary')?.focus({preventScroll:true});
  }
  root.addEventListener('toggle',event=>{
    const details=event.target;
    if(!visible||screen!=='storybook'||!root.contains(details)||!details.matches?.('[data-wz-story-district]'))return;
    const id=normalizeDistrictId(details.dataset.wzStoryDistrict);
    if(id===null)return;
    if(details.open)expandedDistricts.add(id);else expandedDistricts.delete(id);
  },true);
  function characterHub() {
    const deck = savedDecks[profile.element];
    return `<section class="wz-phone wz-panel-screen wz-character-screen">${topHub('Your Wizzy', 'CHARACTER')}<div class="wz-page-scroll" data-wz-scroll="character">${accountPanelHub()}<div class="wz-character-stage wz-${profile.element}"><span class="wz-character-halo"></span>${hubArt(`${profile.element}Mage`, 'wz-character-art')}<div class="wz-character-plaque"><strong>${escapeHub(profile.name)}</strong><span>${elementName(profile.element)} wizard</span></div></div><div class="wz-paper-panel"><form class="wz-profile-form"><label for="wz-character-name">Wizard name</label><div class="wz-name-row"><input id="wz-character-name" name="wizardName" maxlength="24" value="${escapeHub(profile.name)}" autocomplete="nickname" data-wz-focus="wizard-name"><button class="wz-small-button" type="submit">Save</button></div></form><p class="wz-field-label">YOUR ELEMENT</p>${elementSwitch('profile')}<p class="wz-element-help">Your element chooses your wizard portrait and the deck you open first.</p><div class="wz-stat-heading">DUEL STARTING STATS · CURRENT / MAXIMUM</div><div class="wz-profile-stats"><div><span>HP</span><strong>${MAX_HP} / ${MAX_HP}</strong></div><div><span>MANA</span><strong>3 / ${MAX_MANA}</strong></div><div><span>SHIELD</span><strong>0 / ${MAX_SHIELD}</strong></div><div><span>${profile.element === 'earth' ? 'GOLEM' : profile.element === 'water' ? 'FLOW' : 'EMBERS'}</span><strong>${profile.element === 'earth' ? 'Inactive' : `0 / ${profile.element === 'water' ? MAX_FLOW : MAX_EMBERS}`}</strong></div></div><button class="wz-profile-deck" data-wz-action="deck">${hubIcon('deck')}<span>${elementName(profile.element)} spell deck<small>${getDeckValidation(deck).total} slabs · ${validateDeck(deck) ? 'ready for battle' : 'add at least 1 slab'}</small></span><b aria-hidden="true">›</b></button></div><p class="wz-page-note">Your name, element, and decks stay on this device. Story progression will grow with the city.</p></div>${footerHub()}</section>`;
  }
  function friendsHub() {
    return `<section class="wz-phone wz-panel-screen wz-friends-screen">${topHub('Your Party', 'FRIENDS')}<div class="wz-page-scroll" data-wz-scroll="friends"><div class="wz-party-art" aria-hidden="true"><span class="wz-party-star">✦</span>${hubIcon('friends')}<span class="wz-party-star">✧</span></div><div class="wz-empty-party"><p class="wz-eyebrow">ADVENTURES ARE BETTER TOGETHER</p><h2>A place for your party.</h2><p>Your friends list and messages will live here. For now, invite a friend to a battle with a room code.</p><div class="wz-friend-features"><span>${hubIcon('friends')} Add friends</span><span>${hubIcon('battle')} Challenge a wizard</span><span class="wz-message-feature"><i aria-hidden="true">▤</i> Send messages</span></div><span class="wz-preview-tag">FRIENDS SCREEN PREVIEW</span></div><div class="wz-local-play-panel"><strong>Bring a friend into the battle.</strong><p>Create a room or join with a code to test on two screens.</p><button class="wz-pixel-button" data-wz-action="multiplayer">${hubIcon('battle')} Create or join a battle</button><button class="wz-small-button wz-shared-screen" data-wz-action="battle">Play on this screen</button></div></div>${footerHub()}</section>`;
  }
  function deckRowsHub(draft) {
    const total = getDeckValidation(draft).total;
    if (!draft.entries.length) return '<div class="wz-empty-deck"><span aria-hidden="true">✧</span><strong>Your spell tower starts here.</strong><p>Check slabs in the collection below to build your deck.</p></div>';
    return [...draft.entries].sort((a, b) => SPELL_CATALOG[a.spellId].name.localeCompare(SPELL_CATALOG[b.spellId].name)).map(entry => {
      const card = SPELL_CATALOG[entry.spellId];
      return `<div class="wz-deck-row wz-type-${card.type.toLowerCase()}" data-wz-deck-spell="${card.spellId}"><button class="wz-deck-row-name" data-wz-action="inspect" data-wz-spell="${card.spellId}" aria-label="Read ${escapeHub(card.name)}"><span class="wz-type-dot"></span><span><strong>${escapeHub(card.name)}</strong><small>${card.manaCost} Mana · ${card.type}</small></span></button><div class="wz-quantity" role="group" aria-label="${escapeHub(card.name)} copies"><button data-wz-action="quantity" data-wz-spell="${card.spellId}" data-wz-delta="-1" data-wz-focus="minus-${card.spellId}" aria-label="Remove one ${escapeHub(card.name)}">−</button><strong aria-label="${entry.quantity} copies">${entry.quantity}</strong><button data-wz-action="quantity" data-wz-spell="${card.spellId}" data-wz-delta="1" data-wz-focus="plus-${card.spellId}" aria-label="Add one ${escapeHub(card.name)}" ${total >= DECK_SIZE ? 'disabled' : ''}>+</button></div></div>`;
    }).join('');
  }
  function slabHub(card) {
    const slab=spellSlabMarkup(card.spellId);
    if(slab)return `<div class="wz-slab-face">${slab}<span class="slab-mana" role="img" aria-label="${card.manaCost} Mana">${card.manaCost}</span><span class="sr-only">${escapeHub(card.name)}. ${escapeHub(card.effectText)}</span></div>`;
    return `<div class="wz-slab-face">${hubArt(card.art)}${spellArtMarkup(card.spellId, 'wz-slab-illustration')}<strong class="wz-slab-title">${escapeHub(card.name)}</strong><span class="wz-slab-copy"><b>${card.manaCost} Mana</b><span>${escapeHub(card.effectText)}</span></span></div>`;
  }
  function collectionHub(draft) {
    const eligible = new Set(getEligibleSpells(selectedElement, selectedSpellbookId).map(card => card.spellId));
    const total = getDeckValidation(draft).total;
    const bookLibrary = getActiveSpells();
    const cards = bookLibrary.filter(card => (filter === 'All' || card.type === filter) && (!inDeckOnly || getDeckCount(draft, card.spellId) > 0));
    if (!cards.length) return '<div class="wz-empty-collection"><strong>No slabs match this filter.</strong><p>Choose another type or turn off In Deck.</p></div>';
    return cards.map(card => {
      const count = getDeckCount(draft, card.spellId);
      const allowed = eligible.has(card.spellId);
      const full = total >= DECK_SIZE && count === 0;
      return `<article class="wz-library-card wz-type-${card.type.toLowerCase()} ${count ? 'wz-in-deck' : ''} ${!allowed ? 'wz-other-element' : ''}" data-wz-library-spell="${card.spellId}"><button class="wz-read-slab" data-wz-action="inspect" data-wz-spell="${card.spellId}" aria-label="Read ${escapeHub(card.name)}. ${escapeHub(card.effectText)}">${slabHub(card)}<span class="wz-read-tag">READ SLAB ↗</span></button><label class="wz-card-check"><input type="checkbox" data-wz-card-check="${card.spellId}" data-wz-focus="check-${card.spellId}" aria-label="Include ${escapeHub(card.name)} in your ${elementName(selectedElement)} deck" ${count ? 'checked' : ''} ${!allowed || full ? 'disabled' : ''}><span>${!allowed ? `${card.type} deck only` : count ? `${count} in deck` : full ? 'Deck full' : 'Add to deck'}</span></label></article>`;
    }).join('');
  }
  function deckHub() {
    const draft = drafts[selectedElement];
    const validation = getDeckValidation(draft);
    const dirty = deckSignature(draft) !== deckSignature(savedDecks[selectedElement]);
    const counts = { Elemental: 0, Fate: 0 };
    for (const entry of draft.entries) counts[SPELL_CATALOG[entry.spellId].category] += entry.quantity;
    return `<section class="wz-phone wz-panel-screen wz-deck-screen">${topHub('Spell Workshop', SPELLBOOKS[selectedSpellbookId].label.toUpperCase())}<div class="wz-deck-toolbar">${elementSwitch('deck')}<div class="wz-deck-count ${validation.valid ? 'wz-ready' : ''}"><strong data-testid="builder-deck-total">${validation.total}<small> / ${DECK_SIZE}</small></strong><span>${validation.valid ? 'READY TO PLAY' : `${DECK_SIZE - validation.total} SLOTS OPEN`}</span></div></div>${deckTransferNotice ? `<p class="wz-deck-transfer-note ${deckTransferError ? 'wz-error' : ''}" role="${deckTransferError ? 'alert' : 'status'}">${escapeHub(deckTransferNotice)}</p>` : ''}<div class="wz-deck-layout"><section class="wz-deck-selected" aria-label="Cards in your deck"><header class="wz-section-heading"><div><h2>Your ${elementName(selectedElement)} deck</h2><p>${counts.Elemental} Elemental · ${counts.Fate} Fate <span class="wz-save-chip">${dirty ? 'DRAFT' : 'SAVED'}</span></p></div><div class="wz-deck-tools"><button data-wz-action="upload-deck" class="wz-plain-button">Upload deck</button><button data-wz-action="download-deck" class="wz-plain-button" ${validation.valid ? '' : 'disabled'}>Download deck</button><input type="file" accept=".json,application/json" data-wz-deck-upload hidden><button data-wz-action="clear" class="wz-plain-button">Clear</button></div></header><div class="wz-deck-list" data-wz-scroll="deck-list">${deckRowsHub(draft)}</div></section><section class="wz-collection" aria-label="Available spell slab collection"><header class="wz-section-heading"><h2>Spell collection <small>${getSpellbookSpells(selectedSpellbookId).length} slabs</small></h2><label class="wz-in-deck-filter"><input type="checkbox" data-wz-in-deck-filter data-wz-focus="in-deck-filter" ${inDeckOnly ? 'checked' : ''}> In Deck</label></header><div class="wz-filter-tabs" role="group" aria-label="Filter spell slabs">${['All', 'Fire', 'Water', 'Earth', 'Fate'].map(type => `<button data-wz-action="filter" data-wz-filter="${type}" data-wz-focus="filter-${type}" aria-pressed="${filter === type}" class="${filter === type ? 'wz-active' : ''}">${type}</button>`).join('')}</div><div class="wz-collection-grid" data-wz-scroll="collection">${collectionHub(draft)}</div></section></div><div class="wz-deck-savebar"><div><strong>${validation.valid ? `${SPELLBOOKS[selectedSpellbookId].label} ready.` : validation.total === 0 ? 'Add at least 1 slab.' : 'Check your deck.'}</strong><small>1–${DECK_SIZE} slabs · No copy limit · ${elementName(selectedElement)} + Fate</small></div><button class="wz-small-button" data-wz-action="save-deck" ${!validation.valid ? 'disabled' : ''}>Save deck</button><button class="wz-small-button wz-gold" data-wz-action="test-deck" ${!validation.valid ? 'disabled' : ''}>Save & battle ↗</button></div>${footerHub()}</section>`;
  }

  function battleSetupHub() {
    const decks = getSavedDecks();
    const selectedValid = selectedBattleElements.every(element => validateDeck(decks[element]));
    const players = selectedBattleElements.map((selected, seat) => {
      const validation = getDeckValidation(decks[selected]);
      return `<fieldset class="wz-battle-player"><legend>Player ${seat + 1}</legend><div class="wz-battle-schools" role="group" aria-label="Player ${seat + 1} element">${ELEMENTS.map(element => {
        const deck = getDeckValidation(decks[element]);
        return `<button type="button" class="wz-element-tab wz-${element} ${selected === element ? 'wz-active' : ''}" data-wz-action="battle-element" data-wz-seat="${seat}" data-wz-element="${element}" data-wz-focus="battle-${seat}-${element}" aria-pressed="${selected === element}"><span aria-hidden="true">${elementSymbol(element)}</span><strong>${elementName(element)}</strong><small>${deck.total} ${deck.total === 1 ? 'slab' : 'slabs'}</small></button>`;
      }).join('')}</div><p class="wz-battle-deck-status ${validation.valid ? 'wz-ready' : 'wz-error'}" ${validation.valid ? '' : 'role="alert"'}>${validation.valid ? `${elementName(selected)} deck ready · ${validation.total} ${validation.total === 1 ? 'slab' : 'slabs'}` : `${elementName(selected)} deck needs 1–30 legal slabs.`}</p>${validation.valid ? '' : `<button type="button" class="wz-small-button" data-wz-action="battle-edit" data-wz-element="${selected}">Build ${elementName(selected)} deck →</button>`}</fieldset>`;
    }).join('');
    return `<section class="wz-phone wz-panel-screen wz-battle-setup-screen"><header class="wz-header"><button type="button" class="wz-back" data-wz-action="battle-setup-back" aria-label="Back">‹</button><div><p class="wz-eyebrow">TWO WIZARDS · ONE SCREEN</p><h1 tabindex="-1">Choose your battle</h1></div><span aria-hidden="true">⚔</span></header><div class="wz-page-scroll" data-wz-scroll="battle-setup"><p class="wz-battle-intro">Each player chooses a saved deck. You can both choose the same element.</p>${players}<p class="wz-battle-save-note">Battles use saved decks. Save changes in the workshop before starting.</p><button type="button" class="wz-pixel-button wz-battle-start" data-wz-action="start-local-battle" ${selectedValid ? '' : 'disabled'}>Start battle →</button></div>${footerHub()}</section>`;
  }

  function defaultBattleElements(first) {
    const decks = getSavedDecks();
    const second = ELEMENTS.find(id => id !== first && validateDeck(decks[id]))
      || (validateDeck(decks[first]) ? first : ELEMENTS.find(id => id !== first));
    return [first, second];
  }

  function showBattleChooser({ element = profile.element } = {}) {
    selectSpellbook(ACTIVE_SPELLBOOK_ID);
    if (screen !== 'battle-setup') battleSetupReturn = screen === 'title' ? 'home' : screen;
    selectedBattleElements = defaultBattleElements(ELEMENTS.includes(element) ? element : profile.element);
    show('battle-setup');
  }

  function startSelectedBattle() {
    const decks = getSavedDecks();
    if (!selectedBattleElements.every(element => ELEMENTS.includes(element) && validateDeck(decks[element]))) {
      messageHub('Choose saved decks containing 1–30 legal slabs for both players.');
      render();
      return;
    }
    onBattle({ decks, selectedElements: [...selectedBattleElements], forceNew: true, element: selectedBattleElements[0], spellbookId: selectedSpellbookId, profile: getProfile() });
  }

  function applyMapView() {
    const viewport = root.querySelector('.wz-map-viewport');
    const world = viewport?.querySelector('.wz-map-world');
    if (!viewport || !world || !viewport.clientWidth || !viewport.clientHeight) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const scale = mapScale(width, height, mapView.zoom);
    const worldWidth = MAP_SIZE * scale;
    const worldHeight = MAP_SIZE * scale;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    mapView.cx = worldWidth <= width ? .5 : clamp(mapView.cx, width / (2 * worldWidth), 1 - width / (2 * worldWidth));
    mapView.cy = worldHeight <= height ? .5 : clamp(mapView.cy, height / (2 * worldHeight), 1 - height / (2 * worldHeight));
    world.style.transform = `translate3d(${width / 2 - mapView.cx * worldWidth}px,${height / 2 - mapView.cy * worldHeight}px,0) scale(${scale})`;
    world.style.setProperty('--wz-marker-scale', String(1 / scale));
    viewport.dataset.mapZoom = String(mapView.zoom);
    viewport.dataset.mapCenterX = String(mapView.cx);
    viewport.dataset.mapCenterY = String(mapView.cy);
    const output = root.querySelector('.wz-map-zoom');
    if (output) output.textContent = `${Number(mapView.zoom.toFixed(1))}×`;
    const zoomIn = root.querySelector('[data-wz-action="map-zoom-in"]');
    const zoomOut = root.querySelector('[data-wz-action="map-zoom-out"]');
    if (zoomIn) zoomIn.disabled = mapView.zoom >= 8;
    if (zoomOut) zoomOut.disabled = mapView.zoom <= 1;
    root.querySelector('[data-wz-action="map-overview"]')?.setAttribute('aria-pressed', String(mapView.zoom === 1));
  }
  function zoomMap(factor) {
    mapView.zoom = Math.max(1, Math.min(8, mapView.zoom * factor));
    applyMapView();
  }
  function finishMapDrag(event) {
    if (!mapDrag || (event && event.pointerId !== mapDrag.pointerId)) return;
    const drag = mapDrag;
    mapDrag = null;
    if (drag.moved) suppressMapClickUntil = Date.now() + 400;
    drag.viewport.classList.remove('wz-dragging');
    if (drag.viewport.hasPointerCapture?.(drag.pointerId)) drag.viewport.releasePointerCapture(drag.pointerId);
  }
  root.addEventListener('pointerdown', event => {
    const viewport = event.target.closest('.wz-map-viewport');
    if (!viewport || !root.contains(viewport) || event.button !== 0 || event.isPrimary === false || mapDrag) return;
    mapDrag = { pointerId: event.pointerId, viewport, x: event.clientX, y: event.clientY, cx: mapView.cx, cy: mapView.cy, moved: false };
  });
  root.addEventListener('pointermove', event => {
    if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { finishMapDrag(event); return; }
    const dx = event.clientX - mapDrag.x;
    const dy = event.clientY - mapDrag.y;
    if (!mapDrag.moved && Math.hypot(dx, dy) < 6) return;
    if (!mapDrag.moved) {
      mapDrag.moved = true;
      mapDrag.viewport.setPointerCapture(event.pointerId);
      mapDrag.viewport.classList.add('wz-dragging');
    }
    event.preventDefault();
    const scale = mapScale(mapDrag.viewport.clientWidth, mapDrag.viewport.clientHeight, mapView.zoom);
    mapView.cx = mapDrag.cx - dx / (MAP_SIZE * scale);
    mapView.cy = mapDrag.cy - dy / (MAP_SIZE * scale);
    applyMapView();
  });
  root.addEventListener('pointerup', finishMapDrag);
  root.addEventListener('pointercancel', finishMapDrag);
  root.addEventListener('lostpointercapture', event => {
    if (event.target === mapDrag?.viewport) finishMapDrag(event);
  });
  window.addEventListener('pointerup', finishMapDrag);
  window.addEventListener('pointercancel', finishMapDrag);
  window.addEventListener('blur', () => finishMapDrag());
  root.addEventListener('keydown', event => {
    if (!event.target.matches('.wz-map-viewport')) return;
    const viewport = event.target;
    const scale = mapScale(viewport.clientWidth, viewport.clientHeight, mapView.zoom);
    const step = event.shiftKey ? 120 : 45;
    if (event.key === 'ArrowLeft') mapView.cx -= step / (MAP_SIZE * scale);
    else if (event.key === 'ArrowRight') mapView.cx += step / (MAP_SIZE * scale);
    else if (event.key === 'ArrowUp') mapView.cy -= step / (MAP_SIZE * scale);
    else if (event.key === 'ArrowDown') mapView.cy += step / (MAP_SIZE * scale);
    else if (event.key === '+' || event.key === '=') zoomMap(1.25);
    else if (event.key === '-') zoomMap(1 / 1.25);
    else if (event.key === 'Home' || event.key === '0') mapView = { ...mapStart };
    else return;
    event.preventDefault();
    applyMapView();
  });
  window.addEventListener('resize', applyMapView);
  window.addEventListener('resize', () => { if (visible) fitSlabText(root); });

  function render() {
    finishMapDrag();
    mapObserver?.disconnect();
    const scrolls = new Map([...root.querySelectorAll('[data-wz-scroll]')].map(node => [node.dataset.wzScroll, node.scrollTop]));
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset.wzFocus;
    const selection = active?.tagName === 'INPUT' && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
    root.dataset.wzScreen = screen;
    root.innerHTML = ({ title: titleHub, home: homeHub, character: characterHub, friends: friendsHub, deck: deckHub, storybook: storybookHub, 'battle-setup': battleSetupHub }[screen])() + (notice ? `<div class="wz-notice" role="status">${escapeHub(notice)}</div>` : '');
    fitSlabText(root);
    applyMapView();
    const mapViewport = root.querySelector('.wz-map-viewport');
    if (mapViewport) mapObserver?.observe(mapViewport);
    for (const node of root.querySelectorAll('[data-wz-scroll]')) node.scrollTop = scrolls.get(node.dataset.wzScroll) || 0;
    if (focusKey) {
      const target = [...root.querySelectorAll('[data-wz-focus]')].find(node => node.dataset.wzFocus === focusKey);
      target?.focus({ preventScroll: true });
      if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
    }
  }
  function show(nextScreen = 'title', options = {}) {
    const next = HUB_SCREENS.has(nextScreen) ? nextScreen : 'title';
    const districtId=next==='storybook'?normalizeDistrictId(options.districtId):null;
    const changed = !visible || next !== screen || next==='storybook'&&districtId!==storybookDistrictId;
    if(screen==='storybook'||next==='storybook')resetStorybook();
    if(next==='storybook'){
      storybookDistrictId=districtId;
      if(districtId!==null)expandedDistricts.add(districtId);
    }
    if (next === 'deck' && screen !== 'deck' && screen !== 'battle-setup') selectedElement = profile.element;
    screen = next;
    visible = true;
    root.hidden = false;
    const hash=next==='storybook'&&districtId!==null?`#storybook/district/${districtId}`:`#${next}`;
    if (options.history !== false && location.hash !== hash) history.pushState({ wizzyScreen: next, districtId }, '', hash);
    render();
    if(next==='storybook'&&districtId!==null)focusStorybookDistrict(districtId);
    else if(next==='home'&&mapReturnDistrictId!==null)root.querySelector(`[data-wz-district="${mapReturnDistrictId}"]`)?.focus({preventScroll:true});
    else if(changed){
      if(next==='storybook')root.querySelector('.wz-storybook-scroll').scrollTop=0;
      root.querySelector('h1')?.focus({preventScroll:true});
    }
  }
  function hide() { finishMapDrag(); mapObserver?.disconnect(); resetStorybook(); visible = false; root.hidden = true; }
  function getSavedDecks() { stashBook(); return cloneHub(books[ACTIVE_SPELLBOOK_ID].savedDecks); }
  function setDeckNotice(message) {
    if (!message) return;
    activeMigrationNotice = [activeMigrationNotice, message].filter(Boolean).join(' ');
    deckTransferNotice = activeMigrationNotice;
    persistHub();
    if (visible) render();
  }
  function getProfile() { return cloneHub(profile); }
  function getLocalData() { stashBook(); return { profile: getProfile(), decks: cloneHub(books[SPELLBOOK_1].savedDecks), spellbook2Decks: getSavedDecks() }; }
  function savedLocalHub() {
    if (!activeAccountId) guestSnapshot = snapshotHub();
    try { Promise.resolve(onSaveLocal(getLocalData())).catch(() => {}); } catch {}
  }
  function restoreBookState(candidate, bookId) {
    const result = emptyBook(bookId);
    result.drafts = {};
    for (const id of ELEMENTS) {
      const deck = candidate?.savedDecks?.[id];
      if (deck?.element === id && getDeckSpellbook(deck) === bookId && validateDeckSlot(deck)) result.savedDecks[id] = normalizeDeckSlot(deck);
      result.drafts[id] = restoreDraft(candidate?.drafts?.[id], id, result.savedDecks[id], bookId);
    }
    result.cloudDecks = candidate?.cloudDecks ? cloneHub(candidate.cloudDecks) : null;
    return result;
  }
  function applyAccountData(account) {
    deckTransferGeneration++;
    deckTransferNotice = '';
    const validDecks = (decks, bookId) => ELEMENTS.every(id => (id === 'earth' && decks?.[id] === undefined) || (decks?.[id]?.element === id && getDeckSpellbook(decks[id]) === bookId && validateDeckSlot(decks[id])));
    if (!account || typeof account.id !== 'string' || !account.id || !ELEMENTS.includes(account.profile?.element)
      || !validDecks(account.decks, SPELLBOOK_1) || (account.spellbook2Decks !== undefined && !validDecks(account.spellbook2Decks, SPELLBOOK_2))) {
      throw new Error('The account profile or saved decks are invalid.');
    }
    const switching = activeAccountId !== account.id;
    let prior = snapshotHub();
    if (switching) {
      if (activeAccountId) persistence.cacheAccount(activeAccountId, prior);
      else { guestSnapshot = prior; persistence.cacheGuest(prior); }
      prior = persistence.readAccount(account.id);
    }
    activeMigrationNotice = '';
    activeAccountId = account.id;
    accountUsername = String(account.username || '').slice(0, 24);
    profile = { name: String(account.profile.name || 'Wizzy').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Wizzy', element: account.profile.element };
    for (const bookId of [SPELLBOOK_1, SPELLBOOK_2]) {
      const previous = bookId === SPELLBOOK_1 ? prior : prior?.spellbook2;
      const received = bookId === SPELLBOOK_1 ? account.decks : account.spellbook2Decks;
      const next = restoreBookState(previous, bookId);
      if (received) {
        next.savedDecks = Object.fromEntries(ELEMENTS.map(id => [id, normalizeDeckSlot(received[id] || createStarterDeck(id, bookId))]));
        next.cloudDecks = cloneHub(next.savedDecks);
        for (const id of ELEMENTS) {
          const previousDraft = restoreDraft(previous?.drafts?.[id], id, next.savedDecks[id], bookId);
          const previousSaved = previous?.savedDecks?.[id];
          const previousCloud = previous?.cloudDecks?.[id] || previousSaved;
          const wasDirty = validateDeckSlot(previousSaved) && (deckSignature(previousDraft) !== deckSignature(previousSaved) || deckSignature(previousDraft) !== deckSignature(previousCloud));
          next.drafts[id] = wasDirty ? previousDraft : cloneHub(next.savedDecks[id]);
        }
      }
      books[bookId] = next;
    }
    if (switching) {
      selectedElement = profile.element;
      selectedSpellbookId = ACTIVE_SPELLBOOK_ID;
    }
    ({ savedDecks, drafts, cloudDecks } = books[selectedSpellbookId]);
    activeMigrationNotice = account.activeMigrationNotice || account.migrationMessage || '';
    if (activeMigrationNotice) deckTransferNotice = activeMigrationNotice;
    accountStatus = { state: 'synced', message: 'Profile and saved decks are synced to your account.' };
    persistHub();
    if (visible) render();
  }
  function clearAccountData() {
    deckTransferGeneration++;
    deckTransferNotice = '';
    if (!activeAccountId) return;
    persistence.cacheAccount(activeAccountId, snapshotHub());
    const guest = persistence.readGuest() || guestSnapshot;
    profile = guest?.profile && ELEMENTS.includes(guest.profile.element) ? cloneHub(guest.profile) : { name: 'Wizzy', element: 'fire' };
    books[SPELLBOOK_1] = restoreBookState(guest, SPELLBOOK_1);
    books[SPELLBOOK_2] = restoreBookState(guest?.spellbook2, SPELLBOOK_2);
    books[SPELLBOOK_1].cloudDecks = books[SPELLBOOK_2].cloudDecks = null;
    selectedSpellbookId = ACTIVE_SPELLBOOK_ID;
    ({ savedDecks, drafts, cloudDecks } = books[selectedSpellbookId]);
    activeMigrationNotice = guest?.activeMigrationNotice || '';
    if (activeMigrationNotice) deckTransferNotice = activeMigrationNotice;
    activeAccountId = null; accountUsername = ''; accountStatus = { state: 'guest', message: '' };
    selectedElement = profile.element;
    persistHub();
    if (visible) render();
  }
  function setAccountStatus(status = {}) {
    accountStatus = { ...accountStatus, ...status };
    if (typeof status.username === 'string') accountUsername = status.username.slice(0, 24);
    if (visible) render();
  }
  function battleHub() { onBattle({ decks: getSavedDecks(), element: profile.element, spellbookId: selectedSpellbookId }); }
  function updateQuantityHub(spellId, quantity) {
    try {
      drafts[selectedElement] = setDeckQuantity(drafts[selectedElement], spellId, quantity);
      notice = '';
      persistHub();
    } catch (error) { messageHub(error.message || 'That slab cannot be added to this deck.'); }
    render();
  }
  function saveDeckHub(startBattle = false) {
    const validation = getDeckValidation(drafts[selectedElement]);
    if (!validation.valid) { messageHub(validation.errors[0] || 'Add at least 1 slab before saving; the maximum is 30.'); render(); return; }
    activeMigrationNotice = '';
    deckTransferNotice = '';
    savedDecks[selectedElement] = normalizeDeck(drafts[selectedElement]);
    drafts[selectedElement] = cloneHub(savedDecks[selectedElement]);
    const stored = persistHub();
    savedLocalHub();
    messageHub(stored ? `${SPELLBOOKS[selectedSpellbookId].label} · ${elementName(selectedElement)} deck saved${activeAccountId ? '' : ' on this device'}. New battles will use ${validation.total === 1 ? 'this 1 slab' : `these ${validation.total} slabs`}.` : 'Deck ready for this session. Device saving is unavailable.');
    render();
    if (startBattle) showBattleChooser({ element: selectedElement });
  }
  function showDeckSetup(message = 'Save a deck with 1–30 slabs before battling.', element = null, bookId = selectedSpellbookId) {
    selectSpellbook(ACTIVE_SPELLBOOK_ID);
    const target = ELEMENTS.includes(element) ? element : profile.element;
    show('deck');
    selectedElement = target;
    deckTransferNotice = message;
    deckTransferError = false;
    render();
  }
  function downloadDeckHub() {
    try {
      const encoded = serializeDeck(drafts[selectedElement]);
      const url = URL.createObjectURL(new Blob([encoded], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `wizzy-${selectedElement}-${selectedSpellbookId}-${SPELLBOOK_VERSION}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      deckTransferNotice = `${elementName(selectedElement)} deck downloaded. Upload this file to restore it on another device.`;
      deckTransferError = false;
    } catch (error) {
      deckTransferNotice = error.message || 'Save a legal deck with 1–30 slabs before downloading.';
      deckTransferError = true;
    }
    render();
  }
  async function uploadDeckHub(file) {
    if (!file) return;
    const generation = deckTransferGeneration;
    try {
      if (file.size > MAX_DECK_FILE_BYTES) throw new Error('Choose a Wizzy deck JSON file smaller than 64 KB.');
      const report = parseDeckListForActive(await file.text());
      const imported = report.deck;
      if (generation !== deckTransferGeneration) return;
      selectSpellbook(getDeckSpellbook(imported), { persist: false });
      selectedElement = imported.element;
      drafts[selectedElement] = imported;
      filter = 'All';
      inDeckOnly = false;
      persistHub();
      const review = [
        ...report.replacements.map(item => `${item.quantity} Fire-5 ${item.quantity === 1 ? 'copy was' : 'copies were'} replaced with Charred Blade (5 Mana)`),
        ...(report.removed.length ? [`Retired cards set aside: ${report.removed.map(item => `${SPELL_CATALOG[item.spellId]?.name || item.spellId} ×${item.quantity}`).join(', ')}`] : []),
      ];
      deckTransferNotice = `${elementName(selectedElement)} deck imported for review. ${review.length ? review.join('. ') + '. ' : ''}Your saved battle deck is unchanged until you press Save deck.`;
      deckTransferError = false;
    } catch (error) {
      if (generation !== deckTransferGeneration) return;
      deckTransferNotice = error.message || 'That deck file could not be uploaded.';
      deckTransferError = true;
    }
    if (visible) render();
  }

  root.addEventListener('click', event => {
    if (event.detail > 0 && Date.now() < suppressMapClickUntil && event.target.closest('.wz-map-viewport')) { event.preventDefault(); return; }
    const button = event.target.closest('[data-wz-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    switch (button.dataset.wzAction) {
      case 'enter': show('home'); break;
      case 'title': case 'home': case 'character': case 'friends': case 'deck': show(button.dataset.wzAction); break;
      case 'district': {
        const id=normalizeDistrictId(button.dataset.wzDistrict);
        if(getDistrict(id)){mapReturnDistrictId=id;show('storybook',{districtId:id});}
        break;
      }
      case 'map-zoom-in': zoomMap(1.25); break;
      case 'map-zoom-out': zoomMap(1 / 1.25); break;
      case 'map-center': mapView = { ...mapStart }; applyMapView(); break;
      case 'map-overview': mapView = { zoom: 1, cx: .5, cy: .5 }; applyMapView(); break;
      case 'storybook': show('storybook'); break;
      case 'battle': battleHub(); break;
      case 'battle-setup-back': show(battleSetupReturn); break;
      case 'battle-element': {
        const seat = Number(button.dataset.wzSeat);
        if ([0, 1].includes(seat) && ELEMENTS.includes(button.dataset.wzElement)) selectedBattleElements[seat] = button.dataset.wzElement;
        render();
        break;
      }
      case 'battle-edit': showDeckSetup(`Save your ${elementName(button.dataset.wzElement)} deck with 1–30 slabs before battling.`, button.dataset.wzElement); break;
      case 'start-local-battle': startSelectedBattle(); break;
      case 'multiplayer': onMultiplayer({ decks: getSavedDecks(), profile: getProfile() }); break;
      case 'account': onAccount(); break;
      case 'inspect': onInspectSpell(button.dataset.wzSpell); break;

      case 'deck-element': if (!ELEMENTS.includes(button.dataset.wzElement)) break; selectedElement = button.dataset.wzElement; notice = ''; deckTransferNotice = ''; render(); break;
      case 'profile-element': if (!ELEMENTS.includes(button.dataset.wzElement)) break; profile.element = button.dataset.wzElement; selectedElement = profile.element; persistHub(); savedLocalHub(); render(); break;
      case 'filter': filter = button.dataset.wzFilter; render(); break;
      case 'quantity': updateQuantityHub(button.dataset.wzSpell, getDeckCount(drafts[selectedElement], button.dataset.wzSpell) + Number(button.dataset.wzDelta)); break;
      case 'clear': drafts[selectedElement] = createStarterDeck(selectedElement, selectedSpellbookId); persistHub(); messageHub('Draft cleared. Your saved battle deck is still available.'); render(); break;
      case 'upload-deck': root.querySelector('[data-wz-deck-upload]')?.click(); break;
      case 'download-deck': downloadDeckHub(); break;
      case 'save-deck': saveDeckHub(); break;
      case 'test-deck': saveDeckHub(true); break;
    }
  });
  root.addEventListener('change', event => {
    if (event.target.matches('[data-wz-deck-upload]')) { uploadDeckHub(event.target.files?.[0]); }
    else if (event.target.matches('[data-wz-in-deck-filter]')) { inDeckOnly = event.target.checked; render(); }
    else if (event.target.matches('[data-wz-card-check]')) updateQuantityHub(event.target.dataset.wzCardCheck, event.target.checked ? 1 : 0);
  });
  root.addEventListener('submit', event => {
    if (!event.target.matches('.wz-profile-form')) return;
    event.preventDefault();
    const name = new FormData(event.target).get('wizardName');
    profile.name = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Wizzy';
    const stored = persistHub();
    savedLocalHub();
    messageHub(stored ? 'Your wizard name is saved.' : 'Name updated for this session. Device saving is unavailable.');
    render();
  });
  const followHashHub = () => {
    const journal=parseStorybookRoute(location.hash);
    if(journal){show('storybook',{districtId:journal.districtId,history:false});return;}
    const next = location.hash.slice(1);
    if (HUB_SCREENS.has(next)) show(next, { history: false });
  };
  window.addEventListener('hashchange', followHashHub);
  window.addEventListener('popstate', followHashHub);
  return { show, hide, render, showDeckSetup, showBattleChooser, setDeckNotice, getSavedDecks, getSelectedSpellbookId: () => selectedSpellbookId, getProfile, getLocalData, applyAccountData, clearAccountData, setAccountStatus, isVisible: () => visible };
}
