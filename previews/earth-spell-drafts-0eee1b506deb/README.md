# Earth spellbook and artwork drafts

This is an art and card-list review. It creates no playable cards and changes
no live combat rules, decks, saves or artwork.

| Card | Mana | Proposed effect |
| --- | ---: | --- |
| Earth-1 | 0 | Deal 5 damage and gain 5 Shield. On 7+, gain 5 additional Shield, for 10 total. |
| Earth-2 | 2 | Gain 10 Shield. On 6+, gain 1 Mana. |
| Earth-3 | 3 | Deal 5 damage. On 9+, gain 20 Shield. |
| Earth-4 | 5 | Gain 2 Mana. Protect an already-active Golem through the next Earth turn, even below 20 Shield; check Shield normally at that next turn’s end. |
| Earth-5 | 5 | If your Golem is active, deal 15 damage. |

## Updated Golem proposal

- Transform at Shield 20 or higher.
- Shield dropping below 20 during a turn does not immediately revert the Golem.
- At Earth’s own end turn, expire Earth-4 protection if this is the next Earth
  turn after the cast, then check Shield unless protection is still active.
- Without protection, Shield 19 or lower reverts the Golem before damage; it
  deals no automatic damage on that end turn.
- If Golem form remains active, deal 15 damage to the opponent.
- The previous +10 spell-damage bonus is removed.
- Earth-4 extends an already-active Golem; it does not create Golem form itself.

`spellbook.json` records the exact draft wording, expiry and end-turn order.
The illustrations have no embedded names, costs or rules; text stays editable.

Extract the ZIP and open `index.html`, keeping the `art` folder beside it. The
page uses local images and classic scripts, so no installation, account or
internet connection is needed. Original PNG bytes are copied unchanged.

To regenerate this isolated review after the five art PNGs are present:

```sh
node scripts/package-earth-spell-drafts.js /workspace/artifacts/Earth-Spell-Drafts
```
