/** Schools are independent of battle seats and the numeric elemental resource. */
export const ELEMENTS = Object.freeze(['fire', 'water', 'earth']);
export const PLAYABLE_ELEMENTS = ELEMENTS;
export const ELEMENT_INFO = Object.freeze({
  fire: Object.freeze({ name: 'Fire', resource: 'Embers' }),
  water: Object.freeze({ name: 'Water', resource: 'Flow' }),
  earth: Object.freeze({ name: 'Earth', resource: 'Golem' }),
});

export const isElement = value => ELEMENTS.includes(value);

/** The fallbacks keep older Fire/Water states and private network views usable. */
export function getPlayerSchool(player) {
  return player?.school ?? player?.deckDefinition?.element ?? (isElement(player?.id) ? player.id : null);
}
