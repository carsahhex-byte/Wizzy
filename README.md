# Wizzy · Battle Simulator

A responsive, local two-player wizard card game. Fire and Water take turns on the same screen, with separate hands, spell towers, and discard piles. The arena uses the supplied pixel-art graphics, including the forest, mages, frames, buttons, dice pair, and spell cards.

## Run

Requires Node.js 22 or later. There are no packages to install and no credentials or external services to configure.

```sh
cd /workspace/Wizzy
npm start
```

The server listens on port **5173**. Set `PORT` to use another port. `npm run dev` starts the same development server; refresh the browser after editing files.

```sh
npm test          # 14 game-engine tests
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

For a no-install version, build the project and open **`dist/wizzy.html`** directly in a browser. This approximately **25 MB** single-file version includes all scripts, styles, and the supplied artwork. Browser saves are separate for each hosted URL or downloaded copy, and file-based storage support depends on the browser.

## Artwork and layout

The uploaded PNGs remain unmodified in `public/graphics/`, including graphics reserved for later updates. `src/assets.js` maps the graphics used by this version and records crop metadata that hides transparent export margins at rendering time. Pixel rendering keeps the art crisp. The hand frame uses nine-slice layout so its corners remain intact as the card area changes size.

The hosted build uses only 17 required images from `public/optimized/`, encoded as lossless WebP with content-hashed filenames for caching. Their decoded RGBA pixels are byte-for-byte identical to the originals. The images total **13,399,496 bytes**, down from **19,323,096 bytes** (30.7% smaller), and load separately rather than being embedded in the HTML. Original and unused artwork and the large standalone download are excluded from the hosted release.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

Desktop mode fits the board to the available screen, including Mac laptop screens. Use **Larger view** for a larger, scrollable board and **Fit screen** to return. Phone layouts use normal scrolling so cards and controls remain readable.

## Implemented rules

- Both wizards start at 30 HP, with 3 mana, 0 shield, 0 elemental points (**Embers** for Fire, **Flow** for Water), and +0 loaded dice.
- Each wizard starts with 4 cards, including Water's opening turn.
- A round is one turn per wizard, Fire then Water. At the beginning of every subsequent round, both wizards gain 2 mana. Unspent mana carries over.
- On a wizard's turns after their opening turn, automatically draw up to 5 cards. Drawing happens at the beginning of the turn, not after casting.
- Click a card to highlight it, then click **Cast Spell**. The button becomes **Skip Fate**, and all cards are greyed out and unavailable during the fate window.
- Click **Skip Fate** to resolve the spell. Cards and turn controls remain locked during resolution. The played card moves to the discard pile when resolution completes, and normal casting and **End Turn** become available again.
- Multiple cards may be cast per turn. Clicking a selected card again before casting deselects it.
- **End Turn** reveals the optional **Hand Refresh** button, which slides up from behind it. Click **End Turn** again to pass without refreshing.
- To refresh, click **Hand Refresh**, select any number of cards (including zero or the entire hand), and click **Hand Refresh** again to confirm. Selected cards turn grey, then move to the discard pile; replacement cards are drawn from the tower up to a five-card hand. This stays on the same wizard's turn so the refreshed hand can be reviewed. Click **End Turn** to pass. Refresh is available only once per turn, and selections can be cancelled before confirmation.
- Passing shows a handoff dialog before the next wizard begins.
- Spell tower and discard counts follow the active wizard and update with card movement.
- Combat log, new-duel confirmation, and validated browser save/resume are included. Valid version-one saves are migrated to Fire/Water and the updated sample cards while preserving game progress.

## Deliberately pending

The next rules pass will define **card costs and effects**, dice behavior, deck composition, and discard recycling. The prototype does not interpret the example card effects in the reference image as final rules.

For now each wizard has a **24-card sample deck** (20 left in the tower after the opening deal): Fire uses copies of **Fiery Comet**, and Water uses copies of **Cresting Wave**. Other supplied card graphics are reserved for later rules. Sample spells have no cost or effect: casting demonstrates the fate and resolution flow without changing mana or HP. The supplied dice pair is displayed in its frame, but no rolls or dice effects are invented. All cards remain unavailable during the fate window until fate-card rules are provided.

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than five cards. No reshuffle or fatigue rule is invented. There is no AI or online multiplayer.

The game engine includes shield absorption, HP damage, and ending a duel when a wizard reaches zero HP, ready for future spell effects. Without those effects, the current UI cannot damage a wizard or finish a duel.

These provisional interpretations are also available through the in-game settings/handbook.

## Project structure

- `src/game.js` — pure game-state transitions, fate/refresh phases, card catalog, save validation and migration.
- `src/main.js` — interface rendering, interactions, browser persistence.
- `src/style.css` — responsive arena and card styling.
- `src/assets.js` — uploaded graphic mapping and rendering crop metadata.
- `src/optimized-art.js` — generated filenames and integrity hashes for hosted artwork.
- `public/graphics/` — unmodified uploaded PNG graphics.
- `public/optimized/` — pixel-identical, hashed WebP copies and generation manifest.
- `public/art/` — earlier prototype art and the application favicon.
- `test/game.test.js` — phase locks, refresh, conservation, drawing, damage, victory, and save tests.
- `scripts/` — Node server, static build, GitHub Pages deployment, and optional artwork optimizer.

The 14 engine tests pass. Chromium browser checks also pass for the initial updated build, covering artwork loading, card selection, fate/resolution locks, hand refresh, counters, turn passing, save/resume, and desktop and phone layouts.
