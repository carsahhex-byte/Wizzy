import { pixelIconMarkup } from './pixel-icons.6683d76908aa.js';

// Display copy only. Canonical descriptions and combat remain in the spellbook.
// "Instead" replaces the preceding tier; "extra" adds to the base effect.
const line = text => ({ text });
const at = (threshold, text) => ({ threshold, text });
export const COMPACT_SPELL_TEXT = Object.freeze(Object.fromEntries(Object.entries({
  'Fire-0': [line('+1 Ember')],
  'Fire-1': [line('Deal 6'), at('7+', '+1 Ember'), at('10+', '+2 Embers instead')],
  'Fire-2': [line('+1 Ember'), at('7+', '+2 Embers instead'), at('10+', '+3 Embers instead')],
  'Fire-3': [line('+12 Shield'), at('7+', '+1 Ember'), at('10+', '+2 Embers instead')],
  'Fire-4': [line('Deal 5, +1 Ember'), at('8+', 'Next roll +2'), at('11+', '+4 instead')],
  'Fire-5': [line('Deal 10'), line('May spend 1 Ember: +8 damage'), at('9+', 'Cut ≤8 Shield first')],
  'Fire-6': [line('Deal 22'), at('7+', 'Deal 28 instead'), at('10+', 'Deal 36 instead')],
  'Fire-7': [line('Spend all Embers'), line('Deal 15 + 7×Ember spent'), at('9+', '15 + 10×Ember instead')],
  'Fire-8': [line('Deal 10, +1 Ember'), at('8+', 'Deal +4 extra')],
  'Fire-9': [line('+2 Embers'), at('7+', '+3 instead'), line('Then 4+ Embers: +8 Shield')],
  'Fire-10': [line('+16 Shield, +1 Ember'), at('8+', '+8 Shield extra')],
  'Fire-11': [line('Deal 8, +2 Embers'), at('7+', 'Next roll +2'), at('10+', '+4 instead')],
  'Fire-12': [line('Deal 14'), line('Spend 0–2 Embers: +8 damage each'), at('7+', 'Cut ≤10 Shield first')],
  'Fire-13': [line('Deal 30'), at('7+', 'Deal 38 instead'), at('10+', 'Deal 45 instead')],
  'Fire-14': [line('Spend all Embers'), line('Deal 20 + 9×Ember spent'), at('8+', '20 + 12×Ember instead')],
  'Fire-15': [line('+1 Ember'), at('7+', '+1 Mana')],
  'Water-0': [line('+1 Mana on cast'), at('7+', '+1 extra Flow')],
  'Water-1': [line('Deal 6'), at('7+', 'Deal +3 extra')],
  'Water-2': [line('Deal 4 + 2×Flow'), at('8+', 'After spell: +1 extra Flow')],
  'Water-3': [line('+10 Shield'), at('7+', 'Heal 5'), at('10+', 'Heal 10 instead')],
  'Water-4': [line('Deal 5 + Flow'), at('7+', 'Next roll +2'), at('10+', 'After spell: +1 extra Flow')],
  'Water-5': [line('Deal 8 + 2×Flow'), at('9+', 'Heal Flow')],
  'Water-6': [line('Deal 15 + 3×Flow'), at('9+', 'Deal +8 extra')],
  'Water-7': [line('Deal 12 + 5×Flow'), at('9+', 'Deal +10 extra')],
  'Water-8': [line('Deal 9 + Flow'), at('7+', 'Deal +4 extra')],
  'Water-9': [line('Deal 6 + 2×Flow'), line('After spell: +1 extra Flow'), at('10+', 'Deal +5 extra')],
  'Water-10': [line('+14 Shield, Heal 5'), at('7+', 'Heal +2×Flow extra')],
  'Water-11': [line('Deal 8 + Flow'), line('Next roll +2'), at('7+', 'After spell: +1 extra Flow')],
  'Water-12': [line('Deal 12 + 2×Flow'), at('7+', 'Heal 2×Flow')],
  'Water-13': [line('Deal 20 + 3×Flow'), at('7+', 'Deal +10 extra')],
  'Water-14': [line('Deal 15 + 5×Flow'), at('8+', 'Deal +12 extra')],
  'FAT-001': [line('+4 to roll')],
  'FAT-002': [line('−4 to roll')],
  'FAT-003': [line('+2/−2 to roll')],
}).map(([id, lines]) => [id, Object.freeze(lines.map(value => Object.freeze(value)))])));

const escapeSlabText = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const compactLines = id => Object.hasOwn(COMPACT_SPELL_TEXT, id) ? COMPACT_SPELL_TEXT[id] : [];
const symbols = { Deal: 'sword', damage: 'sword', Heal: 'heart', Ember: 'fire', Embers: 'fire',
  Flow: 'water', Shield: 'shield', Mana: 'mana', roll: 'die' };
function symbolsMarkup(text) {
  return text.split(/(\b(?:Deal|damage|Heal|Embers?|Flow|Shield|Mana|roll)\b)/g).map(word => {
    if (!Object.hasOwn(symbols, word)) return escapeSlabText(word);
    const kind = symbols[word], resource = kind === 'fire' || kind === 'water';
    return `<span class="slab-symbol${resource ? ' slab-resource-token' : ''}" data-rule-word="${word}"${resource ? ` data-resource="${kind}"` : ''}>${pixelIconMarkup(kind, 'slab-rule-icon')}<span class="sr-only">${word}</span></span>`;
  }).join('');
}
export function slabRulesMarkup(spellId) {
  return compactLines(spellId).map(({ threshold, text }) =>
    `<span class="slab-rule-line">${threshold ? `<strong class="slab-rule-threshold">${escapeSlabText(threshold)}</strong> ` : ''}${symbolsMarkup(text)}</span>`,
  ).join(' ');
}
export function slabRulesText(spellId) {
  return compactLines(spellId).map(({ threshold, text }) => `${threshold ? `${threshold} ` : ''}${text}`).join(' ');
}

/** One proportional size for every description; never shrink a dense card. */
export function fitSlabText(root) {
  if (!root?.querySelectorAll) return 0;
  const slabs = [...root.querySelectorAll('.spell-slab-art')];
  if (root.matches?.('.spell-slab-art')) slabs.unshift(root);
  const number = value => Number.parseFloat(value) || 0;
  let count = 0;
  for (const slab of slabs) {
    const rules = slab.querySelector('.slab-live-rules'), paper = slab.querySelector('.slab-live-paper');
    const title = slab.querySelector('.slab-live-title'), view = slab.ownerDocument?.defaultView;
    if (!rules || !paper || !title || !view || slab.clientWidth <= 0 || paper.clientHeight <= 0) continue;
    const cardWidth = number(view.getComputedStyle(slab).width) || slab.clientWidth;
    const size = `${cardWidth / 10}px`;
    rules.style.fontSize = size;
    rules.style.setProperty('--slab-rules-size', size);
    slab.style.setProperty('--slab-rules-size', size);
    const style = view.getComputedStyle(paper), titleStyle = view.getComputedStyle(title);
    const available = paper.clientHeight - number(style.paddingTop) - number(style.paddingBottom)
      - title.offsetHeight - number(titleStyle.marginTop) - number(titleStyle.marginBottom) - number(style.rowGap);
    const height = [...rules.children].reduce((sum, element) => sum + element.offsetHeight, 0);
    rules.dataset.rulesFit = String(height <= available + 1 && rules.scrollWidth <= rules.clientWidth + 1);
    rules.dataset.fontScale = 'uniform';
    count += 1;
  }
  return count;
}
