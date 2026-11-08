# Wizzy approved one-second combat animations

This approved pack is integrated into live battles. The separate gallery and
ZIP remain references for the same source artwork and frame timing. Combat
values, spell IDs, Enhancement tiers, decks and save compatibility are unchanged.
Live targets use the original quick hit response; the longer v2 hit-reaction
sheet remains approved reference artwork and is not currently played in battles.

There are ten transparent PNG sheets: Enhancement jump, Aura spiral, basic
attack, simple cast, large cast, elemental shield, power-up, basic projectiles,
large projectiles and hit reactions. Every two-element sheet has four columns
and eight rows: sixteen Fire frames followed by sixteen Water frames. Aura has
four columns and four rows for its shared green ground-ring effect.

Each sixteen-frame sequence uses these relative frame numbers:

| Frames (zero-based) | Phase | Timing |
| --- | --- | --- |
| 0–3 | Windup / forming | 4 × 125 ms = 500 ms |
| 4–11 | Eight moving particle / held-effect frames | 8 × 125 ms = 1,000 ms |
| 12–15 | Release, landing, impact or fizzle | 4 × 125 ms = 500 ms |

The full sixteen-frame preview lasts two seconds. The gallery player adds a
half-second ready pause between full-sequence previews; its loop-only mode
repeats just the one-second held effect. Battle playback combines these phases:

| Battle effect | Live timing |
| --- | --- |
| Damaging primary | Caster windup 0–500 ms, charge 500–1,500 ms, recovery to 2,000 ms. Projectile releases at 1,500 ms and flies for one second; impact at 2,500 ms begins the original quick target response, ending at 2,840 ms. |
| Shield / power-up | Two-second sequence, results shown at 500 ms. |
| Successful Enhancement | Two-second jump, award shown at 500 ms. Failed rolls show MISS with no animation. |
| Aura activation | 500 ms formation plus one full second of moving particles; controls unlock at 1,500 ms, then the ring keeps looping underfoot. |
| Aura expiry | 500 ms fizzle when its owner's third subsequent turn ends; activation does not count. |

Basic/simple/large damage tiers retain the existing Mana mapping. Animations
start after any Fate chain ends, and Fate has no animation. Projectile paths
are added by battle playback while their sheet anchors stay fixed. The live
target keeps its standing pose with a 210 ms red flash and four 85 ms legacy
impact frames, a 340 ms window. The gallery still previews the unchanged
two-second v2 reaction sequence as a reference. An active Aura
loop is restored on reconnect without replaying formation; reduced motion
uses a static ring and immediately completes action visuals.

Original generated PNGs remain unchanged. `manifest.json` records dimensions,
frame sequences, SHA-256 hashes, and source-pixel preview offsets that align
poses without editing the source sheets. Enhancement offsets preserve its
airborne peak and grounded landing; Aura offsets hold the ring center steady.
The engine resolves and saves each action once. Displayed spell results wait
for impact, while committed costs are paid normally. HP bars ease over 800 ms,
and battle actions and victory wait for the presentation to finish. Reloading
or resuming does not replay completed actions. Victory also waits until the
losing HP bar reaches zero, even after the quick hit has finished.

Open `index.html` to play the previews, view/download each full PNG, or download
the ZIP. The ZIP contains all ten PNGs, this README, the timing/alignment
manifest and the preview player. To rebuild the delivery folder from source:

```sh
node scripts/package-animation-review.js dist/previews/combat-linger-v2
```

Enhancement rules: raw 2d6 below 6 gains nothing; 6–8 adds 10 percentage points;
9–11 adds 20; 12+ adds 30. Use the highest qualifying award and add it to stored
Enhancement, capped at 30% total. Current Mana cost, primary-action use, Loaded,
Fate, damage application and consumption rules remain as before.
