# Fire and Water illustration reimagining

This is a separate artwork review, not a live card or combat update. The current
five Fire and five Water spells retain their names, costs, effects and IDs.

Ten new text-free, opaque landscape PNG illustrations reinterpret the familiar
subjects in the latest Earth draft style: coarse pixels, strong black outlines,
simple shapes, restrained palettes and dark backgrounds.

| Spell | New illustration concept |
| --- | --- |
| Heatbox | A large faceted firestone, flames and floating embers. |
| Blaze | A smaller ember-crystal core surrounded by curling flame and a Mana glint. |
| Charred Blade | A diagonal sword wrapped in fire. |
| Xineoph | A golden energy phoenix with flowing flame arcs and sparkles. |
| Sunsetter | A huge sun or meteor partly impacting the ocean, with dark mountains. |
| Sea bolt | A compressed spiral water bolt with foam and droplets. |
| Swell | A waterfall feeding a clear pool, with a small Mana glimmer. |
| Coral Crash | A luminous jellyfish among currents and coral. |
| Pacific | A dolphin leaping through a curling wave. |
| Poseidon's Rift | A golden trident rising from a stormy whirlpool. |

Sunsetter and Poseidon's Rift revive the earlier requested ocean-impact and
trident-whirlpool motifs. Their current live source art still shows a lava crater
and a stormy ocean, respectively; the gallery makes that distinction visible.

The review includes the unmodified source PNGs needed for current-art comparison,
two Earth style references, and exact illustration crop metadata from the game.
The comparison viewer selects regions at runtime; it does not edit old pixels.

Extract the ZIP and open `index.html`, keeping its folders together. No login,
installation or internet connection is required. You can open each illustration
PNG separately. The `art` folder contains the ten new drafts; `originals`
contains the current source sheets; `references` contains the Earth examples.

`manifest.json` preserves the original spell IDs, current reference text,
illustration dimensions and SHA-256 hashes. New artwork has no baked-in titles,
costs, card borders or rule text.

To regenerate the isolated review once all ten draft PNGs are present:

```sh
node scripts/package-fire-water-art-review.js /workspace/artifacts/Fire-Water-Art-Reimagining
```
