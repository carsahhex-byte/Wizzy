import { ASSETS } from './assets.f381bee169ea.js';

// CSS viewports select the approved artwork without changing a source pixel.
// Both states share a crop, so the tower/tray and their blank plaques stay put.
export const BATTLE_PILE_CROPS = Object.freeze({
  tower: Object.freeze({ x: 100, y: 24, w: 440, h: 590, width: 1254, height: 1254 }),
  discard: Object.freeze({ x: 659, y: 200, w: 520, h: 414, width: 1254, height: 1254 }),
});

/** Artwork plus real count text; the existing parent owns its click action. */
export function battlePileMarkup(kind, count) {
  const crop = BATTLE_PILE_CROPS[kind];
  if (!crop) throw new RangeError('Choose the Spell Tower or Discard Pile.');
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Pile count must be a nonnegative integer.');
  const title = kind === 'tower' ? 'Spell Tower' : 'Discard Pile';
  const testId = kind === 'tower' ? 'deck-count' : 'discard-count';
  const normalY = -crop.y / crop.h * 100;
  const hoverY = -(crop.y + 627) / crop.h * 100;
  return `<span class="battle-pile-art battle-pile-${kind}" aria-hidden="true" style="--pile-ratio:${crop.w}/${crop.h};--pile-normal-y:${normalY}%;--pile-hover-y:${hoverY}%"><img src="${ASSETS.battlePileProps}" alt="" draggable="false" style="width:${crop.width / crop.w * 100}%;height:${crop.height / crop.h * 100}%;left:${-crop.x / crop.w * 100}%" /></span><span class="battle-pile-title battle-pile-title-${kind}">${title}</span><strong class="battle-pile-count battle-pile-count-${kind}" data-testid="${testId}" aria-label="${count} ${count === 1 ? 'slab' : 'slabs'}">${count}</strong>`;
}
