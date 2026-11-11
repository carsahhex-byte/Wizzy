# Revised spell effects

New transparent rough pixel effect sheets for the approved Sunsetter, Poseidon's Rift, Swell and Heatbox animation revisions. These atlases contain effects only; caster sprites and combat state remain separate.

All three original generated PNGs are retained unchanged in `art/` and copied unchanged into `public/graphics/`. Each is **1254 × 1254**, with four columns and four rows. Integer cell boundaries on either axis are `0, 314, 627, 940, 1254`.

| Sheet | Frames |
| --- | --- |
| Wizzy Rift Trident FX.png | Sixteen upright golden trident poses with small traveling glints; runtime movement and rotation provide the emergence, hover and dive. |
| Wizzy Elemental Ring FX.png | 0–3 looping Fire hoops; 4–7 looping Water hoops; 8–11 looping Earth hoops; 12–15 fiery burst and spark frames. |
| Wizzy Rift Whirlpool FX.png | 0–3 formation; 4–11 current loop; 12–15 splash/fade. No trident is baked into the water. |

The ring's visible center lies below the center of its source cell. `manifest.json` records measured transparent-hole centers and normalized anchors so the rear and front halves can surround a wizard without drifting. Trident body centers use `.5, .55`; its base anchor is `.5, .9`. Whirlpool placement uses `.5, .65` to follow the low spiral center.

Frames retain their source alpha, including soft edge pixels from generation. `solidBounds` in the manifest measures alpha at least 128; raw `alphaBounds` also includes faint padding. No image has been recolored, cropped, or repainted after generation.
