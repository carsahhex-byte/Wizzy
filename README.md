# Wizzy · Seattle spell slab prototype

A mobile-first pixel-art game prototype with a title screen, a Seattle map preview, Character and Friends screens, a deck builder, and a two-player battle arena. Fire and Water can share one screen or use separate browsers connected to the room server. The supplied **30-slab decklists** are starter presets; custom decks use the same master spellbook definitions and executable effects.

## Run

Requires Node.js 22 or later; Node.js 24 is recommended for hosting. There are no npm dependencies to install. Shared-screen play needs no credentials or external services. Two-screen play needs the included room server running locally or on an HTTPS host.

```sh
cd /workspace/Wizzy
npm start
```

The server listens on port **5173**. Set `PORT` to use another port. `npm run dev` starts the same development server; refresh the browser after editing files.

```sh
npm test          # game-engine, deck-building, and spell-effect tests
npm run build    # syntax validation and a static release in dist/
npm run build:web # smaller hosted release, with separate optimized artwork
npm run preview  # serve the built release on port 5173
npm run multiplayer # serve the built app and room API on port 8787
```

The frontend release can be hosted on any static web server, including a project subpath such as `/Wizzy/`. Shared-screen saves and saved decks use this browser's local storage. Two-screen play sends the selected deck and game actions to the room server and stores a private player token on the device for reconnecting.

For two phones on the same Wi-Fi, run `npm run build:web` followed by `npm run multiplayer`, then open the computer's local IP address with port 8787 on each phone. For remote players, deploy that server to an HTTPS host and enter its address in **Two Screens**. See [the complete multiplayer setup guide](docs/multiplayer.md) for the commands, hosting resources, room-code flow, and troubleshooting. GitHub Pages cannot run the room API.

## Screens and deck building

The title screen opens a Home map showing a rough pixel-art Seattle, with Northgate, Rainier Beach, Magnolia, Magnuson Park, greyed-out West Seattle, and a Pike Place marker. The map supports mouse or touch dragging and an enlarged South Lake Union view. **Whole map** fits the complete Seattle illustration inside a clear viewport; the header, zoom toolbar, and navigation dock sit outside the map so they do not cover the city. Its red blinking location dot marks a preview position; GPS navigation and arrival unlocks are not connected. Home links to Character, Deck, Friends, and Battle. A Storybook graphic and placeholder button sit above Character; photo capture and uploads are a later step. The Character screen keeps a local wizard name and Fire/Water choice. Friends provides access to room-code battles; persistent friend accounts, invitations, and messaging remain later additions.

The deck builder places a scrollable selected-deck list in the upper half and a slab collection in the lower half, with four cards per collection row. Check a slab to add its first copy, use the quantity controls to add or remove further copies, and uncheck it to remove all copies. Filters cover All, Fire, Water, Neutral, Fate, and slabs currently in the deck. All 29 imported spells can be inspected; only slabs eligible for the chosen main element can be added.

A saved deck must contain **exactly 30 slabs**, with **at most 3 copies of any spell**, and choose **one main element: Fire or Water**. Neutral and Fate slabs are allowed with either element. The starter decks' 21 Elemental / 2 Neutral / 7 Fate split is a preset composition, not a construction requirement. Incomplete drafts may be edited, but only valid full decks can be saved for battle. Fire and Water drafts and saved decks are retained separately in local browser storage. Saving a deck does not alter an ongoing duel; starting a fresh duel uses the saved compositions.

The Battle shortcut offers shared-screen or two-screen play and provides a route back to Home. Two-screen matches use each device's saved deck and private hand, with server-validated actions, server-side shuffling and dice, and reconnecting by player token. The first room prototype pairs Fire against Water and keeps matches in server memory; a process restart or sleeping free instance can erase a room. Native iPhone packaging, signing, and TestFlight distribution remain a later step.

## Hosting on GitHub Pages

The connected repository is `carsahhex-byte/Wizzy`. Run `npm run deploy:pages` to test, build the hosted release, and upload only `dist/` to its `gh-pages` branch. The deployment script uses a temporary Git index and preserves the current source branch and working tree. It never force-pushes. To prepare a deployment commit without uploading it, build with `npm run build:web` and run `node scripts/deploy-pages.js`.

Enable hosting once in the repository's **Settings → Pages**:

1. Set **Source** to **Deploy from a branch**.
2. Select **gh-pages** and **/ (root)**.
3. Click **Save**, then wait for GitHub's Pages deployment to complete.

GitHub displays the live site address on that page. The anticipated project URL is `https://carsahhex-byte.github.io/Wizzy/`; it is not live merely because a deployment branch exists. The chat environment's network policy currently blocks the GitHub Pages settings API, so enabling hosting must be done in GitHub. Keep the repository's existing visibility unchanged.

Later `npm run deploy:pages` uploads update the same site. Shared-screen play needs no extra hosting account, image service, custom domain, or application API key. Two-screen play also requires a running room server; its separate deployment is described in [docs/multiplayer.md](docs/multiplayer.md). GitHub account/plan eligibility for Pages is determined by GitHub's settings page.

Hosted CSS and every JavaScript module use filenames hashed from their final content, including rewritten dependency imports. This prevents a newly loaded page from mixing a new release with old cached game modules. `build-info.json`, the `wizzy-build` HTML metadata, and the build number in game Settings identify the exact release. If a page is still cached after deployment, opening the site with `?v=<build-id>` requests a fresh HTML URL without changing saved duels.

For a no-install version, build the project and open **`dist/wizzy.html`** directly in a browser. This single-file version includes all scripts, styles, and the supplied artwork. Browser saves are separate for each hosted URL or downloaded copy, and file-based storage support depends on the browser.

## Artwork and layout

The uploaded PNGs remain unmodified in `public/graphics/`, including graphics reserved for later updates. New AI-generated title, Seattle map, icon, and app artwork provide the mobile preview. `src/assets.js` maps the graphics used by this version and records crop metadata that hides transparent export margins at rendering time. Pixel rendering keeps the art crisp. The hand frame uses nine-slice layout so its corners remain intact as the card area changes size.

The hosted build uses the required images from `public/optimized/`, encoded as lossless WebP with content-hashed filenames for caching. Their decoded RGBA pixels are byte-for-byte identical to the originals, and they load separately rather than being embedded in the HTML. Original and unused artwork and the large standalone download are excluded from the hosted release.

All **29 imported spells** have individual pixel-art illustrations arranged in four category atlases. Fire, Water, Neutral, and Fate retain their category-colored slab frames, with names, costs, and rules text rendered from the master metadata. Sunsetter depicts a dramatic sun/fireball impacting the ocean with mountains in the foreground; Poseidon's Rift depicts a golden trident in a pounding whirlpool. The atlas mapping in `src/assets.js` selects the illustration for each spell, so future text and balance changes do not require repainting the card. Selecting an eligible Fate slab uses the supplied **Cast Fate** button artwork.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

The battle arena uses the forest's original **1024 × 1536 (2:3 portrait)** canvas. One uniform scale fits it to the available screen; the forest is never stretched or cropped to widen the board. On Mac screens, its top and bottom meet the viewport edges, with side gutters. Narrower screens fit the width and center the board vertically. The other screens use a mobile layout that adapts to the viewport, with independently scrolling deck panels.

Wizards stand on the grass around logical y450. Stat panels begin at y480, with the hand and turn controls on the stone-and-dirt area below. The hand has three slabs in the top row and up to two centered in the bottom row, with the discard and tower signs at its sides. The refresh drawer keeps its existing behavior, and the combat log opens over the board without changing the forest dimensions.

Use **Larger view** for a larger, scrollable portrait board and **Fit screen** to return. Dialogs remain at normal browser size for readability.

## Implemented rules

- Both wizards start at 30 HP, with 3 mana, 0 shield, 0 elemental points (**Embers** for Fire, **Flow** for Water), and +0 loaded dice.
- Each wizard starts with 4 spell slabs, including Water's opening turn. Each 30-slab deck therefore has 26 slabs left in its Spell Tower after the opening deal.
- A round is one turn per wizard, Fire then Water. At the beginning of each wizard's own turn after their opening turn, that wizard gains 2 mana. Unspent mana carries over.
- On a wizard's turns after their opening turn, automatically draw up to 5 cards. Drawing happens at the beginning of the turn, not after casting.
- Each wizard may commit **one primary spell per own turn**. Elemental and Neutral slabs are primary spells; Fate slabs do not use this allowance. Click a primary slab to highlight it, then click **Cast Spell**. The allowance and printed mana cost are consumed when the spell is committed, before any Fate decisions; an unaffordable slab can be inspected but cannot be cast. Choose any permitted Ember spending before committing the spell; Sunsetter spends all available Embers.
- Only spells with roll thresholds use dice and open Fate decisions. Other spells resolve immediately, without a Fate window or dice roll. Elemental type alone does not require dice.
- For a rolling spell, **Cast Spell** changes to **Skip Fate**. The attacker may select any number of eligible **Fortune** (+4) and **Twist** (+2) slabs, then click **Cast Fate** to play the entire selected batch and advance immediately. Clicking a selected Fate slab again removes it from the batch. Non-Fate and ineligible Fate slabs are greyed out. **Skip Fate** plays no Fate slabs, clears any staged selection, and advances.
- A local handoff then lets the defender select any number of **Misfortune** (−4) and **Twist** (−2) slabs. **Cast Fate** plays that batch and advances to the roll; **Skip Fate** advances without playing any. No extra Skip Fate click is needed after casting a batch. These are successive attacker and defender windows, with no alternating responses or per-turn Fate limit. Cast Fate slabs move to their owner's discard.
- After both Fate windows close, roll two six-sided dice. The displayed total is their raw sum plus eligible Loaded, attacking Fate, and defending Fate; negative totals are allowed. The spell uses that modified total to resolve its threshold effects. The dice frame shows the faces and total, including the modifier breakdown.
- Loaded gained from a spell is queued for that wizard's **next own turn**. It stacks, applies once to their first roll on that turn, and expires at that turn's end if unused. Immediate spells do not consume it, and bonuses gained this turn cannot modify this turn's rolls.
- Damage, including self-damage, consumes Shield before HP. Healing is capped at 30 HP. Spell effects update Shield, Embers, Flow, mana, and Loaded as printed, and a wizard reaching 0 HP ends the duel.
- Fire's Ember counter cannot exceed **5**. Printed Ember gains add only the amount that fits below that cap; Fire spells have no automatic Ember gain. Spending removes the selected Embers before the spell resolves.
- Water elemental spells use the Flow available before resolution for their effects and Flow damage. After all spell effects resolve, gain **1 Flow** unless the spell specifies a different Flow gain; that printed gain replaces the default rather than adding to it. Flow cannot exceed **5**. Neutral and Fate slabs do not grant this automatic Flow gain.
- Cards and turn controls remain locked while a rolling spell resolves. The played primary slab moves to discard exactly once. After resolution, **Cast Spell** stays greyed out and disabled until that wizard's next own turn; **End Turn** becomes available unless the duel has ended. Slabs can still be inspected. Clicking a selected primary slab again before casting deselects it.
- **End Turn** reveals the optional **Hand Refresh** button, which slides up from behind it, and turns **End Turn** red. Click **End Turn** again to pass without refreshing. A turn cannot end while a spell or its Fate decisions are pending.
- To refresh, click **Hand Refresh**; it also turns red. Select any number of cards (including zero or the entire hand), then click **Hand Refresh** again to discard those selections, draw from the tower up to a five-card hand, and immediately pass the turn. Selected cards turn grey and can be deselected before confirmation. Clicking **End Turn** during selection instead passes without refreshing or discarding any staged selection. There is no extra review or confirmation step after the refresh.
- Passing shows a handoff dialog before the next wizard begins; Fate decisions also use local handoffs when control changes.
- Spell tower and discard counts follow the active wizard and update with card movement.
- Select a slab and use **Read Slab** to inspect its complete printed rules. Clicking the **Spell Tower** or using the deck option in Settings opens that wizard's full composition and quantities; it does not reveal the hidden draw order.
- Combat log, new-duel confirmation, and validated browser save/resume are included. Save version 8 records each wizard's complete starting deck definition alongside current zones, primary-spell allowance, selected Fate batches, paid pending spells, dice results, and refresh progress. Valid version 7 saves retain their custom decks and all progress while capping any stored Fire Embers above 5. Version 6 saves retain progress and gain their original starter deck definitions. Version 5 upgrades retain progress while capping any stored Water Flow above 5. Version 4 upgrades also preserve paid spell, Fate, dice, and queued Loaded progress; a selected Fate slab becomes a batch selection, and current-turn pending spells or cast log entries determine whether the primary allowance is already spent. Valid version 3 preview saves retain stats, turn progress, and card zones; any unfinished unpaid preview spell is cancelled without retroactive costs, discarded slabs, or effects. Older valid 24-card sample saves first gain six slabs in each Spell Tower to reach the actual decklists. Every older-save upgrade caps stored Embers and Flow at 5. The combat log records upgrades.

## Spell slabs and decklists

The source documents define the deck composition and printed spell metadata:

- **Fire v2.2**, revised November 3, 2026: 14 distinct spells, 30 slabs.
- **Water v1.0**: 15 distinct spells, 30 slabs.
- Each deck contains **21 Elemental, 2 Neutral, and 7 Fate** slabs.

`src/spells.js` contains 29 catalog definitions within the current scope: 12 Fire, 10 Water, 4 Neutral, and 3 Fate. All 26 Fire, Water, and Neutral effects and all 3 Fate effects are implemented. Exactly 25 distinct spells appear across the two starter decks; the deck builder makes all imported definitions available subject to element and copy rules. Earth and Air have not been imported or given effect logic. Water's zero-copy Ward and Legacy Shield reference rows create no starter copies, but those Neutral spells can be added in the builder.

Printed names, mana costs, and complete effect text come from the uploaded master spellbook PDF, which identifies `MASTER_SPELLBOOK.xlsx` as its source. No spreadsheet file was uploaded. Card descriptions retain that master text verbatim; rules such as next-turn Loaded and post-resolution Flow gains are implemented separately.

See [the exact decklists and source references](docs/decklists.md) for master IDs, spell names, categories, printed mana costs, and copy quantities.

## Current limits

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than five cards. No reshuffle or fatigue rule is invented. There is no AI opponent. Online rooms currently support Fire versus Water, use in-memory storage, and do not add a turn-timeout rule, full Friends accounts, chat, or photo uploads.

The in-game settings/handbook describes the active rules and local two-player flow.

## Project structure

- `src/spells.js` — master spell metadata, exact Fire/Water deck quantities, and PDF source references.
- `src/decks.js` — deck construction, validation, starter presets, and copy limits.
- `src/effects.js` — executable Fire, Water, and Neutral effects, roll requirements, and Ember-spending choices.
- `src/game.js` — pure game-state transitions, fate/refresh phases, slab instances, save validation and migration.
- `src/main.js` — battle rendering, local/remote interactions, browser persistence, and hub integration.
- `src/multiplayer.js` — room lobby, private player session, server actions, polling, and reconnecting.
- `src/multiplayer.css` — mobile two-screen lobby layout.
- `src/hub.js` — title, Home, Character, Friends, and deck-builder screens with local profile/deck persistence.
- `src/hub.css` — mobile hub layout, pixel-styled controls, and independently scrolling deck panels.
- `src/style.css` — responsive arena and card styling.
- `src/assets.js` — uploaded graphic mapping and rendering crop metadata.
- `src/optimized-art.js` — generated filenames and integrity hashes for hosted artwork.
- `public/graphics/` — unmodified uploaded PNG graphics.
- `public/optimized/` — pixel-identical, hashed WebP copies and generation manifest.
- `public/art/` — earlier prototype art and the application favicon.
- `test/game.test.js` — phase locks, refresh, conservation, drawing, damage, victory, and save tests.
- `test/decks.test.js` — full-deck and draft validation, element restrictions, quantities, and copy limits.
- `docs/decklists.md` — reviewable deck composition and metadata source documentation.
- `docs/multiplayer.md` — two-device local setup, remote hosting resources, room flow, and troubleshooting.
- `server/` — authoritative room server, private player views, validation, and built-frontend serving.
- `Dockerfile` — optional Node 24 container build for a room-server host.
- `scripts/` — Node server, static build, GitHub Pages deployment, and optional artwork optimizer.

Engine tests cover deck quantities and metadata, printed costs, spell thresholds, Shield and self-damage, healing, Ember spending, Flow, Fate eligibility, batch selection and order, one primary per turn, Loaded timing, phase locks, refresh confirmation and passing, card conservation, drawing, victory, and save migration. Browser checks cover artwork loading, slab selection and inspection, Fate/resolution controls, hand refresh, counters, turn passing, save/resume, hosted resource versioning, and the portrait layout.
