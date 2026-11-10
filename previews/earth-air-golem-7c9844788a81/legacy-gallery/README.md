# Earth and Air wizard preview pack

**Preview only. Earth and Air are not playable classes yet.** This separate
gallery adds no battle artwork, spells, decks, accounts or game rules to the
live app. The current Fire/Water game, including Water-0's on-cast Mana and
extra-Flow rule, stays unchanged.

Earth uses green and brown; Air uses ivory and lavender. The original transparent
PNGs are preserved. The viewer crops frames and applies documented anchors
without editing the source pixels. The manifest records each file's dimensions,
frame order, timing, anchors and SHA-256 hash.

The pack contains **12 PNGs**: ten new Earth/Air sheets with 304 frames and two
reference sheets with 48 frames (shared Aura and existing Fire/Water walking):

- Four-direction walking, with four frames per direction for each wizard in a
  four-column, eight-row sheet.
- Idle previews, with eight Earth frames and eight Air frames in a four-column,
  four-row sheet. These remain outside live battle idle behavior.
- Six paired actor sheets: basic attack, simple cast, large cast, elemental
  shield, power-up and successful Enhancement.
- Paired basic and large projectile sheets. Actor/projectile sheets have four
  columns and eight rows, with sixteen frames per element.
- Shared green Aura and the existing Fire/Water walking sheet for comparison.
  Earth/Air impacts use the last four frames of their own basic projectile
  sheet; there is no separate quick-impact PNG or orange Fire/Water impact.

For each sixteen-frame actor sequence, frames 0–3 form or wind up for 500 ms,
frames 4–11 provide eight distinct particle frames at 125 ms each for a full
one-second hold, and frames 12–15 finish over 500 ms. Walking and idle playback
use the manifest's own timing and frame order.

The presentation reference follows the existing battle routing:

| Effect | Timing / selection |
| --- | --- |
| Damaging spell | 0–3 Mana: basic attack; 4–5: simple cast; 6+: large cast. This selects artwork, not new Earth/Air spell rules. |
| Projectile | Release at 1,500 ms, one-second flight, impact at 2,500 ms. |
| Target hit | Standing-pose red flash for 210 ms and the element's final four basic-projectile frames at 85 ms each; the hit window ends at 2,840 ms. |
| Shield / power-up | Two-second sequence; effect presentation at 500 ms. |
| Successful Enhancement | Two-second jump after the Fate chain resolves; award presentation at 500 ms. A final miss has no animation. |
| Aura | Preview: 500 ms formation, two one-second green-ring loops, then a 500 ms fizzle. The live-game reference lasts three subsequent owner turns, excluding activation; the preview does not advance turns. |
| Fate | No animation. |

In the existing game, Fate follows the roll, and Enhancement uses the final
Modified Roll after its Fate chain. Those rules are references for presentation;
the gallery does not implement Earth/Air gameplay or award resources. Reduced
motion is supported by the preview controls without changing the live app.

Open `index.html` in a browser to review the full sheets and animations. Use
**Left wizard**, **Right wizard**, **Animation** and **Cast from** to choose the
preview, then Play/Pause, Restart, Speed or the timeline to inspect it. Swap
sides, Flip facing, Comparison direction and Show anchors help check alignment.

`sprite-sheets.zip` includes the original referenced PNGs, `manifest.json`,
`manifest.js`, the offline page, `preview.js`, `preview.css` and this README.
Keep the extracted files together. To regenerate the delivery folder from the
repository root:

```sh
node scripts/package-earth-air-review.js dist/previews/earth-air
```

The packager also accepts `--manifest PATH`. It packages the preview only;
it does not register runtime artwork, rebuild the game or publish the site.
The separate `previews/earth-air/` publication can retain the existing game
build ID and live battle files.
