# Xineoph scene reimagining

This separate illustration review reimagines Xineoph from its phoenix core,
using the Golem artwork's chunky pixel shapes, heavy outlines and complete
scene composition. The earlier emblem-like draft is retained for comparison.

The main illustration is a new draft. The smaller comparison images are the
previous Fire/Water-review Xineoph illustration and the Earth-5 Golem style
reference. All PNG files are copied unchanged, with hashes and dimensions in
`manifest.json`.

Spell names, Mana cost, effects, animations and live artwork are not changed.
The current Xineoph label and effect are shown only as reference metadata.

Extract the ZIP and open `index.html`, keeping the `art` and `references`
folders alongside it. No login, installation or internet connection is needed.
The main artwork contains no baked-in card title, cost, text or border.

Regenerate the isolated review once `art/xineoph.png` is present:

```sh
node scripts/package-xineoph-scene-review.js /workspace/artifacts/Xineoph-Scene-Reimagining
```
