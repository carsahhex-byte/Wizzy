# Wizzy graphics review

This separate, offline review contains rough pixel interface concepts, navigation button states, Earth and Air stat frames, Spell Tower / Discard Pile props, thirteen custom elemental effect sheets and three short Fate effects sharing one atlas. That is sixteen spell effects on fourteen original effect sheets. Xineoph and Pacific retain their existing game animations and are intentionally excluded from the new sheets.

**Graphics only: nothing in this folder installs artwork, renames cards in the game, changes combat, writes saves or publishes a website.** The proposed names in this review are **OffoDefo**, **Bengal Shield**, **Earthbound**, **Merciful**, **Tectonic** and **Carbonate**. Stable spell IDs identify their future connections.

## Open the review

Open the separately delivered `preview.html` for a self-contained Safari-compatible preview. It embeds the manifest, viewer, styles and original PNG bytes, with no network requests or JavaScript modules. The regular ZIP contains a folder with `index.html`, `manifest.json`, this README and an `art` directory. Extract the complete folder, then open `index.html`; keep its art folder beside it.

The Animation section includes spell selection, play/pause, restart, step controls, a time slider, speed, caster direction, Earth Wizard/Golem form, base/threshold outcome and several backdrops. Each sheet can be opened full-size or downloaded unchanged. Other sections show screen concepts, buttons, frames, battle props and every new source sheet.

Five smaller ZIPs are also supplied for easier downloads: `Wizzy-Fire-Effects.zip`, `Wizzy-Water-Effects.zip`, `Wizzy-Earth-Effects.zip`, `Wizzy-Fate-Effects.zip` and `Wizzy-UI-Frames-Props.zip`. Each includes that group’s original PNGs, metadata and a short README. They do not duplicate the contextual wizard/background reference sheets; use the complete package or self-contained HTML for animated playback.

## Animation presentation

The source effect atlases use row-major frames, normally 4 columns × 4 rows. Presentation timing is metadata and preview code, independent of bitmap size. Elemental previews use 0.5 seconds to form, a full one-second particle hold, then release or travel. Damaging previews use a quick 210 ms defender flash and a 340 ms impact window; increasing the particle hold does not lengthen the hit flash. Buff and shield effects stay with the caster. The preview uses existing wizard/Golem artwork only as an unchanged contextual reference; the new sheets contain isolated magic, not duplicate wizards.

Merciful is special: a successful final **6+** forms stone fragments that remain around Earth through the opponent's immediately next turn. Use **Begin opponent's next turn**, then **End opponent's next turn**. The fragments loop while held and only dissolve after that explicit end-turn action. A base result shows its short Shield effect without enabling the lasting fragments. This reflects the current incoming-damage-bypasses-Shield status; the review does not apply damage or turn rules.

Fortune, Misfortune and Twist share a clean three-cell glyph atlas. Each graphic appears above already-rolled dice for roughly 0.6 seconds after the Fate response, with a small rise, pulse and fade applied by the viewer. The ± symbol/value is live preview text; there is no wizard/projectile animation or additional primary action. Twist's selected sign can be reviewed through the outcome control.

Some spell sheets also depict conditional secondary details. Outcome selection is an art review aid, not a proof that every generated pixel encodes the combat condition. The full manifest records each spell's intended use. Exact game integration, rule triggers, final crop tuning and readable live labels follow only after approval.

## Source integrity and rebuild

The manifest lists original dimensions, byte counts and SHA-256 hashes. PNGs are copied byte-for-byte and stored uncompressed in the ZIP. The packager never crops, recolors, resizes or exports a processed image. Canvas crops in the viewer affect presentation only.

```sh
node scripts/package-overnight-graphics-review.js /workspace/artifacts/Wizzy-Graphics-Review
```

The command writes only to a dedicated folder outside the repository. It rejects unexpected existing files and symlinks. By default it requires all sixteen new spell effects and four screen concepts; use `--draft` only while reviewing incomplete source work. It assembles the separate `manifests/*.json` fragments into the standalone review manifest. The production build and publication scripts do not import this folder.
