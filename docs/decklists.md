# Current spellbook and custom decks

The game exposes one active spellbook containing **18 unique slabs: five Fire, five Water, five Earth and three Fate**. The former Spellbook 1 selector is removed. The former testing collection is now the current collection, with Fire-6 replacing Fire-5. Stable internal IDs retain saved-file and artwork references; the following names appear on live cards, deck lists, inspections and new combat logs.

Stable IDs are retained; Poseidon's Rift now costs 6 Mana. **Each held Ember grants +5% outgoing Fire damage, up to +25%, and the held bank is consumed by the next damaging Fire spell before that spell grants new Embers.** Embers have no turn or round expiry. Charred Blade, Sunsetter and Blaze use the revised effects below. Xineoph and Pacific use dedicated phoenix and dolphin animations; all fifteen active elemental illustrations now use the approved Earth-style artwork, including chunky Xineoph, ocean-wave Swell and arrow-shaped Sea bolt. Water Flow, Fate timing, Enhancement and Aura retain their existing rules.

## Active cards

| Internal ID | Name | Mana | Effect |
| --- | --- | ---: | --- |
| Fire-2 | Heatbox | 1 | Gain 1 Ember. On 7+, gain 2 instead. On 10+, gain 3 instead. |
| Fire-15 | Blaze | 0 | Gain 1 Ember. On 6+, gain 1 Mana. |
| Fire-6 | Charred Blade | 5 | Deal 20 damage. On 7+, deal 30 instead and gain 2 Embers. |
| Fire-11 | Xineoph | 2 | Deal 10 damage and gain 2 Embers. On 7+, gain 1 Mana. |
| Fire-14 | Sunsetter | 8 | Deal 55 damage. On 8+, deal 65 instead. |
| Water-2 | Sea bolt | 1 | Deal 4 + 2 × Flow damage. On 8+, gain 1 additional Flow after resolution. |
| Water-0 | Swell | 0 | Gain 1 Mana on cast. On 7+, gain 1 additional Flow after resolution. |
| Water-12 | Carbonate | 3 | Deal 12 + 2 × Flow damage. On 7+, heal 2 HP per Flow. |
| Water-9 | Pacific | 2 | Deal 6 + 2 × Flow damage. Gain 1 additional Flow after resolution. On 10+, deal 5 additional damage. |
| Water-14 | Poseidon's Rift | 6 | Deal 15 + 5 × Flow damage. On 8+, deal 12 additional damage. |
| Earth-1 | OffoDefo | 0 | Deal 5 damage and gain 5 Shield. On 7+, gain 5 additional Shield. |
| Earth-2 | Bengal Shield | 2 | Gain 10 Shield. On 6+, gain 1 Mana. |
| Earth-3 | Earthbound | 2 | Deal 5 damage. On 7+, gain 12 Shield. |
| Earth-4 | Merciful | 4 | Gain 3 Shield. On 6+, incoming damage during the next opposing turn bypasses your Shield and hits your HP. |
| Earth-5 | Tectonic | 5 | If Golem is active, deal 15 damage. |
| FAT-001 | Fortune | 0 | +4 to the Modified Roll when attacking. |
| FAT-002 | Misfortune | 0 | −4 to the Modified Roll when defending. |
| FAT-003 | Twist | 0 | Choose +2 or −2 to the Modified Roll. |

The spellbook's original source is **Wizzy Master Spellbook Nov4.pdf**, Master Spellbook V2.1. User-approved cost, effect and name changes take precedence over that source. Historical definitions remain internally available for validating archived data; they are not an additional playable collection.

## Deck roles

| Role | Fire | Water |
| --- | --- | --- |
| Elemental development | Heatbox builds Embers. | Sea bolt attacks and helps build Flow. |
| Mana and elemental setup | Blaze builds an Ember and can gain Mana on 6+. | Swell gains Mana on cast and builds Flow. |
| Heavy / specialized attack | Charred Blade attacks and rebuilds 2 Embers on 7+. | Carbonate combines damage with conditional healing. |
| Attack while building | Xineoph attacks, gains Embers and can recover Mana. | Pacific attacks and gains two total Flow, subject to the cap. |
| Finisher | Sunsetter delivers a large base attack boosted by held Embers. | Poseidon's Rift uses established Flow and keeps it afterward. |

## Build, save and transfer a deck

Open **Deck**, choose Fire, Water or Earth, and add slabs from the current collection. The selected list occupies the upper panel; the lower collection keeps four cards per row. Filters cover All, Fire, Water, Earth, Fate and **In Deck**.

A playable deck has **1–30 total slabs**, with **unlimited copies per spell**, using one main element plus Fate. Different main elements cannot be mixed. There are no Neutral spells or mandatory category quotas. Empty drafts remain editable but are not playable.

**Save deck** stores the legal composition; **Save & battle** saves it before starting a battle. Shared-screen play opens a wizard chooser for Player 1 and Player 2; each can select Fire, Water or Earth, including mirrors. Only the selected decks need to be saved. Each two-screen player independently selects a school and uses their saved deck for that school. Account saves sync through the game server; drafts remain on the device. Saving a composition never changes an ongoing duel.

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

Compatible saved duels refresh exact old card names without refunding paid Mana, repeating effects, or rewriting completed historical results. Old log entries can retain their historical names; animation lookup recognizes both the former ID names, Coral Crash and current names. A former testing duel containing Fire-5 is archived rather than turning an already-committed Fire-5 into Charred Blade. Start a new duel with the reviewed deck in that case.

## Combat and presentation

A duel starts with **100 HP, 3 Mana, 0 Shield, 0 elemental resources and +0 Loaded**. Mana caps at 10, Shield at 30, and Embers/Flow at 5. Both players start with up to five slabs; the second player draws one more at the beginning of their first turn if available. Later draws and hand refreshes fill to six while the tower has slabs. Later owner turns gain two Mana.

Each turn permits one main action: a primary slab, Enhancement or Aura. Threshold spells roll before defender-first Fate responses; responders alternate one Fate at a time until two consecutive or automatic passes. Only the final Modified Roll determines the spell result. Self-damage bypasses the caster's Shield. Elemental gains occur during resolution; Water receives its normal one-Flow passive after each Water spell, plus any explicitly additional Flow.

Enhancement costs 0 Mana and uses the main action. After its Fate chain, 6–8 grants 10 percentage points, 9–11 grants 20, and 12+ grants 30, capped at 30% stored total. It is consumed by the next outgoing damaging primary spell. Loaded does not modify Enhancement rolls. Aura costs 1 Mana and uses the main action; it grants 10% damage for three subsequent owner turns, excluding the activation turn. Enhancement and Aura add together. Fire adds its held Ember percentage to those bonuses, reaching at most 65%; Water uses only Enhancement and Aura, at most 40%. Round once before Shield, halves up. These percentages do not amplify resources, healing, Shield or self-damage.

**Ember timing:** keep Embers until the next outgoing damaging Fire spell resolves; end of turn, non-damaging spells, Water damage and self-damage do not remove them. Damage snapshots the held bank, consumes it even if Shield absorbs the whole hit, then applies printed new Ember gains. Xineoph at 3 Embers deals 12 from its 10 base, then ends at 2 Embers. Charred Blade on 7+ with 5 Embers deals 38 from its 30 base (37.5 rounded up), then ends at 2 Embers. Below 7, it deals 20 base and grants no new Embers.

**Sunsetter:** no Ember-spending cost at cast. It deals 55 base damage, or 65 on 8+. Five held Embers boost the 8+ hit to 81; adding 30% Enhancement and 10% Aura reaches 107. Its held Embers are consumed on damage and it grants no new Embers.

Old completed damage and paid outcomes remain historical; loading a save does not recompute or replay them. Pending casts resolve once under the current rule with paid Mana retained. A pending old Sunsetter restores its previously reserved Embers exactly once before the revised damage consumes them; completed old results receive no refund or recalculation.

Current cards keep their existing frames, compact rules, bold thresholds and yellow upper-left Mana cost. All thirteen active elemental spells other than Xineoph and Pacific now use their approved individual effect atlases. The original PNGs remain unchanged. Conditional Mana, Shield, Ember, Flow and healing flourishes use the final Modified Roll; they do not change the resolved rules. Earth spells work in Wizard and Golem forms and from either seat. Tectonic without an active Golem shows a fizzle and no hit.

Fortune, Misfortune and Twist briefly rise, pulse and fade above the already-rolled dice after each actual Fate cast. This 600 ms feedback finishes before a shared-screen Fate handoff or a primary resolution. Skipping Fate has no effect animation, and reconnecting does not replay completed responses. Merciful's qualifying stone fragments loop around Earth until the end of the opponent's next turn, then fade; opening or canceling End Turn does not expire them. The separate Aura ring remains independent.

Xineoph and Pacific use separate transparent creature atlases. Each charges for 500 ms, then loops eight pulse frames twice at 62.5 ms per frame during the 500–1500 ms hold, with fixed feet. Two formation frames start at 1.5 and 1.6 seconds and last 100 ms each. Three wing or tail poses begin at 1.7, 1.825 and 1.95 seconds; flame or wave arcs appear on the third pose, without the former straight light blades. Flight starts at 2.075 seconds and lasts 900 ms. Two faint afterimages follow by 45 and 90 ms during flight only, including mirrored travel, and clear before impact, on cancellation and at completion. Fire normally travels left to right and Water right to left. One combined impact occurs at 2.975 seconds; the defender's red flash lasts 210 ms, and the 340 ms impact window ends at 3.315 seconds. The arena and standing wizards remain the existing scene, with no duplicate full-scene overlay. Card art, costs, printed effects, Ember consumption, Flow gains and Fate timing do not change.

The canonical metadata is in `src/spells.js`; active-pool membership is in `src/spellbooks.js`; `src/effects.js` implements effects; `src/game.js` owns combat timing; and `src/decks.js` validates and reviews compositions.

## Golem timing

Earth transforms at 20 Shield. Shield loss does not immediately revert it. On the final committed Earth turn pass, check Shield: a Golem at 19 or lower reverts before damage unless it retains a protection timer from an earlier saved duel. If still active, deal a flat 15 damage through normal Shield; Aura and Enhancement do not change it, and Enhancement is preserved. Earth-5 is a separate damaging spell, so its cast can be followed by the passive strike. Earth-4 rolls before Fate, always gains 3 Shield, and on a final 6+ sends all incoming damage during the next opposing turn straight to its caster’s HP while preserving Shield. This lasts through the opposing turn’s end effects and does not create or extend Golem protection. Previously earned protection timers in saved duels keep their existing expiry.
