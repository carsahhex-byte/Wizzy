# Enhancement and Aura animation previews

The complete revised combat set is in [v2-one-second](v2-one-second/README.md):
ten sheets with eight distinct held-effect frames per sequence, played at
125 ms each for a full one-second linger. The package includes Enhancement,
Aura, casts, attacks, shields, power-ups, projectiles and hit reactions. These
revised sheets also remain outside the game's runtime artwork pending review.

These original transparent PNGs are design previews, kept outside the game's
runtime artwork. They are not loaded or played by the game yet.

- `enhancement-power-up.png`: 1254 × 1254, four columns and four rows.
  Frames 0–7 show Fire facing right; frames 8–15 show Water facing left.
  Both gather energy, power up with elemental sparks, then return to idle.
- `aura-spiral.png`: 1254 × 1254, four columns and four rows.
  Frames 0–7 expand a glowing green spiral underfoot; frames 8–11 form a
  lingering ground-ring loop; frames 12–15 fizzle out when Aura expires.

Both files preserve the generated source pixels and transparency. The planned
Aura loop follows the existing Aura status, lasting until the owner's third
subsequent turn ends; time spent on its activation turn does not count.
