# Wizzy · Battle Simulator

A responsive, local two-player wizard card game. Fire and Water take turns on the same screen, with separate hands, spell towers, and discard piles. Their decks use the supplied **30-slab decklists** and master spellbook definitions. The arena uses the supplied pixel-art graphics, including the forest, mages, frames, buttons, dice pair, and spell slabs.

## Run

Requires Node.js 22 or later. There are no packages to install and no credentials or external services to configure.

```sh
cd /workspace/Wizzy
npm start
```

The server listens on port **5173**. Set `PORT` to use another port. `npm run dev` starts the same development server; refresh the browser after editing files.

```sh
npm test          # game-engine and decklist tests
npm run build    # syntax validation and a static release in dist/
npm run build:web # smaller hosted release, with separate optimized artwork
npm run preview  # serve the built release on port 5173
```

The release can be hosted on any static web server, including a project subpath such as `/Wizzy/`. Game saves use this browser's local storage; no player data is sent to a backend.

## Hosting on GitHub Pages

The connected repository is `carsahhex-byte/Wizzy`. Run `npm run deploy:pages` to test, build the hosted release, and upload only `dist/` to its `gh-pages` branch. The deployment script uses a temporary Git index and preserves the current source branch and working tree. It never force-pushes. To prepare a deployment commit without uploading it, build with `npm run build:web` and run `node scripts/deploy-pages.js`.

Enable hosting once in the repository's **Settings → Pages**:

1. Set **Source** to **Deploy from a branch**.
2. Select **gh-pages** and **/ (root)**.
3. Click **Save**, then wait for GitHub's Pages deployment to complete.

GitHub displays the live site address on that page. The anticipated project URL is `https://carsahhex-byte.github.io/Wizzy/`; it is not live merely because a deployment branch exists. The chat environment's network policy currently blocks the GitHub Pages settings API, so enabling hosting must be done in GitHub. Keep the repository's existing visibility unchanged.

Later `npm run deploy:pages` uploads update the same site. No extra hosting account, image service, custom domain, or application API key is needed for this static game. GitHub account/plan eligibility for Pages is determined by GitHub's settings page.

Hosted CSS and every JavaScript module use filenames hashed from their final content, including rewritten dependency imports. This prevents a newly loaded page from mixing a new release with old cached game modules. `build-info.json`, the `wizzy-build` HTML metadata, and the build number in game Settings identify the exact release. If a page is still cached after deployment, opening the site with `?v=<build-id>` requests a fresh HTML URL without changing saved duels.

For a no-install version, build the project and open **`dist/wizzy.html`** directly in a browser. This single-file version includes all scripts, styles, and the supplied artwork. Browser saves are separate for each hosted URL or downloaded copy, and file-based storage support depends on the browser.

## Artwork and layout

The uploaded PNGs remain unmodified in `public/graphics/`, including graphics reserved for later updates. `src/assets.js` maps the graphics used by this version and records crop metadata that hides transparent export margins at rendering time. Pixel rendering keeps the art crisp. The hand frame uses nine-slice layout so its corners remain intact as the card area changes size.

The hosted build uses the required images from `public/optimized/`, encoded as lossless WebP with content-hashed filenames for caching. Their decoded RGBA pixels are byte-for-byte identical to the originals, and they load separately rather than being embedded in the HTML. Original and unused artwork and the large standalone download are excluded from the hosted release.

Elemental **Fire** slabs use the fiery-comet graphic and elemental **Water** slabs use the cresting-wave graphic. Shared **Neutral** slabs use the white graphic, and **Fate** slabs use the purple graphic. Each slab displays its own master ID, name, printed mana cost, and rules text; different spells reuse the appropriate category's artwork. The color identifies the slab type without an extra element label. Selecting an eligible Fate slab uses the supplied **Cast Fate** button artwork.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

The entire game uses the forest's original **1024 × 1536 (2:3 portrait)** canvas. One uniform scale fits it to the available screen; the forest is never stretched or cropped to widen the board. On Mac screens, its top and bottom meet the viewport edges, with side gutters. Narrower screens fit the width and center the board vertically.

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
- Water elemental spells use the Flow available before resolution for their effects and Flow damage. After all spell effects resolve, gain **1 Flow** unless the spell specifies a different Flow gain; that printed gain replaces the default rather than adding to it. Flow cannot exceed **5**. Neutral and Fate slabs do not grant this automatic Flow gain.
- Cards and turn controls remain locked while a rolling spell resolves. The played primary slab moves to discard exactly once. After resolution, **Cast Spell** stays greyed out and disabled until that wizard's next own turn; **End Turn** becomes available unless the duel has ended. Slabs can still be inspected. Clicking a selected primary slab again before casting deselects it.
- **End Turn** reveals the optional **Hand Refresh** button, which slides up from behind it, and turns **End Turn** red. Click **End Turn** again to pass without refreshing. A turn cannot end while a spell or its Fate decisions are pending.
- To refresh, click **Hand Refresh**; it also turns red. Select any number of cards (including zero or the entire hand), then click **Hand Refresh** again to discard those selections, draw from the tower up to a five-card hand, and immediately pass the turn. Selected cards turn grey and can be deselected before confirmation. Clicking **End Turn** during selection instead passes without refreshing or discarding any staged selection. There is no extra review or confirmation step after the refresh.
- Passing shows a handoff dialog before the next wizard begins; Fate decisions also use local handoffs when control changes.
- Spell tower and discard counts follow the active wizard and update with card movement.
- Select a slab and use **Read Slab** to inspect its complete printed rules. Clicking the **Spell Tower** or using the deck option in Settings opens that wizard's full composition and quantities; it does not reveal the hidden draw order.
- Combat log, new-duel confirmation, and validated browser save/resume are included. Save version 6 preserves current duels, including the primary-spell allowance, selected Fate batches, paid pending spells, dice results, and refresh progress. Valid version 5 saves retain all progress while capping any stored Water Flow above 5. Version 4 saves retain stats, resources, queued Loaded, card zones, and pending Fate/dice progress; a selected Fate slab becomes a batch selection, and current-turn pending spells or cast log entries determine whether the primary allowance is already spent. Valid version 3 preview saves retain stats, turn progress, and card zones; any unfinished unpaid preview spell is cancelled without retroactive costs, discarded slabs, or effects. Older valid 24-card sample saves first gain six slabs in each Spell Tower to reach the actual decklists. Every older-save upgrade also caps stored Water Flow at 5. The combat log records upgrades.

## Spell slabs and decklists

The source documents define the deck composition and printed spell metadata:

- **Fire v2.2**, revised November 3, 2026: 14 distinct spells, 30 slabs.
- **Water v1.0**: 15 distinct spells, 30 slabs.
- Each deck contains **21 Elemental, 2 Neutral, and 7 Fate** slabs.

`src/spells.js` contains 29 catalog definitions within the current scope: 12 Fire, 10 Water, 4 Neutral, and 3 Fate. All 26 Fire, Water, and Neutral effects and all 3 Fate effects are implemented. Exactly 25 distinct spells appear across the two playable decks; unused definitions remain executable for later decks. Earth and Air have not been imported or given effect logic. Water's zero-copy Ward and Legacy Shield reference rows create no playable slabs.

Printed names, mana costs, and complete effect text come from the uploaded master spellbook PDF, which identifies `MASTER_SPELLBOOK.xlsx` as its source. No spreadsheet file was uploaded. Card descriptions retain that master text verbatim; rules such as next-turn Loaded and post-resolution Flow gains are implemented separately.

See [the exact decklists and source references](docs/decklists.md) for master IDs, spell names, categories, printed mana costs, and copy quantities.

## Current limits

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than five cards. No reshuffle or fatigue rule is invented. There is no AI or online multiplayer.

The in-game settings/handbook describes the active rules and local two-player flow.

## Project structure

- `src/spells.js` — master spell metadata, exact Fire/Water deck quantities, and PDF source references.
- `src/effects.js` — executable Fire, Water, and Neutral effects, roll requirements, and Ember-spending choices.
- `src/game.js` — pure game-state transitions, fate/refresh phases, slab instances, save validation and migration.
- `src/main.js` — interface rendering, interactions, browser persistence.
- `src/style.css` — responsive arena and card styling.
- `src/assets.js` — uploaded graphic mapping and rendering crop metadata.
- `src/optimized-art.js` — generated filenames and integrity hashes for hosted artwork.
- `public/graphics/` — unmodified uploaded PNG graphics.
- `public/optimized/` — pixel-identical, hashed WebP copies and generation manifest.
- `public/art/` — earlier prototype art and the application favicon.
- `test/game.test.js` — phase locks, refresh, conservation, drawing, damage, victory, and save tests.
- `docs/decklists.md` — reviewable deck composition and metadata source documentation.
- `scripts/` — Node server, static build, GitHub Pages deployment, and optional artwork optimizer.

Engine tests cover deck quantities and metadata, printed costs, spell thresholds, Shield and self-damage, healing, Ember spending, Flow, Fate eligibility, batch selection and order, one primary per turn, Loaded timing, phase locks, refresh confirmation and passing, card conservation, drawing, victory, and save migration. Browser checks cover artwork loading, slab selection and inspection, Fate/resolution controls, hand refresh, counters, turn passing, save/resume, hosted resource versioning, and the portrait layout.
