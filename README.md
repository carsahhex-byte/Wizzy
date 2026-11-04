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

Elemental **Fire** slabs use the fiery-comet graphic and elemental **Water** slabs use the cresting-wave graphic. Shared **Neutral** slabs use the white graphic, and **Fate** slabs use the purple graphic. Each slab displays its own master ID, name, printed mana cost, and rules text; different spells reuse the appropriate category's artwork.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

The entire game uses the forest's original **1024 × 1536 (2:3 portrait)** canvas. One uniform scale fits it to the available screen; the forest is never stretched or cropped to widen the board. On Mac screens, its top and bottom meet the viewport edges, with side gutters. Narrower screens fit the width and center the board vertically.

Wizards stand on the grass around logical y450. Stat panels begin at y480, with the hand and turn controls on the stone-and-dirt area below. Four opening cards occupy the upper hand row; the fifth card is centered in the lower row, with the discard and tower signs at its sides. The refresh drawer keeps its existing behavior, and the combat log opens over the board without changing the forest dimensions.

Use **Larger view** for a larger, scrollable portrait board and **Fit screen** to return. Dialogs remain at normal browser size for readability.

## Implemented rules

- Both wizards start at 30 HP, with 3 mana, 0 shield, 0 elemental points (**Embers** for Fire, **Flow** for Water), and +0 loaded dice.
- Each wizard starts with 4 spell slabs, including Water's opening turn. Each 30-slab deck therefore has 26 slabs left in its Spell Tower after the opening deal.
- A round is one turn per wizard, Fire then Water. At the beginning of every subsequent round, both wizards gain 2 mana. Unspent mana carries over.
- On a wizard's turns after their opening turn, automatically draw up to 5 cards. Drawing happens at the beginning of the turn, not after casting.
- Click a card to highlight it, then click **Cast Spell**. The button becomes **Skip Fate**, and all cards are greyed out and unavailable during the fate window.
- Click **Skip Fate** to resolve the spell. Cards and turn controls remain locked during resolution. The played card moves to the discard pile when resolution completes, and normal casting and **End Turn** become available again.
- Multiple cards may be cast per turn. Clicking a selected card again before casting deselects it.
- **End Turn** reveals the optional **Hand Refresh** button, which slides up from behind it. Click **End Turn** again to pass without refreshing.
- To refresh, click **Hand Refresh**, select any number of cards (including zero or the entire hand), and click **Hand Refresh** again to confirm. Selected cards turn grey, then move to the discard pile; replacement cards are drawn from the tower up to a five-card hand. This stays on the same wizard's turn so the refreshed hand can be reviewed. Click **End Turn** to pass. Refresh is available only once per turn, and selections can be cancelled before confirmation.
- Passing shows a handoff dialog before the next wizard begins.
- Spell tower and discard counts follow the active wizard and update with card movement.
- Select a slab and use **Read Slab** to inspect its complete printed rules. Clicking the **Spell Tower** or using the deck option in Settings opens that wizard's full composition and quantities; it does not reveal the hidden draw order.
- Combat log, new-duel confirmation, and validated browser save/resume are included. Save version 3 upgrades valid older 24-card sample duels to the actual 30-slab decklists, preserving stats, turn progress, phase, and zone counts while adding the six extra slabs to each Spell Tower. The combat log records the upgrade.

## Spell slabs and decklists

The source documents define the deck composition and printed spell metadata:

- **Fire v2.2**, revised November 3, 2026: 14 distinct spells, 30 slabs.
- **Water v1.0**: 15 distinct spells, 30 slabs.
- Each deck contains **21 Elemental, 2 Neutral, and 7 Fate** slabs.

`src/spells.js` contains 29 catalog definitions within the current scope: 12 Fire, 10 Water, 4 Neutral, and 3 Fate. Exactly 25 distinct spells appear across the two playable decks. Unused Fire/Water-scope definitions remain in the catalog for later decks; Earth and Air have not been imported. Water's zero-copy Ward and Legacy Shield reference rows create no playable slabs.

See [the exact decklists and source references](docs/decklists.md) for master IDs, spell names, categories, printed mana costs, and copy quantities.

## Deliberately pending

Deck quantities, spell identities, printed mana costs, and rules text now come from the supplied PDFs. **Executing those costs and effects is deliberately pending the next implementation step.** The displayed text is reference data, not active effect logic.

For this preview, the engine's executable `cost` remains zero even though each slab displays its real `manaCost`. Casting demonstrates the existing fate and resolution flow without spending mana or applying damage, healing, Shield, Embers, Flow, or roll modifiers. The supplied dice pair is displayed in its frame, but no rolls or dice effects are invented. All slabs—including Fate slabs—remain greyed out and unavailable during the fate window until the later fate-card behavior is implemented.

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than five cards. No reshuffle or fatigue rule is invented. There is no AI or online multiplayer.

The game engine includes shield absorption, HP damage, and ending a duel when a wizard reaches zero HP, ready for future spell effects. Without those effects, the current UI cannot damage a wizard or finish a duel.

These provisional interpretations are also available through the in-game settings/handbook.

## Project structure

- `src/spells.js` — master spell metadata, exact Fire/Water deck quantities, and PDF source references.
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

Engine tests cover deck quantities and metadata, phase locks, refresh, card conservation, drawing, damage, victory, and save migration. Browser validation covers artwork loading, slab selection and inspection, fate/resolution locks, hand refresh, counters, turn passing, save/resume, hosted resource versioning, and the portrait layout.
