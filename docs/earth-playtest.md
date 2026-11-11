# Earth playtest

Earth is available alongside Fire and Water in the shared-screen battle chooser and deck workshop. The active collection contains 18 slabs: five for each element and three shared Fate slabs. Air is not playable in this release.

## Build and start a battle

1. Open **Deck**, choose **Earth**, and add Earth slabs and any Fate slabs. Save the deck before leaving the workshop.
2. Decks contain **1–30 slabs**, with no per-spell copy limit. Each element keeps its own saved deck; choosing Earth does not replace a saved Fire or Water deck.
3. Open **Battle**, choose the shared-screen option, then select each player's element independently. Both players may choose the same element and use separate copies of that saved composition.
4. Start the battle and roll for initiative. Each player receives up to five opening slabs. The second player draws one additional slab when their first turn starts if the tower has one. Later draws and hand refreshes fill to six while cards remain.

Starting stats remain **100 HP, 3 Mana and 0 Shield**. Mana caps at **10**, Shield at **30**. Later own turns gain two Mana. Each turn allows one primary spell, Enhancement attempt or Aura activation. Fate responses retain the existing post-roll chain.

## Earth slabs

| Slab | Mana | Effect |
| --- | ---: | --- |
| Earth-1 | 0 | Deal 5 damage and gain 5 Shield. On 7+, gain 5 additional Shield. |
| Earth-2 | 2 | Gain 10 Shield. On 6+, gain 1 Mana. |
| Earth-3 | 3 | Deal 5 damage. On 9+, gain 20 Shield. |
| Earth-4 | 5 | Gain 2 Mana. If Golem is already active, protect it through your next turn. Check Shield normally at the end of that turn. |
| Earth-5 | 5 | If Golem is active, deal 15 damage. |

Earth-1, Earth-2 and Earth-3 roll before Fate. Earth-4 and Earth-5 resolve without dice or a Fate window. Earth-5 still pays its cost and uses the primary action when no Golem is active, but deals no damage. Read Slab shows the complete wording; Earth-4's shorter card copy is a space-saving summary.

## Golem timing

Shield gain reaching **20 or more** transforms the Earth wizard into Golem. Losing Shield afterward does not immediately remove that form. At the end of Earth's own turn:

- An unprotected Golem below 20 Shield reverts before attacking.
- An active Golem that remains deals a fixed **15 damage** to the opponent, using Shield before HP.
- Enhancement and Aura do not increase or get consumed by this automatic hit. Golem does not add a flat damage bonus to primary spells.

Earth-4 protects an already-active Golem through the current turn's ending check and the following own turn. At the end of that following turn, protection expires and the normal Shield check applies. With 19 Shield, it reverts without dealing a second end-turn hit. With at least 20 Shield, it remains active normally.

The **Form** stat shows Wizard or Golem; **Ward** indicates Earth-4 protection. Earth uses this form display rather than an Ember or Flow counter.

## What to verify while playing

- Save an Earth deck, reload, and confirm its composition and the existing Fire and Water decks remain available. Try one slab, thirty copies of one slab, and a deck containing all five Earth spells plus Fate.
- Choose Earth against Fire, Earth against Water and Earth against Earth. Repeat with Earth on the right. Both stat frames and wizard models should match their selected seats and face inward.
- Inspect all five Earth slabs. Their green frames, upper illustration windows and beige text areas should fit on a phone; costs should read 0, 2, 3, 5 and 5.
- Build from 10 to 20 Shield with Earth-2. Shield should update at the spell's impact, followed by the Golem transformation; the old wizard model stays visible until that transformation completes.
- End a turn with an active Golem at 20 Shield. Against 5 opposing Shield, its automatic hit should remove that Shield and lower HP by 10.
- Repeat with 19 Shield and no Ward. It should revert without an automatic hit.
- Cast Earth-4 while a Golem has 19 Shield. The current ending hit should occur, protection should survive the opponent's turn, and the next own ending check should revert without another hit if Shield is still 19.
- During an automatic Golem strike, the ending player's hand should remain displayed. The handoff dialog should appear after the strike and gradual HP-bar movement both finish.

Shared-screen tests use this device's saved decks. Two-screen testing also requires the updated multiplayer server using combat rules `earth-golem-v1`; restart an older server and create a new room before testing Earth.
