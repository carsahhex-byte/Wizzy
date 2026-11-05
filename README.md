# Wizzy · Seattle spell slab prototype

A mobile-first pixel-art game prototype with a title screen, a Seattle map preview, Character and Friends screens, a deck builder, and a two-player battle arena. Fire and Water can share one screen or use separate browsers connected to the room server. The **November 4 Master Spellbook** replaces the previous catalog with 14 Fire, 14 Water, and 3 Fate spells. Players build, save, upload, and download their own 30-slab decks; new element slots start empty.

[Open Wizzy](https://carsahhex-byte.github.io/Wizzy/#title) starts at the title screen. A new duel starts at **100 / 100 HP, 3 / 10 Mana, and 0 / 30 Shield**; the second number is each resource's maximum.

## Run

Requires Node.js 24 or later, including its built-in SQLite support for accounts. There are no npm dependencies to install. Shared-screen play needs no credentials or external services. Two-screen play needs the included room server running locally or on an HTTPS host.

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

The frontend release can be hosted on any static web server, including a project subpath such as `/Wizzy/`. Shared-screen saves and guest decks use this browser's local storage. Signing in syncs the same profile and saved Fire/Water deck slots through the account server, so another device can use the same deck editor and saved decks. Two-screen play sends game actions to the room server and stores a private room token on the device for reconnecting.

For two phones on the same Wi-Fi, run `npm run build:web` followed by `npm run multiplayer`, then open the computer's local IP address with port 8787 on each phone. For remote players, deploy that server to an HTTPS host and enter its address in **Two Screens**. See [the complete multiplayer setup guide](docs/multiplayer.md) for the commands, hosting resources, room-code flow, and troubleshooting. GitHub Pages cannot run the room API.

## Screens and deck building

The title screen opens a Home map showing a rough pixel-art Seattle, with Northgate, Rainier Beach, Magnolia, Magnuson Park, greyed-out West Seattle, and a Pike Place marker. The map supports mouse or touch dragging and an enlarged South Lake Union view. **Fit / 1×** fills the map panel with the expanded Seattle illustration; the header, zoom toolbar, and navigation dock sit outside the map so they do not cover the city. The city, surrounding pixel-art water, islands, and markers move together during panning and zooming. Its red blinking location dot marks a preview position; GPS navigation and arrival unlocks are not connected. Home links to Character, Deck, Friends, and Battle. A Storybook graphic and placeholder button sit above Character; photo capture and uploads are a later step. The Character screen keeps a wizard name and Fire/Water choice and links to account sign-in. Friends provides access to room-code battles; friend lists, invitations, and messaging remain later additions.

The deck builder places a scrollable selected-deck list in the upper half and a slab collection in the lower half, with four cards per collection row. Check a slab to add its first copy, use the quantity controls to add or remove further copies, and uncheck it to remove all copies. Filters cover All, Fire, Water, Fate, and slabs currently in the deck. All 31 spells can be inspected; only slabs eligible for the chosen main element can be added.

A saved deck must contain **exactly 30 slabs**, with **at most 3 copies of any spell**, and choose **one main element: Fire or Water**. Fate slabs are allowed with either element. Fire and Water cannot be mixed, Neutral spells are absent from this catalog, and there are no category quotas or generated starter decks. Incomplete drafts may be edited, but only valid full decks can be saved for battle. Fire and Water drafts and saved decks are retained separately in local browser storage. Signed-in saved decks also sync to that account on the server; an unused element slot may remain empty, and incomplete drafts stay on the device. Saving a deck does not alter an ongoing duel; starting a fresh duel uses the saved compositions. Shared-screen play requires both saved decks; each two-screen player needs the ready saved deck for their chosen role. **Upload deck** validates a versioned JSON file and loads a draft for review. **Download deck** exports a complete legal deck; **Save deck** commits it, and **Save & battle** saves it before opening battle choices. See [deck format and construction rules](docs/decklists.md).

The Battle shortcut offers shared-screen or two-screen play and provides a route back to Home. Guest two-screen matches use each device's saved deck; signed-in matches use the account's saved role deck. Each player keeps a private hand, with server-validated actions, server-side shuffling and dice, and reconnecting by player token. The first room prototype pairs Fire against Water and keeps matches in server memory; a process restart or sleeping free instance can erase a room. Native iPhone packaging, signing, and TestFlight distribution remain a later step.

## Accounts and saved decks

Open **Account** from the title or Character screen. Create a username/password account on your game server to import this device's current saved decks, or sign in to load that account's profile and decks. Every device uses the same UI and deck-construction rules. Valid deck/profile saves sync while signed in; unsaved drafts remain local. Guest decks remain available after signing out.

The server stores accounts, legal decks, salted password hashes, and hashed 30-day sessions in SQLite. `npm run multiplayer` uses `data/wizzy.sqlite` by default; set `ACCOUNT_DB_PATH` to another persistent file. This is separate from room storage: accounts survive a server restart when the database file is retained, while active rooms still reset. Database files are excluded from Git and Docker build contexts. Remote sign-in needs HTTPS. The beta has no email service or automated password recovery.

For hosted accounts, choose persistent storage and back it up. An ephemeral free instance can lose account data on a redeploy even though the login code works. The Docker image uses `/data/wizzy.sqlite`; mount a named volume at `/data`. The [setup guide](docs/multiplayer.md) includes account setup, persistent-disk settings, and backup instructions.

## Hosting on GitHub Pages

The connected repository is `carsahhex-byte/Wizzy`. Run `npm run deploy:pages` to test, build the hosted release, and upload only `dist/` to its `gh-pages` branch. The deployment script uses a temporary Git index and preserves the current source branch and working tree. It never force-pushes. To prepare a deployment commit without uploading it, build with `npm run build:web` and run `node scripts/deploy-pages.js`.

Enable hosting once in the repository's **Settings → Pages**:

1. Set **Source** to **Deploy from a branch**.
2. Select **gh-pages** and **/ (root)**.
3. Click **Save**, then wait for GitHub's Pages deployment to complete.

GitHub displays the live site address on that page. The anticipated project URL is `https://carsahhex-byte.github.io/Wizzy/`; it is not live merely because a deployment branch exists. The chat environment's network policy currently blocks the GitHub Pages settings API, so enabling hosting must be done in GitHub. Keep the repository's existing visibility unchanged.

Later `npm run deploy:pages` uploads update the same site. Shared-screen play needs no extra hosting account, image service, custom domain, or application API key. Two-screen play also requires a running room server; its separate deployment is described in [docs/multiplayer.md](docs/multiplayer.md). GitHub account/plan eligibility for Pages is determined by GitHub's settings page.

Hosted CSS and every JavaScript module use filenames hashed from their final content, including rewritten dependency imports. `build-info.json`, the `wizzy-build` HTML metadata, and the build number in game Settings identify the release. Each hosted build also provides `wizzy-<build-id>.html` and records that fresh launch address in `build-info.json`; it opens the same game and shares the same saved decks and duels. A hosted entry checks for a newer release without using a cached manifest. It redirects before interaction, or offers an update button after interaction so a running game is not unexpectedly reloaded. Deployment retains older launch addresses as aliases to the latest release.

For a no-install version, build the project and open **`dist/wizzy.html`** directly in a browser. This single-file version includes all scripts, styles, and the supplied artwork. Browser saves are separate for each hosted URL or downloaded copy, and file-based storage support depends on the browser.

## Artwork and layout

The uploaded PNGs remain unmodified in `public/graphics/`, including graphics reserved for later updates. New AI-generated title, Seattle map, icon, and app artwork provide the mobile preview. `src/assets.js` maps the graphics used by this version and records crop metadata that hides transparent export margins at rendering time. Pixel rendering keeps the art crisp. The hand frame uses nine-slice layout so its corners remain intact as the card area changes size.

The hosted build uses the required images from `public/optimized/`, encoded as lossless WebP with content-hashed filenames for caching. Their decoded RGBA pixels are byte-for-byte identical to the originals, and they load separately rather than being embedded in the HTML. Original and unused artwork and the large standalone download are excluded from the hosted release.

All **31 slabs** use the exact supplied artwork from `Graphics 1.2.zip` at the existing hand size. Explicit crop metadata matches Fire-1 through Fire-14, Water-1 through Water-14, Fortune, Misfortune, and Twist to their labeled cards, excluding atlas gutters and neighboring slabs. The original PNG bytes remain unchanged. Mana costs appear as a small corner badge from the spellbook metadata; the inspector also shows its complete rules as readable text. Selecting eligible Fate slabs uses the supplied **Cast Fate** button artwork.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

The battle arena uses the forest's original **1024 × 1536 (2:3 portrait)** canvas. One uniform scale fits it to the available screen; the forest is never stretched or cropped to widen the board. On Mac screens, its top and bottom meet the viewport edges, with side gutters. Narrower screens fit the width and center the board vertically. The other screens use a mobile layout that adapts to the viewport, with independently scrolling deck panels.

The Seattle map uses one square expanded illustration with ocean and islands around the city. **Fit / 1×** fills the map panel with that artwork; panning and zooming move the ocean, city, and markers together. Controls have their own rows outside the map. The page backdrop outside the mobile app remains separate from the map panel.

Wizards stand on the grass around logical y450. Stat panels begin at y480, with the hand and turn controls on the stone-and-dirt area below. The hand has three slabs in the top row and up to three in the bottom row (with two centered for a five-slab hand), with the discard and tower signs at its sides. The refresh drawer keeps its existing behavior, and the combat log opens over the board without changing the forest dimensions.

Use **Larger view** for a larger, scrollable portrait board and **Fit screen** to return. Optional Ember spending opens a compact popup above the selected slab only when Embers are available; the battle stays visible. Spells without an Ember choice cast directly, and mandatory all-Ember spending remains automatic.

## Implemented rules

- Both wizards start at **100 HP**, with **3 Mana**, zero Shield, zero Embers/Flow, and zero Loaded. Caps are **100 HP, 10 Mana, 30 Shield, and 5 Embers/Flow**.
- Each saved 30-slab deck deals **5 opening slabs**, leaving 25 in its Spell Tower. Both players roll one opening d6; higher starts and ties reroll both. Fate and Loaded do not modify initiative. The second player draws exactly one extra slab when their first own turn starts, up to the six-slab hand limit.
- **Start new shared-screen duel** deals a fresh opening hand using the saved decks. **Resume saved shared-screen duel** keeps the existing hands and progress; it does not deal an opening hand again. Later turn draws and hand refreshes fill up to six in either case.
- A round is one turn per wizard, starting with the initiative winner. Each wizard gains **2 Mana** and draws up to six at the beginning of their own turns after their opening turn. Unspent Mana carries over up to the cap.
- Each player commits **one primary spell per own turn**. Fire and Water slabs are primary; Fate does not use this allowance. Cast Spell pays printed Mana and permitted Ember spending. Optional spending uses a compact popup above the slab when Embers are available. Fire-7 and Fire-14 automatically spend all Embers.
- All **28 primary spells** in the current catalog have thresholds and roll **2d6**. After commitment, roll and display the raw dice plus eligible Loaded **before** either player chooses Fate. Higher thresholds replace lower outcomes of the same effect; separately printed additional effects still apply.
- Fate follows **defender → caster → conditional final defender response**. The defender first casts an eligible batch or skips; the caster then does the same. A caster skip resolves the spell. A caster Fate batch grants the defender one final response, after which the spell resolves. A player with no eligible Fate is skipped automatically. There are no further response rounds.
- Fortune gives **+4** when used by the caster; Misfortune gives **−4** when used by the defender. Either player may choose **+2 or −2** for each Twist. Select any number of eligible Fate slabs and cast the batch together. Skip Fate clears staged selections and advances without playing them. Fate updates the Modified Roll without rerolling dice; the displayed total includes both players' modifiers and may be negative.
- Loaded gained from a spell queues for that wizard's **next own turn**, stacks, applies once to that turn's first roll, and expires at that turn's end if unused. A bonus earned this turn does not modify this turn's roll.
- Opponent damage consumes Shield before HP. **Self-damage bypasses the caster's Shield.** Shield removal happens before damage when printed. Healing stops at 100 HP; reaching zero HP ends the duel.
- Fire gains only printed Embers, capped at five. Chosen spending is paid before resolution. Fire does not gain an automatic Ember for casting.
- Water damage and healing use **Flow before resolution**. After the spell's effects, every Water spell grants **1 Flow**. Printed **additional Flow** adds to that default, capped at five. Water-2 on 8+ grants two Flow total; Water-9 always grants two Flow total. Fate grants no automatic Flow.
- After primary resolution, Cast Spell stays greyed out until the caster's next own turn. End Turn reveals Hand Refresh and turns red. End Turn again passes without refreshing. Hand Refresh turns red, lets the player select any number of slabs including zero, then discards those selections, draws up to six, and passes immediately on confirmation. End Turn during selection passes without applying staged discards.
- Pending dice, Fate decisions, and spell resolution block ending the turn. Spell Tower and discard counts track card movement; the played primary is discarded once. Local control changes use handoffs. Read Slab shows full text, and Spell Tower lists deck composition without exposing draw order.
- Version **11** saves use the `nov4-v2.1` catalog and validate stats, zones, pending spell, dice, Fate batches, turn allowances, and refresh progress. Version 10 duels migrate with their current hands, zones, and resources intact; the new five-slab opening deal applies to new duels. Old-catalog duels are not resumed under new effects. Old decks are not reinterpreted as new cards: local storage is kept separate, and account migration archives old deck data while retaining credentials. Build and save new element decks before a new battle.

## Spellbook and custom decks

`src/spells.js` contains **31 definitions** transcribed from **Wizzy Master Spellbook Nov4.pdf**, *Master Spellbook V2.1*, dated November 4, 2026: Fire-1 through Fire-14, Water-1 through Water-14, and Fortune/Misfortune/Twist. Their effects execute in `src/effects.js`; combat timing lives in `src/game.js`.

The user's instructions explicitly replace the previous catalog and override the PDF's older pre-roll Fate timing and its experimental-version note. Fire and Water Mana costs and effect descriptions retain the PDF wording. The PDF leaves Fate Mana unspecified; the game retains its existing **0 Mana** Fate cost pending another ruling. There are no prescribed Fire/Water decklists in this release.

See [spell IDs, Mana costs, construction rules, and the JSON decklist format](docs/decklists.md).

## Current limits

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than six cards. No reshuffle or fatigue rule is invented. There is no AI opponent. Online rooms currently support Fire versus Water, use in-memory match storage, and do not add a turn-timeout rule, friend lists, chat, or photo uploads. Username/password accounts and saved decks use persistent SQLite storage when the configured database file is retained.

The in-game settings/handbook describes the active rules and local two-player flow.

## Project structure

- `src/spells.js` — current master spell metadata, catalog version, and PDF source references.
- `src/decks.js` — deck construction, empty/ready slot validation, JSON import/export, and copy limits.
- `src/effects.js` — executable Fire and Water effects, roll requirements, and Ember-spending choices.
- `src/game.js` — pure game-state transitions, post-roll Fate/refresh phases, slab instances, and versioned save validation.
- `src/main.js` — battle rendering, local/remote interactions, browser persistence, and hub integration.
- `src/multiplayer.js` — room lobby, private player session, server actions, polling, and reconnecting.
- `src/multiplayer.css` — mobile two-screen lobby layout.
- `src/accounts.js` / `src/accounts.css` — account sign-in, saved-deck synchronization, and account-screen layout.
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
- `docs/decklists.md` — current catalog reference, custom-deck construction, portable format, and combat rules.
- `docs/multiplayer.md` — two-device local setup, remote hosting resources, room flow, and troubleshooting.
- `server/` — authoritative room server, private player views, SQLite accounts/decks/sessions, validation, and built-frontend serving.
- `Dockerfile` — optional Node 24 container build for a room-server host.
- `scripts/` — Node server, static build, GitHub Pages deployment, and optional artwork optimizer.

Automated checks cover the current catalog, costs and thresholds, caps, Flow timing, optional and mandatory Ember spending, self-damage, post-roll Fate roles and responses, Twist signs, Loaded timing, custom-deck validation and transfers, turn/refresh rules, card conservation, accounts, room privacy, and save compatibility. Browser checks exercise the rendered collection, deck workflow, battle controls, and responsive layout.
