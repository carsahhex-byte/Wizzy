# Current spellbook and custom decks

The game exposes one active spellbook containing **13 unique slabs: five Fire, five Water and three Fate**. The former Spellbook 1 selector is removed. The former testing collection is now the current collection, with Fire-6 replacing Fire-5. Stable internal IDs retain saved-file and artwork references; the following names appear on live cards, deck lists, inspections and new combat logs.

Mana costs, printed effects and artwork are unchanged. **The proposed persistent 5%-per-Ember bonus is not implemented.** Existing Ember spending, Water Flow, Fate timing, Enhancement and Aura continue to follow the current battle rules.

## Active cards

| Internal ID | Name | Mana | Effect |
| --- | --- | ---: | --- |
| Fire-2 | Heatbox | 1 | Gain 1 Ember. On 7+, gain 2 instead. On 10+, gain 3 instead. |
| Fire-15 | Blaze | 0 | Gain 1 Ember. On 7+, gain 1 Mana. |
| Fire-6 | Charred Blade | 5 | Deal 22 damage. On 7+, deal 28 instead. On 10+, deal 36 instead. |
| Fire-11 | Xineoph | 2 | Deal 10 damage and gain 2 Embers. On 7+, gain 1 Mana. |
| Fire-14 | Sunsetter | 8 | Spend all Embers. Deal 20 + 7 per Ember spent. On 8+, use 9 per Ember instead. |
| Water-2 | Sea bolt | 1 | Deal 4 + 2 × Flow damage. On 8+, gain 1 additional Flow after resolution. |
| Water-0 | Swell | 0 | Gain 1 Mana on cast. On 7+, gain 1 additional Flow after resolution. |
| Water-12 | Coral Crash | 3 | Deal 12 + 2 × Flow damage. On 7+, heal 2 HP per Flow. |
| Water-9 | Pacific | 2 | Deal 6 + 2 × Flow damage. Gain 1 additional Flow after resolution. On 10+, deal 5 additional damage. |
| Water-14 | Poseidon's Rift | 8 | Deal 15 + 5 × Flow damage. On 8+, deal 12 additional damage. |
| FAT-001 | Fortune | 0 | +4 to the Modified Roll when attacking. |
| FAT-002 | Misfortune | 0 | −4 to the Modified Roll when defending. |
| FAT-003 | Twist | 0 | Choose +2 or −2 to the Modified Roll. |

The spellbook's original source is **Wizzy Master Spellbook Nov4.pdf**, Master Spellbook V2.1. User-approved cost, effect and name changes take precedence over that source. Historical definitions remain internally available for validating archived data; they are not an additional playable collection.

## Deck roles

| Role | Fire | Water |
| --- | --- | --- |
| Elemental development | Heatbox builds Embers. | Sea bolt attacks and helps build Flow. |
| Mana and elemental setup | Blaze builds an Ember and can gain Mana on 7+. | Swell gains Mana on cast and builds Flow. |
| Heavy / specialized attack | Charred Blade provides heavy damage without spending Embers. | Coral Crash combines damage with conditional healing. |
| Attack while building | Xineoph attacks, gains Embers and can recover Mana. | Pacific attacks and gains two total Flow, subject to the cap. |
| Finisher | Sunsetter spends all Embers for a large attack. | Poseidon's Rift uses established Flow and keeps it afterward. |

## Build, save and transfer a deck

Open **Deck**, choose Fire or Water, and add slabs from the current collection. The selected list occupies the upper panel; the lower collection keeps four cards per row. Filters cover All, Fire, Water, Fate and **In Deck**.

A playable deck has **1–30 total slabs**, with **unlimited copies per spell**, using one main element plus Fate. Fire and Water cannot be mixed. There are no Neutral spells or mandatory category quotas. Empty drafts remain editable but are not playable.

**Save deck** stores the legal composition; **Save & battle** saves it before starting a battle. Shared-screen play requires saved Fire and Water decks. Each two-screen player needs the saved deck for their own role. Account saves sync through the game server; drafts remain on the device. Saving a composition never changes an ongoing duel.

**Download deck** exports a legal nonempty deck. **Upload deck** loads a draft for review; press Save deck to use it. The file limit is 64 KB. Files keep stable IDs, rather than depending on display names:

```json
{
  "format": "wizzy-deck",
  "version": 1,
  "spellbook": "nov4-v2.1",
  "element": "fire",
  "spellbookId": "spellbook-2",
  "entries": [
    { "spellId": "Fire-11", "quantity": 3 }
  ]
}
```

This example contains three Xineoph slabs. The compatibility family remains `nov4-v2.1`, and the current active collection retains its existing `spellbook-2` storage identity.

## Earlier decks and saves

Existing current-collection decks are preferred. Fire-5 quantities in earlier testing decks are replaced with Fire-6 quantities for Charred Blade, with the change presented for review. A legacy original-collection deck can be reviewed against the current pool. Retired cards are identified, and the original data is preserved; they are not silently reinterpreted as unrelated new spells. Review and save the resulting draft before battle. Malformed files, unknown IDs, mixed elements and invalid quantities are rejected.

Old guest and account deck data remains backed up. The old collection is not exposed as an editable or playable second spellbook. Device storage remains scoped to the browser and website origin; moving to another origin requires a deck export/import or account sync.

Compatible saved duels refresh exact old card names without refunding paid Mana, repeating effects, or rewriting completed historical results. Old log entries can retain their historical names; animation lookup recognizes both the former ID names and current names. A former testing duel containing Fire-5 is archived rather than turning an already-committed Fire-5 into Charred Blade. Start a new duel with the reviewed deck in that case.

## Combat and presentation

A duel starts with **100 HP, 3 Mana, 0 Shield, 0 elemental resources and +0 Loaded**. Mana caps at 10, Shield at 30, and Embers/Flow at 5. Both players start with up to five slabs; the second player draws one more at the beginning of their first turn if available. Later draws and hand refreshes fill to six while the tower has slabs. Later owner turns gain two Mana.

Each turn permits one main action: a primary slab, Enhancement or Aura. Threshold spells roll before defender-first Fate responses; responders alternate one Fate at a time until two consecutive or automatic passes. Only the final Modified Roll determines the spell result. Self-damage bypasses the caster's Shield. Elemental gains occur during resolution; Water receives its normal one-Flow passive after each Water spell, plus any explicitly additional Flow.

Enhancement costs 0 Mana and uses the main action. After its Fate chain, 6–8 grants 10 percentage points, 9–11 grants 20, and 12+ grants 30, capped at 30% stored total. It is consumed by the next outgoing damaging primary spell. Loaded does not modify Enhancement rolls. Aura costs 1 Mana and uses the main action; it grants 10% damage for three subsequent owner turns, excluding the activation turn. Enhancement and Aura add together, round once before Shield with halves up, and do not amplify resources, healing, Shield or self-damage.

Current cards keep supplied artwork, centered compact rules, bold thresholds and the yellow upper-left Mana cost. Shared source PNG sheets and crop IDs retain their filenames because each sheet contains multiple slabs; display-name metadata organizes the new names without duplicating or altering artwork. Charred Blade is a 5-Mana simple cast; Xineoph, Sea bolt, Coral Crash and Pacific use the basic attack; Sunsetter and Poseidon's Rift use large casts. Heatbox, Blaze and Swell use power-ups. Fate has no animation. Results appear at impact, and reloading never replays completed actions.

The canonical metadata is in `src/spells.js`; active-pool membership is in `src/spellbooks.js`; `src/effects.js` implements effects; `src/game.js` owns combat timing; and `src/decks.js` validates and reviews compositions.
