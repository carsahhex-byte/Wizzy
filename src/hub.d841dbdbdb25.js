import { ASSETS, ASSET_CROPS } from './assets.40ea6034db7c.js';
import { SPELL_CATALOG, DECK_SIZE } from './spells.60141befac6b.js';
import { MAX_COPIES, createStarterDeck, getDeckValidation, validateDeck, normalizeDeck, setDeckQuantity, getEligibleSpells, getDeckCount } from './decks.8ef89a458653.js';

const HUB_SAVE_KEY = 'wizzy.hub.v1';
const HUB_SCREENS = new Set(['title', 'home', 'character', 'friends', 'deck']);
const escapeHub = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cloneHub = value => structuredClone(value);
const elementName = value => value === 'water' ? 'Water' : 'Fire';
const deckSignature = deck => JSON.stringify([...deck.entries].sort((a, b) => a.spellId.localeCompare(b.spellId)));
const librarySpells = Object.values(SPELL_CATALOG).sort((a, b) => {
  const order = { Fire: 0, Water: 1, Neutral: 2, Fate: 3 };
  return order[a.type] - order[b.type] || a.name.localeCompare(b.name);
});

function hubArt(key, className = '', cropOverride = null) {
  const crop = ASSET_CROPS[key] && { ...ASSET_CROPS[key], ...cropOverride };
  if (!crop || !ASSETS[key]) return '';
  return `<span class="wz-cropped ${className}" style="aspect-ratio:${crop.w}/${crop.h}"><img alt="" draggable="false" src="${escapeHub(ASSETS[key])}" style="width:${crop.width / crop.w * 100}%;height:${crop.height / crop.h * 100}%;left:${-crop.x / crop.w * 100}%;top:${-crop.y / crop.h * 100}%"></span>`;
}

function hubHead(element) {
  return element === 'water'
    ? hubArt('waterMage', '', { x: 362, y: 114, w: 620, h: 490 })
    : hubArt('fireMage', '', { x: 240, y: 117, w: 640, h: 500 });
}

function hubIcon(name, className = '') {
  const positions = { character: '0% 0%', deck: '50% 0%', friends: '100% 0%', battle: '0% 100%', pin: '50% 100%', compass: '100% 100%' };
  const symbols = { character: '♟', deck: '▤', friends: '♟♟', battle: '⚔', pin: '◆', compass: '✦' };
  return `<span class="wz-icon ${className}" aria-hidden="true" style="--wz-icon-position:${positions[name] || positions.compass}"><span>${symbols[name] || '✦'}</span></span>`;
}

function restoreDraft(candidate, element, fallback) {
  if (!candidate || candidate.element !== element || !Array.isArray(candidate.entries)) return cloneHub(fallback);
  let draft = { element, entries: [] };
  const seen = new Set();
  try {
    for (const entry of candidate.entries) {
      if (!entry || seen.has(entry.spellId) || !Number.isInteger(entry.quantity) || entry.quantity < 1) throw new Error('Invalid draft');
      seen.add(entry.spellId);
      draft = setDeckQuantity(draft, entry.spellId, entry.quantity);
    }
    return draft;
  } catch { return cloneHub(fallback); }
}

/** Mobile navigation and local deck editing. The battle host owns duel state. */
export function createHub({ root, onBattle = () => {}, onInspectSpell = () => {}, assets = {} }) {
  if (!root) throw new Error('The Wizzy hub needs a root element.');
  root.classList.add('wz-hub-root');
  root.hidden = true;
  const scene = assets.titleScene || ASSETS.titleScene || ASSETS.forest;
  const map = assets.seattleMap || ASSETS.seattleMap;
  const atlas = assets.iconAtlas || ASSETS.iconAtlas;
  if (scene) root.style.setProperty('--wz-title-scene', `url("${scene}")`);
  if (map) root.style.setProperty('--wz-map-scene', `url("${map}")`);
  if (atlas) {
    root.style.setProperty('--wz-icon-atlas', `url("${atlas}")`);
    root.classList.add('wz-has-atlas');
  }

  let storageAvailable = true;
  let screen = 'title';
  let visible = false;
  let selectedElement = 'fire';
  let filter = 'All';
  let inDeckOnly = false;
  let placeOpen = false;
  let notice = '';
  let noticeTimer;
  let profile = { name: 'Wizzy', element: 'fire' };
  let savedDecks = { fire: createStarterDeck('fire'), water: createStarterDeck('water') };
  let drafts = cloneHub(savedDecks);

  try {
    const raw = localStorage.getItem(HUB_SAVE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    if (stored?.version === 1) {
      if (stored.profile && ['fire', 'water'].includes(stored.profile.element)) {
        profile.element = stored.profile.element;
        if (typeof stored.profile.name === 'string' && stored.profile.name.trim()) profile.name = stored.profile.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Wizzy';
      }
      for (const element of ['fire', 'water']) {
        if (stored.savedDecks?.[element]?.element === element && validateDeck(stored.savedDecks[element])) savedDecks[element] = normalizeDeck(stored.savedDecks[element]);
        drafts[element] = restoreDraft(stored.drafts?.[element], element, savedDecks[element]);
      }
    }
  } catch {
    storageAvailable = false;
    notice = 'Device storage could not be read. Starter decks are ready for this session.';
  }
  selectedElement = profile.element;

  function persistHub() {
    try {
      localStorage.setItem(HUB_SAVE_KEY, JSON.stringify({ version: 1, profile, savedDecks, drafts }));
      storageAvailable = true;
      return true;
    } catch { storageAvailable = false; return false; }
  }
  function messageHub(text) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; if (visible) render(); }, 4500);
  }
  function footerHub() {
    const build = document.querySelector('meta[name="wizzy-build"]')?.content;
    return `<footer class="wz-footer"><span>${storageAvailable ? 'SAVED ON THIS DEVICE' : 'DEVICE SAVING UNAVAILABLE'}</span><span>${build && build !== 'development' ? `BUILD ${escapeHub(build)}` : 'WIZZY · FIRST JOURNEY'}</span></footer>`;
  }
  function topHub(title, subtitle = '') {
    return `<header class="wz-header"><button class="wz-back" data-wz-action="home" aria-label="Back to Seattle map">‹</button><div><p class="wz-eyebrow">${subtitle || 'WIZZY · SEATTLE'}</p><h1 tabindex="-1">${title}</h1></div><button class="wz-mini-avatar" data-wz-action="character" aria-label="Open your character">${hubHead(profile.element)}</button></header>`;
  }
  function elementSwitch(context) {
    const element = context === 'profile' ? profile.element : selectedElement;
    return `<div class="wz-element-switch" role="group" aria-label="${context === 'profile' ? 'Choose your wizard element' : 'Choose a deck to edit'}">${['fire', 'water'].map(id => `<button class="wz-element-tab wz-${id} ${element === id ? 'wz-active' : ''}" data-wz-action="${context === 'profile' ? 'profile-element' : 'deck-element'}" data-wz-element="${id}" data-wz-focus="${context}-${id}" aria-pressed="${element === id}"><span aria-hidden="true">${id === 'fire' ? '♨' : '≈'}</span> ${elementName(id)}</button>`).join('')}</div>`;
  }
  function titleHub() {
    return `<section class="wz-phone wz-title-screen"><div class="wz-title-shade"></div><div class="wz-title-brand"><p class="wz-eyebrow">A LITTLE MAGIC. A WHOLE CITY.</p><h1 tabindex="-1">Wizzy</h1><p class="wz-title-subtitle">YOUR JOURNEY BEGINS IN SEATTLE</p></div><div class="wz-title-entry"><span class="wz-spark wz-spark-left" aria-hidden="true">✦</span><button class="wz-pixel-button wz-enter" data-wz-action="enter">Enter Game <span aria-hidden="true">→</span></button><span class="wz-spark wz-spark-right" aria-hidden="true">✦</span><p>EXPLORE THE CITY. FIND YOUR MAGIC.</p></div><div class="wz-title-bottom"><span class="wz-tiny-star" aria-hidden="true">✧</span><p>FIRE · WATER · FATE</p></div>${footerHub()}</section>`;
  }
  function homeHub() {
    return `<section class="wz-phone wz-home-screen"><div class="wz-map-art" aria-hidden="true"></div><div class="wz-map-shade"></div><header class="wz-map-header"><button class="wz-small-wordmark" data-wz-action="title" aria-label="Return to Wizzy title screen">Wizzy<span>SEATTLE</span></button><button class="wz-profile-chip" data-wz-action="character">${hubHead(profile.element)}<span>${escapeHub(profile.name)}<small>${elementName(profile.element)} wizard</small></span></button></header><div class="wz-map-label wz-northgate">NORTHGATE</div><div class="wz-map-label wz-magnolia">MAGNOLIA</div><div class="wz-map-label wz-magnuson">MAGNUSON<br>PARK</div><div class="wz-map-label wz-lake-union">LAKE UNION</div><div class="wz-map-label wz-rainier">RAINIER BEACH</div><div class="wz-locked-district" aria-label="West Seattle, locked"><span aria-hidden="true">▧</span><strong>WEST<br>SEATTLE</strong><small>LOCKED</small></div><div class="wz-you-marker" aria-label="Your wizard, preview position"><div class="wz-marker-portrait">${hubHead(profile.element)}</div><span>YOU</span></div><button class="wz-market-marker ${placeOpen ? 'wz-open' : ''}" data-wz-action="market" aria-label="View Pike Place Market starting location">${hubIcon('pin')}<span>PIKE PLACE<small>START HERE</small></span></button>${placeOpen ? `<aside class="wz-place-panel"><button data-wz-action="market" class="wz-place-close" aria-label="Close Pike Place preview">×</button><p class="wz-eyebrow">THE FIRST CHAPTER</p><h2>Pike Place Market</h2><p>Every wizard needs a beginning. Yours is waiting at the Market.</p><span class="wz-preview-tag">LOCATION PREVIEW</span><small>Arrival unlocks will be connected in a later build.</small></aside>` : '<div class="wz-map-note">A city full of stories.<br><strong>Make this one yours.</strong></div>'}<nav class="wz-map-controls" aria-label="Game screens"><button class="wz-map-button wz-character-button" data-wz-action="character">${hubIcon('character')}<span>Character</span></button><div class="wz-right-controls"><button class="wz-map-button wz-battle-button" data-wz-action="battle">${hubIcon('battle')}<span>Battle<small>PLAYTEST</small></span></button><button class="wz-map-button" data-wz-action="friends">${hubIcon('friends')}<span>Friends</span></button><button class="wz-map-button" data-wz-action="deck">${hubIcon('deck')}<span>Deck</span></button></div></nav><p class="wz-map-preview">MAP PREVIEW · LOCATION NOT CONNECTED</p>${footerHub()}</section>`;
  }
  function characterHub() {
    const deck = savedDecks[profile.element];
    return `<section class="wz-phone wz-panel-screen wz-character-screen">${topHub('Your Wizzy', 'CHARACTER')}<div class="wz-page-scroll" data-wz-scroll="character"><div class="wz-character-stage wz-${profile.element}"><span class="wz-character-halo"></span>${hubArt(profile.element === 'water' ? 'waterMage' : 'fireMage', 'wz-character-art')}<div class="wz-character-plaque"><strong>${escapeHub(profile.name)}</strong><span>${elementName(profile.element)} wizard</span></div></div><div class="wz-paper-panel"><form class="wz-profile-form"><label for="wz-character-name">Wizard name</label><div class="wz-name-row"><input id="wz-character-name" name="wizardName" maxlength="24" value="${escapeHub(profile.name)}" autocomplete="nickname" data-wz-focus="wizard-name"><button class="wz-small-button" type="submit">Save</button></div></form><p class="wz-field-label">YOUR ELEMENT</p>${elementSwitch('profile')}<p class="wz-element-help">Your element chooses your map portrait and the deck you open first.</p><div class="wz-stat-heading">DUEL STARTING STATS</div><div class="wz-profile-stats"><div><span>HP</span><strong>30</strong></div><div><span>MANA</span><strong>3</strong></div><div><span>${profile.element === 'water' ? 'FLOW' : 'EMBERS'}</span><strong>0</strong></div></div><button class="wz-profile-deck" data-wz-action="deck">${hubIcon('deck')}<span>${elementName(profile.element)} spell deck<small>${getDeckValidation(deck).total} slabs · ready for battle</small></span><b aria-hidden="true">›</b></button></div><p class="wz-page-note">Your name, element, and decks stay on this device. Story progression will grow with the city.</p></div>${footerHub()}</section>`;
  }
  function friendsHub() {
    return `<section class="wz-phone wz-panel-screen wz-friends-screen">${topHub('Your Party', 'FRIENDS')}<div class="wz-page-scroll" data-wz-scroll="friends"><div class="wz-party-art" aria-hidden="true"><span class="wz-party-star">✦</span>${hubIcon('friends')}<span class="wz-party-star">✧</span></div><div class="wz-empty-party"><p class="wz-eyebrow">ADVENTURES ARE BETTER TOGETHER</p><h2>A place for your party.</h2><p>Friends, battle invitations, and messages will live here when online play is connected.</p><div class="wz-friend-features"><span>${hubIcon('friends')} Add friends</span><span>${hubIcon('battle')} Challenge a wizard</span><span class="wz-message-feature"><i aria-hidden="true">▤</i> Send messages</span></div><span class="wz-preview-tag">FRIENDS SCREEN PREVIEW</span></div><div class="wz-local-play-panel"><strong>A duel is ready right now.</strong><p>Share this screen with a friend and test Fire against Water using your saved decks.</p><button class="wz-pixel-button" data-wz-action="battle">${hubIcon('battle')} Play a local battle</button></div></div>${footerHub()}</section>`;
  }
  function deckRowsHub(draft) {
    const total = getDeckValidation(draft).total;
    if (!draft.entries.length) return '<div class="wz-empty-deck"><span aria-hidden="true">✧</span><strong>Your spell tower starts here.</strong><p>Check slabs in the collection below to build your deck.</p></div>';
    return [...draft.entries].sort((a, b) => SPELL_CATALOG[a.spellId].name.localeCompare(SPELL_CATALOG[b.spellId].name)).map(entry => {
      const card = SPELL_CATALOG[entry.spellId];
      return `<div class="wz-deck-row wz-type-${card.type.toLowerCase()}" data-wz-deck-spell="${card.spellId}"><button class="wz-deck-row-name" data-wz-action="inspect" data-wz-spell="${card.spellId}" aria-label="Read ${escapeHub(card.name)}"><span class="wz-type-dot"></span><span><strong>${escapeHub(card.name)}</strong><small>${card.manaCost} Mana · ${card.type}</small></span></button><div class="wz-quantity" role="group" aria-label="${escapeHub(card.name)} copies"><button data-wz-action="quantity" data-wz-spell="${card.spellId}" data-wz-delta="-1" data-wz-focus="minus-${card.spellId}" aria-label="Remove one ${escapeHub(card.name)}">−</button><strong aria-label="${entry.quantity} copies">${entry.quantity}</strong><button data-wz-action="quantity" data-wz-spell="${card.spellId}" data-wz-delta="1" data-wz-focus="plus-${card.spellId}" aria-label="Add one ${escapeHub(card.name)}" ${entry.quantity >= MAX_COPIES || total >= DECK_SIZE ? 'disabled' : ''}>+</button></div></div>`;
    }).join('');
  }
  function slabHub(card) {
    return `<div class="wz-slab-face">${hubArt(card.art)}<strong class="wz-slab-title">${escapeHub(card.name)}</strong><span class="wz-slab-copy"><b>${card.manaCost} Mana</b><span>${escapeHub(card.effectText)}</span></span></div>`;
  }
  function collectionHub(draft) {
    const eligible = new Set(getEligibleSpells(selectedElement).map(card => card.spellId));
    const total = getDeckValidation(draft).total;
    const cards = librarySpells.filter(card => (filter === 'All' || card.type === filter) && (!inDeckOnly || getDeckCount(draft, card.spellId) > 0));
    if (!cards.length) return '<div class="wz-empty-collection"><strong>No slabs match this filter.</strong><p>Choose another type or turn off In Deck.</p></div>';
    return cards.map(card => {
      const count = getDeckCount(draft, card.spellId);
      const allowed = eligible.has(card.spellId);
      const full = total >= DECK_SIZE && count === 0;
      return `<article class="wz-library-card wz-type-${card.type.toLowerCase()} ${count ? 'wz-in-deck' : ''} ${!allowed ? 'wz-other-element' : ''}" data-wz-library-spell="${card.spellId}"><button class="wz-read-slab" data-wz-action="inspect" data-wz-spell="${card.spellId}" aria-label="Read ${escapeHub(card.name)}">${slabHub(card)}<span class="wz-read-tag">READ SLAB ↗</span></button><label class="wz-card-check"><input type="checkbox" data-wz-card-check="${card.spellId}" data-wz-focus="check-${card.spellId}" aria-label="Include ${escapeHub(card.name)} in your ${elementName(selectedElement)} deck" ${count ? 'checked' : ''} ${!allowed || full ? 'disabled' : ''}><span>${!allowed ? `${card.type} deck only` : count ? `${count} / ${MAX_COPIES} in deck` : full ? 'Deck full' : 'Add to deck'}</span></label></article>`;
    }).join('');
  }
  function deckHub() {
    const draft = drafts[selectedElement];
    const validation = getDeckValidation(draft);
    const dirty = deckSignature(draft) !== deckSignature(savedDecks[selectedElement]);
    const counts = { Elemental: 0, Neutral: 0, Fate: 0 };
    for (const entry of draft.entries) counts[SPELL_CATALOG[entry.spellId].category] += entry.quantity;
    return `<section class="wz-phone wz-panel-screen wz-deck-screen">${topHub('Spell Workshop', 'DECK BUILDER')}<div class="wz-deck-toolbar">${elementSwitch('deck')}<div class="wz-deck-count ${validation.valid ? 'wz-ready' : ''}"><strong data-testid="builder-deck-total">${validation.total}<small> / ${DECK_SIZE}</small></strong><span>${validation.valid ? 'READY TO PLAY' : `${DECK_SIZE - validation.total} SLOTS OPEN`}</span></div></div><div class="wz-deck-layout"><section class="wz-deck-selected" aria-label="Cards in your deck"><header class="wz-section-heading"><div><h2>Your ${elementName(selectedElement)} deck</h2><p>${counts.Elemental} Elemental · ${counts.Neutral} Neutral · ${counts.Fate} Fate <span class="wz-save-chip">${dirty ? 'DRAFT' : 'SAVED'}</span></p></div><div class="wz-deck-tools"><button data-wz-action="starter" class="wz-plain-button">Starter</button><button data-wz-action="clear" class="wz-plain-button">Clear</button></div></header><div class="wz-deck-list" data-wz-scroll="deck-list">${deckRowsHub(draft)}</div></section><section class="wz-collection" aria-label="Available spell slab collection"><header class="wz-section-heading"><h2>Spell collection <small>${librarySpells.length} slabs</small></h2><label class="wz-in-deck-filter"><input type="checkbox" data-wz-in-deck-filter data-wz-focus="in-deck-filter" ${inDeckOnly ? 'checked' : ''}> In Deck</label></header><div class="wz-filter-tabs" role="group" aria-label="Filter spell slabs">${['All', 'Fire', 'Water', 'Neutral', 'Fate'].map(type => `<button data-wz-action="filter" data-wz-filter="${type}" data-wz-focus="filter-${type}" aria-pressed="${filter === type}" class="${filter === type ? 'wz-active' : ''}">${type}</button>`).join('')}</div><div class="wz-collection-grid" data-wz-scroll="collection">${collectionHub(draft)}</div></section></div><div class="wz-deck-savebar"><div><strong>${validation.valid ? 'Your tower is ready.' : `Choose ${DECK_SIZE - validation.total} more ${DECK_SIZE - validation.total === 1 ? 'slab' : 'slabs'}.`}</strong><small>${MAX_COPIES} copies max · ${elementName(selectedElement)} + Neutral + Fate</small></div><button class="wz-small-button" data-wz-action="save-deck" ${!validation.valid ? 'disabled' : ''}>Save deck</button><button class="wz-small-button wz-gold" data-wz-action="test-deck" ${!validation.valid ? 'disabled' : ''}>Battle ↗</button></div>${footerHub()}</section>`;
  }

  function render() {
    const scrolls = new Map([...root.querySelectorAll('[data-wz-scroll]')].map(node => [node.dataset.wzScroll, node.scrollTop]));
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset.wzFocus;
    const selection = active?.tagName === 'INPUT' && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
    root.dataset.wzScreen = screen;
    root.innerHTML = ({ title: titleHub, home: homeHub, character: characterHub, friends: friendsHub, deck: deckHub }[screen])() + (notice ? `<div class="wz-notice" role="status">${escapeHub(notice)}</div>` : '');
    for (const node of root.querySelectorAll('[data-wz-scroll]')) node.scrollTop = scrolls.get(node.dataset.wzScroll) || 0;
    if (focusKey) {
      const target = [...root.querySelectorAll('[data-wz-focus]')].find(node => node.dataset.wzFocus === focusKey);
      target?.focus({ preventScroll: true });
      if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
    }
  }
  function show(nextScreen = 'title', options = {}) {
    const next = HUB_SCREENS.has(nextScreen) ? nextScreen : 'title';
    const changed = !visible || next !== screen;
    if (next === 'deck' && screen !== 'deck') selectedElement = profile.element;
    screen = next;
    visible = true;
    root.hidden = false;
    if (options.history !== false && location.hash !== `#${next}`) history.pushState({ wizzyScreen: next }, '', `#${next}`);
    render();
    if (changed) root.querySelector('h1')?.focus({ preventScroll: true });
  }
  function hide() { visible = false; root.hidden = true; }
  function getSavedDecks() { return cloneHub(savedDecks); }
  function getProfile() { return cloneHub(profile); }
  function battleHub(forceNew = false) { onBattle({ decks: getSavedDecks(), forceNew }); }
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
    if (!validation.valid) { messageHub(validation.errors[0] || 'Your deck needs 30 slabs before saving.'); render(); return; }
    savedDecks[selectedElement] = normalizeDeck(drafts[selectedElement]);
    drafts[selectedElement] = cloneHub(savedDecks[selectedElement]);
    const stored = persistHub();
    messageHub(stored ? `${elementName(selectedElement)} deck saved. New battles will use these 30 slabs.` : 'Deck ready for this session. Device saving is unavailable.');
    render();
    if (startBattle) battleHub(true);
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-wz-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    switch (button.dataset.wzAction) {
      case 'enter': show('home'); break;
      case 'title': case 'home': case 'character': case 'friends': case 'deck': show(button.dataset.wzAction); break;
      case 'market': placeOpen = !placeOpen; render(); break;
      case 'battle': battleHub(); break;
      case 'inspect': onInspectSpell(button.dataset.wzSpell); break;
      case 'deck-element': selectedElement = button.dataset.wzElement; notice = ''; render(); break;
      case 'profile-element': profile.element = button.dataset.wzElement; selectedElement = profile.element; persistHub(); render(); break;
      case 'filter': filter = button.dataset.wzFilter; render(); break;
      case 'quantity': updateQuantityHub(button.dataset.wzSpell, getDeckCount(drafts[selectedElement], button.dataset.wzSpell) + Number(button.dataset.wzDelta)); break;
      case 'clear': drafts[selectedElement] = { element: selectedElement, entries: [] }; persistHub(); messageHub('Draft cleared. Your saved battle deck is still available.'); render(); break;
      case 'starter': drafts[selectedElement] = createStarterDeck(selectedElement); persistHub(); messageHub(`${elementName(selectedElement)} starter loaded into the editor. Save to use it in a new battle.`); render(); break;
      case 'save-deck': saveDeckHub(); break;
      case 'test-deck': saveDeckHub(true); break;
    }
  });
  root.addEventListener('change', event => {
    if (event.target.matches('[data-wz-in-deck-filter]')) { inDeckOnly = event.target.checked; render(); }
    else if (event.target.matches('[data-wz-card-check]')) updateQuantityHub(event.target.dataset.wzCardCheck, event.target.checked ? 1 : 0);
  });
  root.addEventListener('submit', event => {
    if (!event.target.matches('.wz-profile-form')) return;
    event.preventDefault();
    const name = new FormData(event.target).get('wizardName');
    profile.name = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Wizzy';
    const stored = persistHub();
    messageHub(stored ? 'Your wizard name is saved.' : 'Name updated for this session. Device saving is unavailable.');
    render();
  });
  const followHashHub = () => {
    const next = location.hash.slice(1);
    if (HUB_SCREENS.has(next)) show(next, { history: false });
  };
  window.addEventListener('hashchange', followHashHub);
  window.addEventListener('popstate', followHashHub);
  return { show, hide, render, getSavedDecks, getProfile, isVisible: () => visible };
}
