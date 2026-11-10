# Wizzy Sprite Library

Save this entire extracted folder anywhere. Open index.html to browse it offline. All 53 PNG files preserve their original bytes and transparency. No game files or account data are included.

## Folders

- Fire and Water: unique characters, custom Phoenix/Dolphin animations and stat frames.
- Earth, Air and Golem: new Golem assets and Earth attack; element frame-index.json files link to shared atlases.
- Shared/Fire-Water and Shared/Earth-Air: paired sheets saved once, with the full color variants intact.
- Shared/Effects and Shared/Interface: Aura, battle icons and controls.
- Archive: earlier casting sheets and custom-animation drafts, clearly separated from current artwork.
- Previews: offline Earth/Air/Golem and Earth/Air animation players.

The main manifest and each element's frame index document exact original files, hashes, grids, source rectangles, anchors and sequences. Paired sheets remain paired; no artwork was repainted or split.

## Current, preview and archive

Current Fire/Water sprites include walking, the approved one-second casting/particle holds, Shield, boosts, Enhancement, Aura, projectiles and the Phoenix/Dolphin custom attacks. The longer v2 hit-reaction sheet is retained as a reference; actual hits use the quicker 210 ms red flash and 340 ms impact window. Idle sheets and all Earth/Air/Golem assets are preview artwork. The archive preserves earlier versions and is not a recommendation to replace current art.

## Known Xineoph source issue

Fire/Custom/Xineoph-current-deep-red.png is an exact current-source backup. Its source frame 15 includes a stray wizard hat in the flight crop, repeating near 2.5 and 2.9 seconds. This pack does not silently alter it. Fire/Custom/Xineoph-original-clean-flight.png preserves the earlier clean flight effects; that backup still has the earlier lighter caster palette.

## Earth Golem design reference

Transform at Shield 20 or higher. A fall to 19 or lower does not revert immediately; check at Earth's own end turn. Golem form grants +10 flat damage only to damaging Earth spells. These are design/preview rules; Earth and Air have not been integrated into live combat.

## Portable use

Keep the subfolders together so relative image links continue to work. No internet connection, installation, login or build command is required to browse this extracted library. You can also open any PNG directly.
