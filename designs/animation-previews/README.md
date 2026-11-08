# Approved combat animation artwork

The approved live combat set is in [v2-one-second](v2-one-second/README.md):
ten sheets with eight distinct held-effect frames per sequence, played at
125 ms each for a full one-second linger. The package includes Enhancement,
Aura, casts, attacks, shields, power-ups, projectiles and hit reactions. These
approved sheets are integrated into battles, with unchanged PNG originals and
lossless optimized runtime copies. The separate gallery and ZIP remain useful
artwork and timing references. Live targets use the original quick standing-pose
hit response: a 210 ms red flash and four 85 ms legacy impact frames. The longer
v2 hit-reaction sheet is preserved in the approved pack and gallery but is not
currently played in battles; other v2 animation timing is unchanged.

The two earlier transparent PNGs below remain historical design references;
the runtime mappings use the approved v2 set.

- `enhancement-power-up.png`: 1254 × 1254, four columns and four rows.
  Frames 0–7 show Fire facing right; frames 8–15 show Water facing left.
  Both gather energy, power up with elemental sparks, then return to idle.
- `aura-spiral.png`: 1254 × 1254, four columns and four rows.
  Frames 0–7 expand a glowing green spiral underfoot; frames 8–11 form a
  lingering ground-ring loop; frames 12–15 fizzle out when Aura expires.

All files preserve generated source pixels and transparency. The live Aura
forms for 500 ms, holds its moving loop for one second, and then keeps looping
until the owner's third subsequent turn ends; activation does not count.
Expiry has a 500 ms fizzle. Reconnecting restores the loop without formation;
reduced motion uses a static ring. Successful Enhancement plays its two-second
jump; a failed roll displays MISS without animation.
