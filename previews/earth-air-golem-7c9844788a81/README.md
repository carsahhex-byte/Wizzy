# Earth, Air and Golem graphics delivery

This is an offline art and animation review. It adds no playable class, spell,
deck, combat effect or account change to the live game.

## Approved Golem design rule

- Earth transforms as soon as its Shield is **20 or higher**.
- Shield dropping below 20 during either player's turn does not immediately
  remove Golem form. Earth has its turn to rebuild.
- At Earth's own end turn, Shield **19 or lower** returns it to wizard form;
  Shield 20 or higher maintains Golem form.
- Golem form grants **+10 flat damage to damaging Earth spells only**. Shield,
  Mana and other non-damaging spells do not become attacks.
- Air's elemental resource and final spell effects remain undecided.

The threshold control in this gallery illustrates those rules only. It does not
run the battle engine or award damage, Shield, Mana, Enhancement or resources.
When elemental cards are implemented, damage ordering and percentage interaction
can be specified alongside their final effects.

## Contents and use

Extract the ZIP and open `index.html`, keeping its folders together. Alternatively,
open the separately supplied `preview.html`; that review embeds all images and
the earlier animated wizard gallery, so it works without an internet connection.

The new-sheet viewer has animation, frame, pause, mirror and pixel-zoom controls.
Use its background control to inspect transparency. The four-wizard/Golem panel
uses the existing Fire and Water standing sprites as a style and size reference.
The full earlier Earth/Air animation player is included in `legacy-gallery/`.

The earlier pack contains Earth/Air walking, idle, basic/simple/heavy casts,
shields, boosts, enhancement jumps, basic projectiles, heavy projectiles and
elemental impacts, plus Fire/Water and Aura references. Those original PNG files
are copied byte-for-byte. All new PNG files are also copied unchanged; the viewer
selects source regions and does not repaint, rescale or remove image pixels.
In this combined review, Earth's heavy attack selects the new rolling boulder
and its shatter impact; Air keeps the earlier cyclone. The packaged viewer alone
contains that selection adjustment. The earlier viewer source is preserved.

Caster sheets and projectile sheets are separate. The earlier animation player
keeps the full one-second charge/particle hold and the brief 210 ms hit flash;
its four impact frames remain 85 ms each. New Golem casts, boosts and enhancement
previews loop their charge poses for one second, with a separate quick-hit
sequence. Original frame indexes and playback order are recorded in the manifest.

`manifest.json` documents source file dimensions, grids, sequences, anchors and
SHA-256 hashes. `sprite-sheets.zip` contains the offline gallery and original PNGs.
The separate `preview.html` is omitted from that ZIP to avoid duplicating every
image as both a PNG and embedded data.

To regenerate this isolated delivery from the repository root:

```sh
node scripts/package-earth-air-golem-review.js /workspace/artifacts/earth-air-golem-pack
```

The packaging script does not register assets, build or publish the game.
