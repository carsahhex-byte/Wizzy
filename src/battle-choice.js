/**
 * Decide how a pointer choice interacts with an uncommitted battle choice.
 *
 * Call this during capture, using the original composed event path. The caller
 * maps a card to `card`, blank space to `background`, the named controls below
 * to their IDs, and every other control to `other`.
 *
 * `cancel-and-continue` means cancel first, then perform the original intent
 * against the resulting state. Preserve that intent across any board rerender
 * or awaited online cancellation; never dispatch it against the old turn mode.
 * `cancel` clears only the staged choice. `keep` leaves normal handling intact.
 */
export function classifyBattleChoice(state, targetAction) {
  if (state?.status !== 'playing') return 'keep';
  const phase = state.phase;
  const selected = state.selectedCardId != null
    || phase === 'fate' && state.selectedFateCardIds?.length > 0;
  if (!['end', 'refresh'].includes(phase)
    && (!['main', 'fate'].includes(phase) || !selected)) return 'keep';

  if (targetAction === 'background' || targetAction === 'cancel-refresh') return 'cancel';
  if (phase === 'end') {
    // A repeated End Turn passes; the blue Hand Refresh opens its card checks.
    return ['end-turn', 'hand-refresh'].includes(targetAction) ? 'keep' : 'cancel-and-continue';
  }
  if (phase === 'refresh') {
    // Only the red confirmation commits a refresh. End Turn is a new choice:
    // cancel to main first, then let that click open its own End Turn drawer.
    return ['card', 'hand-refresh'].includes(targetAction) ? 'keep' : 'cancel-and-continue';
  }
  const related = phase === 'fate'
    ? ['card', 'cast-spell', 'skip-fate', 'inspect-selected', 'twist']
    : ['card', 'cast-spell', 'inspect-selected', 'end-turn'];
  return related.includes(targetAction) ? 'keep' : 'cancel-and-continue';
}
