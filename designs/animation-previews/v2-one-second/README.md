# Wizzy one-second combat animation review

This pack is for review before the new animation sheets are wired into battles.
The live game uses the updated Enhancement dice rules, while its current
animation sheets and playback stay unchanged.

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

The full sixteen-frame preview lasts two seconds. The player adds a half-second
ready pause between full-sequence previews. Its loop-only mode repeats just the
one-second held effect. Aura's one-second ring loop is intended to repeat while
Aura is active, through three subsequent owner turns; activation does not count.
Its fizzle phase belongs at expiry, rather than after one second in a battle.

Original generated PNGs remain unchanged. `manifest.json` records dimensions,
frame sequences, SHA-256 hashes, and source-pixel preview offsets that align
poses without editing the source sheets. Enhancement offsets preserve its
airborne peak and grounded landing; Aura offsets hold the ring center steady.
Projectile previews show in-place particles; their arena travel paths are a
separate part of later integration. Hit reactions use a gentle red glow rather
than a rapid strobe.

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
