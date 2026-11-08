// Display copy only. Combat and the full inspection text continue to use the
// canonical spell catalog. Threshold lines add to the base unless they say
// "instead"; Ember spending is chosen before the roll by the battle flow.
const line = text => ({ text });
const at = (threshold, text) => ({ threshold, text });

export const COMPACT_SPELL_TEXT = Object.freeze(Object.fromEntries(Object.entries({
  'Fire-0': [line('Gain 1 Ember.')],
  'Fire-1': [line('Deal 6 damage.'), at('7+', 'Gain 1 Ember.'), at('10+', 'Gain 2 Embers instead.')],
  'Fire-2': [line('Gain 1 Ember.'), at('7+', 'Gain 2 Embers instead.'), at('10+', 'Gain 3 Embers instead.')],
  'Fire-3': [line('Gain 12 Shield.'), at('7+', 'Gain 1 Ember.'), at('10+', 'Gain 2 Embers instead.')],
  'Fire-4': [line('Deal 5 damage. Gain 1 Ember.'), at('8+', 'Gain +2 to your next roll.'), at('11+', 'Gain +4 instead.')],
  'Fire-5': [line('Deal 10 damage.'), line('May spend 1 Ember for +8 damage.'), at('9+', 'Remove up to 8 Shield first.')],
  'Fire-6': [line('Deal 22 damage.'), at('7+', 'Deal 28 instead.'), at('10+', 'Deal 36 instead.')],
  'Fire-7': [line('Spend all Embers.'), line('Deal 15 + 7 per Ember spent.'), at('9+', 'Deal 15 + 10 per Ember instead.')],
  'Fire-8': [line('Deal 10 damage. Gain 1 Ember.'), at('8+', 'Deal 4 extra damage.')],
  'Fire-9': [line('Gain 2 Embers.'), at('7+', 'Gain 3 instead.'), line('Then, if 4+ Embers: gain 8 Shield.')],
  'Fire-10': [line('Gain 16 Shield and 1 Ember.'), at('8+', 'Gain 8 extra Shield.')],
  'Fire-11': [line('Deal 8 damage. Gain 2 Embers.'), at('7+', 'Gain +2 to your next roll.'), at('10+', 'Gain +4 instead.')],
  'Fire-12': [line('Deal 14 damage.'), line('Spend 0–2 Embers: +8 damage each.'), at('7+', 'Remove up to 10 Shield first.')],
  'Fire-13': [line('Deal 30 damage.'), at('7+', 'Deal 38 instead.'), at('10+', 'Deal 45 instead.')],
  'Fire-14': [line('Spend all Embers.'), line('Deal 20 + 9 per Ember spent.'), at('8+', 'Deal 20 + 12 per Ember instead.')],
  'Water-1': [line('Deal 6 damage.'), at('7+', 'Deal 3 extra damage.')],
  'Water-2': [line('Deal 4 + 2 × Flow damage.'), at('8+', 'Gain 1 extra Flow after resolution.')],
  'Water-3': [line('Gain 10 Shield.'), at('7+', 'Heal 5 HP.'), at('10+', 'Heal 10 HP instead.')],
  'Water-4': [line('Deal 5 + Flow damage.'), at('7+', 'Gain +2 to your next roll.'), at('10+', 'Gain 1 extra Flow after resolution.')],
  'Water-5': [line('Deal 8 + 2 × Flow damage.'), at('9+', 'Heal HP equal to your Flow.')],
  'Water-6': [line('Deal 15 + 3 × Flow damage.'), at('9+', 'Deal 8 extra damage.')],
  'Water-7': [line('Deal 12 + 5 × Flow damage.'), at('9+', 'Deal 10 extra damage.')],
  'Water-8': [line('Deal 9 + Flow damage.'), at('7+', 'Deal 4 extra damage.')],
  'Water-9': [line('Deal 6 + 2 × Flow damage.'), line('Gain 1 extra Flow after resolution.'), at('10+', 'Deal 5 extra damage.')],
  'Water-10': [line('Gain 14 Shield. Heal 5 HP.'), at('7+', 'Heal 2 extra HP per Flow.')],
  'Water-11': [line('Deal 8 + Flow damage.'), line('Gain +2 to your next roll.'), at('7+', 'Gain 1 extra Flow after resolution.')],
  'Water-12': [line('Deal 12 + 2 × Flow damage.'), at('7+', 'Heal 2 HP per Flow.')],
  'Water-13': [line('Deal 20 + 3 × Flow damage.'), at('7+', 'Deal 10 extra damage.')],
  'Water-14': [line('Deal 15 + 5 × Flow damage.'), at('8+', 'Deal 12 extra damage.')],
  'FAT-001': [line('+4 to the Modified Roll.'), line('Use while attacking.')],
  'FAT-002': [line('−4 to the Modified Roll.'), line('Use while defending.')],
  'FAT-003': [line('Choose +2 or −2 to the Modified Roll.')],
}).map(([id, lines]) => [id, Object.freeze(lines.map(value => Object.freeze(value)))])));

const escapeSlabText = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const compactLines = spellId => Object.hasOwn(COMPACT_SPELL_TEXT, spellId) ? COMPACT_SPELL_TEXT[spellId] : [];

/** HTML lines for the live parchment layer in every slab view. */
export function slabRulesMarkup(spellId) {
  return compactLines(spellId).map(({ threshold, text }) =>
    `<span class="slab-rule-line">${threshold ? `<strong class="slab-rule-threshold">${escapeSlabText(threshold)}</strong> ` : ''}${escapeSlabText(text)}</span>`,
  ).join(' ');
}

/** Compact plain text for labels or callers that cannot display the HTML. */
export function slabRulesText(spellId) {
  return compactLines(spellId).map(({ threshold, text }) => `${threshold ? `${threshold} ` : ''}${text}`).join(' ');
}
