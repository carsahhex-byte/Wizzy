# Wizzy · Seattle spell slab prototype

A mobile-first pixel-art game prototype with a title screen, a Seattle map preview, Character and Friends screens, a deck builder, and a two-player battle arena. Fire and Water can share one screen or use separate browsers connected to the room server. The **November 4 Master Spellbook** supplies 14 Fire, 14 Water, and 3 Fate spells, with the additional **Fire-0, Fire-15 and Water-0** bringing the collection to **34: 16 Fire, 15 Water and 3 Fate**. Players build, save, upload, and download their own decks of **1–30 slabs**; new element slots start empty.

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

**Save deck works without an account.** Guest profiles, saved decks and drafts use stable device storage shared by every hosted update on the same origin. Compatible earlier saves and guest backup copies are restored when needed. Closing a regular tab or following a newer Wizzy launch link keeps those decks. Use the same browser and device; Download deck provides a portable backup for another browser or device.

For two phones on the same Wi-Fi, run `npm run build:web` followed by `npm run multiplayer`, then open `http://YOUR_MAC_WIFI_IP:8787/#title` in Safari on both phones. Find the Mac's address in **System Settings → Wi-Fi → Details → TCP/IP**. Guest play needs no account: save each phone's legal 1–30-slab role deck, then use **Battle → Play on two screens**, the same **Game server address**, and **Create battle →** / **Join →** with the eight-character room code. The locally served app uses separate deck storage from GitHub Pages; export existing decks with **Download deck**, then **Upload deck** and **Save deck** at the local address. Keep the Mac awake and server running. For remote players, deploy an HTTPS server. See [the complete multiplayer setup guide](docs/multiplayer.md) for commands and troubleshooting. GitHub Pages cannot run the room API or connect to an HTTP Mac from its HTTPS page.

## Screens and deck building

The title screen opens a Home map using the clean pixel-art Seattle landmark illustration, with draggable/zoomable city, water and islands. The approved **rough 8-bit Home UI** is now live: navy/indigo framing with wood and parchment details around the header, map, zoom toolbar and navigation buttons. **Fit / 1×** fills the map panel; the header, zoom toolbar and navigation dock stay outside the city. The same 14 grey district markers **1–12, 14 and 15** open **Storybook** with only that district expanded. Queen Anne is merged into **15, Seattle Center**; marker 13 and 4.5 are removed, and **14 is South Lake Union**. Storybook shows a minimal **Mainquest N** label and assigned boss name per district; unassigned bosses are left blank. Its beige pixel-paper theme uses the slab cards' font style. The general Storybook button above Character opens all districts collapsed, and leaving the book clears expanded entries. Markers open this view rather than district mini-maps. The red blinking dot remains a preview position; GPS gating, quest completion, rewards and photo uploads are not implemented. Home also links to Character, Deck, Friends and Battle. Character keeps a wizard name and Fire/Water choice and links to account sign-in. Friends provides room-code battles; friend lists, invitations and messaging remain later additions.

The deck builder places a scrollable selected-deck list in the upper half and a slab collection in the lower half, with four cards per collection row. Check a slab to add its first copy, use the quantity controls to add or remove further copies, and uncheck it to remove all copies. Filters cover All, Fire, Water, Fate, and slabs currently in the deck. All 34 spells can be inspected; only slabs eligible for the chosen main element can be added.

A playable saved deck contains **1–30 slabs**, with **no per-spell copy limit**, and chooses **one main element: Fire or Water**. Fate slabs are allowed with either element. Fire and Water cannot be mixed, Neutral spells are absent from this catalog, and there are no category quotas or generated starter decks. Empty drafts remain editable but cannot be saved for battle. Fire and Water drafts and saved decks are retained separately in local browser storage. Signed-in saved decks also sync to that account on the server; an unused element slot may remain empty, and drafts stay on the device. Saving a deck does not alter an ongoing duel; starting a fresh duel uses the saved compositions. Shared-screen play requires both saved decks; each two-screen player needs a legal saved deck for their chosen role. Existing 30-slab decks remain valid. **Upload deck** validates a versioned JSON file and loads a draft for review. **Download deck** exports a legal nonempty deck; **Save deck** commits it, and **Save & battle** saves it before opening battle choices. See [deck format and construction rules](docs/decklists.md).

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

For a no-install version, build the project and open **`dist/wizzy.html`** directly in a browser. This single-file version includes all scripts, styles, and the supplied artwork. Hosted saves are shared across game paths on the same origin, including the fresh launch file for each update. Different domains or browser profiles have separate saves; file-based storage support depends on the browser.

## Artwork and layout

The uploaded PNGs remain unmodified in `public/graphics/`, including graphics reserved for later updates. New AI-generated title, Seattle map, icon, and app artwork provide the mobile preview. `src/assets.js` maps the graphics used by this version and records crop metadata that hides transparent export margins at rendering time. Pixel rendering keeps the art crisp. The hand frame uses nine-slice layout so its corners remain intact as the card area changes size.

The hosted build uses the required images from `public/optimized/`, encoded as lossless WebP with content-hashed filenames for caching. Their decoded RGBA pixels are byte-for-byte identical to the originals, and they load separately rather than being embedded in the HTML. Original and unused artwork and the large standalone download are excluded from the hosted release.

The **31 original slabs** use the exact supplied artwork from `Graphics 1.2.zip` at the existing hand size. Explicit crop metadata matches Fire-1 through Fire-14, Water-1 through Water-14, Fortune, Misfortune, and Twist to their labeled cards, excluding atlas gutters and neighboring slabs. **Fire-0** has a matching rough pixel-art slab, reused by **Fire-15** with its own live name and conditional Mana text. **Water-0** reuses existing Water artwork with its own name and “On a 7+, gain 1 Mana” effect. The original PNG bytes remain unchanged. All **34 slabs** share one proportional rules size: **17 px at a 170 px card width**, without shrinking dense descriptions. Heavy titles stay at the top of the parchment; compact rules sit centered below them, with **bold roll thresholds**. The larger yellow number in the upper-left corner is the Mana cost; accessible labels retain “N Mana.” Read Slab keeps the complete spellbook wording. Selecting eligible Fate slabs uses the supplied **Cast Fate** button artwork.

After replacing source PNGs, regenerate their optimized copies with `npm run optimize:art`. That optional authoring command requires Python and Pillow with WebP support; running, testing, building, and deploying the retained files require only Node.js and Git. The web build verifies source and optimized SHA-256 hashes and rejects stale or damaged copies.

The Fire and Water stat frames use rough pixel-art icons for element, HP, Mana,
Shield and Loaded. Compact card rules use a sword for outgoing damage, a heart
for healing, and matching Shield, Mana and die symbols; flames mean Embers and
water drops mean Flow. Short formulas preserve base values, multipliers,
optional spending, “extra” versus “instead,” and after-spell Flow timing. Fate
shows its modifier beside the die symbol, still changing the Modified Roll.
Full words remain available to accessibility tools and in Read Slab; the spell
catalog and combat calculations are unchanged.

The battle arena uses the forest's original **1024 × 1536 (2:3 portrait)** canvas. One uniform scale fits it to the available screen; the forest is never stretched or cropped to widen the board. On Mac screens, its top and bottom meet the viewport edges, with side gutters. Narrower screens fit the width and center the board vertically. The other screens use a mobile layout that adapts to the viewport, with independently scrolling deck panels.

Battle wizards use the original tiny four-direction Fire and Water walk atlas. After **Continue** in a new duel's opening dialog, Fire walks in from offscreen left and Water from offscreen right, then they idle facing each other on the grass. No keyboard controls are added. Resuming a duel starts them idle; reduced motion places them there immediately. The source atlas PNG remains unmodified, with a lossless optimized copy. The larger mage portraits remain on Character and handoff screens.

The new [idle wizard animations](designs/idle-previews/README.md) are **preview only and are not played in battle**. Their separate gallery and offline ZIP at `previews/idle-wizards/` show eight Fire frames and eight Water frames, with subtle breathing, blinking and elemental particles on a 1.28-second loop. Runtime artwork and idle behavior remain unchanged.

Primary spell animations play after any Fate chain ends, using the approved v2 caster and projectile sheets. Damaging spells costing **0–3 Mana** use a basic attack; **4–5 Mana** use a simple cast; **6+ Mana** use a large cast. The caster has 500 ms of windup, a **one-second moving-particle charge**, and 500 ms of recovery. A one-second projectile flight starts at release (1.5 seconds) and hits at 2.5 seconds. The defender keeps its standing pose with the original quick **210 ms red flash** and **four 85 ms legacy impact frames**; this 340 ms hit window ends the damaging animation at **2.84 seconds**. Large Fire drops a meteor from above Fire toward Water; large Water sends a wave from behind Water toward Fire. Fire-3, Fire-10, Water-3 and Water-10 use elemental shields; Fire-0, Fire-2, Fire-9, Fire-15 and Water-0 use power-ups. These non-damaging sequences last two seconds, with results shown at 500 ms. **Fate has no animation.**

A successful Enhancement plays its two-second elemental jump **after its Fate chain ends**, showing the award at 500 ms; a final modified total below 6 shows **MISS** without an animation. Aura forms for 500 ms, then holds a full one-second particle loop before controls unlock at 1.5 seconds. Its green ring keeps looping under the wizard's feet through three subsequent owner turns, excluding activation, and fizzles for 500 ms at expiry. Reconnecting restores an active ring without replaying its formation. Reduced motion completes action visuals immediately and shows active Aura as a static ring.

The engine resolves and saves each action once. Mana costs are paid normally; displayed results update at impact, battle actions wait for the animation to finish, and victory appears afterward. Newly completed local and online actions animate once; reloading or resuming does not replay history. Health bars ease in and out over 800 ms from impact, including healing, and keep moving through display updates. Victory also waits until the losing bar reaches zero. Animation callbacks do not apply combat effects or alter saved decks.

The Seattle map keeps its existing square landmark bitmap, ocean, islands and geography. **Fit / 1×** fills the map panel; panning and zooming move the city and grey Storybook markers together. The approved rough Home atlas supplies the live frames, header, toolbar and navigation-button artwork through CSS crops. Its source PNG remains unchanged, and runtime copies use the lossless optimized-art pipeline. Controls retain their existing actions and stay outside the map. The page backdrop remains separate from the map panel. No district mini-map art, GPS system or quest engine is added; card, deck, combat and account functions are unchanged.

The approved combat set is preserved in [designs/animation-previews/v2-one-second](designs/animation-previews/v2-one-second/README.md): ten unchanged PNG sheets for Enhancement, Aura, casts, attacks, shields, power-ups, projectiles and hit reactions, with lossless optimized copies. Each held-effect sequence has eight moving frames at 125 ms each for a full one-second linger. The separate gallery and ZIP at `previews/combat-linger-v2/` remain artwork references. Live targets use the original quick hit response; the longer v2 hit-reaction sheet remains available in that reference pack.

Wizards stand on the grass around logical y450. Stat panels begin at y480, with the hand and turn controls on the stone-and-dirt area below. The hand has three slabs in the top row and up to three in the bottom row (with two centered for a five-slab hand), with the discard and tower signs at its sides. Both wizards' Enhancement percentages and Aura countdowns appear on the left of the hand frame. The right side shows one Fire-red or Water-blue Enhancement button for the active wizard, with a green Aura button below. The refresh drawer keeps its existing behavior, and the combat log opens over the board without changing the forest dimensions.

Use **Larger view** for a larger, scrollable portrait board and **Fit screen** to return. Optional Ember spending opens a compact popup above the selected slab only when Embers are available; the battle stays visible. Spells without an Ember choice cast directly, and mandatory all-Ember spending remains automatic.

## Implemented rules

- Both wizards start at **100 HP**, with **3 Mana**, zero Shield, zero Embers/Flow, zero Loaded, **0% Enhancement**, and no active Aura. Caps are **100 HP, 10 Mana, 30 Shield, 5 Embers/Flow, and 30% Enhancement**. Aura supplies a separate fixed **10%** while active.
- Each saved deck deals **up to 5 opening slabs**, limited by its available cards. Both players roll one opening d6; higher starts and ties reroll both. Fate and Loaded do not modify initiative. The second player draws one extra slab when their first own turn starts, **only if a tower card is available**, up to the six-slab hand limit.
- **Start new shared-screen duel** deals a fresh opening hand using the saved decks. **Resume saved shared-screen duel** keeps the existing hands and progress; it does not deal an opening hand again. Later turn draws and hand refreshes fill up to six in either case.
- A round is one turn per wizard, starting with the initiative winner. Each wizard gains **2 Mana** and draws up to six at the beginning of their own turns after their opening turn. Unspent Mana carries over up to the cap.
- Each player uses **one main action per own turn**: cast a primary spell, attempt Enhancement, or activate Aura. Fire and Water slabs are primary spells; Fate does not use this allowance. Cast Spell pays printed Mana and permitted Ember spending. Optional spending uses a compact popup above the slab when Embers are available. Fire-7 and Fire-14 automatically spend all Embers.
- Of the **31 primary spells**, only **Fire-0** resolves immediately: **0 Mana, gain 1 Ember**, capped at 5, without dice, Fate or Loaded consumption. The other **30 primaries** roll **2d6**, including **Fire-15** and **Water-0**, both costing **0 Mana**. Fire-15 gains **1 Ember**, plus **1 Mana on a final Modified Roll of 7+**. Water-0 gains **1 Mana on 7+**, then receives the normal **1 Flow** Water passive after resolution **even below 7**. Mana caps at 10 and Flow/Embers at 5. Both use the primary slot, normal eligible Loaded and post-roll Fate, and retain their power-up animations. After commitment, the roll and eligible Loaded are displayed before Fate. Higher thresholds replace lower outcomes of the same effect; separately printed additional effects still apply.
- Fate is an **open response chain** for spell rolls and Enhancement rolls, starting with the defender and alternating after each response. Select and cast **one eligible Fate slab at a time**. Each cast gives the other player a response and resets the consecutive-pass count. **Two consecutive passes** end the chain and resolve the pending spell or Enhancement; a player without eligible Fate passes automatically. A player who passed can respond again if a later Fate slab is played. There is no three-window limit.
- Fortune gives **+4** to the caster of the pending spell or Enhancement; Misfortune gives **−4** when used by that caster's opponent. These roles stay fixed throughout the chain. Either player may choose **+2 or −2** for each Twist. Skip Fate clears the staged selection and passes. Fate updates the Modified Roll without rerolling the original dice; the displayed total includes both players' modifiers and may be negative.
- **Enhancement** starts at **0%** for each player. Once on the active player's own turn, **instead of a primary spell or Aura**, they may pay **0 Mana** to roll **2d6 once**, then use the ordinary defender-first Fate chain. The **final Modified Roll** determines the highest qualifying award: **6–8 adds 10 percentage points**, **9–11 adds 20**, and **12+ adds 30**. Award it **once after the chain closes**, adding to stored Enhancement up to **30% total**; below 6 gains nothing. A failed attempt still uses the main action. The bonus stays banked until the player's next outgoing damaging primary spell resolves, then resets to **0%**, even if Shield absorbs all damage. Non-damaging spells, Fate and self-damage preserve it. A new duel resets it, and reaching the cap disables further attempts until it is consumed.
- **Aura** costs **1 Mana** and uses the turn's main action instead of a spell or Enhancement. It immediately grants a fixed **10% outgoing damage bonus** for **three subsequent turns of its owner, excluding the activation turn**. It does not stack and cannot be recast while active; it can be activated again after expiry. The counter starts at three and stays at three when activation ends. It then decrements only when that owner actually passes each of their next three turns, including a confirmed hand refresh. Opening End Turn or selecting refresh cards does not advance the countdown; opponent turns do not reduce it.
- Enhancement uses Fate but **does not apply or consume Loaded** and grants no Embers/Flow. Aura has no dice roll or Fate window, leaves Loaded unused, and grants no Embers/Flow. Existing unused Loaded still expires at the end of its owner's turn. Any of the three main actions prevents the other two that turn.
- Enhancement and Aura add together, up to **40%**, and apply to the spell's **total outgoing damage**, including threshold, Flow and Ember contributions, **before Shield absorbs damage**. Round once to the nearest whole number, with halves rounded up: 15 damage at 10% becomes 17; 20 with 30% Enhancement and 10% Aura becomes 28. Neither bonus increases self-damage, healing, resource gains, Shield gains or Shield removal. Enhancement is consumed on damaging resolution; Aura stays active until its countdown expires. The combat log records both percentages, base and boosted damage, Shield absorption and HP damage.
- Loaded gained from a spell queues for that wizard's **next own turn**, stacks, applies once to that turn's first spell roll, and expires **only when that turn actually passes** if unused. Opening End Turn or staging a refresh does not expire it. A bonus earned this turn does not modify this turn's roll.
- Opponent damage consumes Shield before HP. **Self-damage bypasses the caster's Shield.** Shield removal happens before damage when printed. Healing stops at 100 HP; reaching zero HP ends the duel.
- Fire gains only printed Embers, capped at five. Chosen spending is paid before resolution. Fire does not gain an automatic Ember for casting.
- Water damage and healing use **Flow before resolution**. After the spell's effects, every Water spell grants **1 Flow**. Printed **additional Flow** adds to that default, capped at five. Water-2 on 8+ grants two Flow total; Water-9 always grants two Flow total. Fate grants no automatic Flow.
- After a primary spell, Enhancement attempt or Aura activation, Cast Spell, Enhancement and Aura stay disabled until that player's next own turn. Active Aura also prevents recasting it, and 30% Enhancement prevents another attempt. End Turn reveals Hand Refresh and turns red. End Turn again passes without refreshing. Hand Refresh turns red, lets the player select any number of slabs including zero, then discards those selections, draws up to six, and passes immediately on confirmation. End Turn during selection passes without applying staged discards.
- With no dialog open, **click or tap noninteractive battle background, including the outer gutters**, to cancel an unconfirmed End Turn drawer or Hand Refresh selection and return to the main phase with its marks cleared. The same gesture clears an uncommitted primary or Fate selection; clearing Fate keeps the same responder and pass count. Cards and other controls keep their normal actions. Cast Spell, Cast Fate, Skip Fate and confirmed refreshes/passes commit immediately and cannot be undone this way. Canceling staging never restores an already-used main action; unused Loaded expires and Aura counts down only on the actual pass.
- Pending spell or Enhancement dice, Fate decisions, and resolution block ending the turn. Spell Tower and discard counts track card movement; the played primary is discarded once. Enhancement uses no primary slab, but Fate played for it is discarded normally. Aura uses no slab. Local control changes use handoffs. Read Slab shows full text, and Spell Tower lists deck composition without exposing draw order.
- Version **14** saves use the `nov4-v2.1` catalog and validate pending spell/Enhancement Fate chains, dice, stats, zones, Enhancement, Aura, turn allowances and refresh progress. Current-catalog versions **10–13** migrate. Version 13 retains hands, decks, banks, Aura and counters; already-awarded Enhancement outcomes keep their historical award and are not replayed or recalculated. A saved Enhancement awaiting its first roll now gets the new Fate chain after that roll. Version 12 retains Enhancement and starts with no active Aura; versions 10/11 start with 0% Enhancement and no Aura while their older Fate history is upgraded. Guest deck storage is unchanged, and existing 30-slab decks remain valid. Old-catalog duels remain retired; old deck IDs are not reinterpreted as new cards, and account migration retains credentials while archiving replaced old deck data.

## Spellbook and custom decks

`src/spells.js` contains **31 definitions** transcribed from **Wizzy Master Spellbook Nov4.pdf**, *Master Spellbook V2.1*, dated November 4, 2026: Fire-1 through Fire-14, Water-1 through Water-14, and Fortune/Misfortune/Twist. The user-defined **Fire-0, Fire-15 and Water-0** make 34. Fire-15's rule is “Gain 1 Ember. On a 7+, gain 1 Mana”; Water-0's is “On a 7+, gain 1 Mana.” Water-0's Flow comes from the standing Water passive. Spell IDs, existing decks and save/book compatibility are retained. Effects execute in `src/effects.js`; combat timing lives in `src/game.js`.

The user's instructions explicitly replace the previous catalog and override the PDF's older pre-roll Fate timing and its experimental-version note. Fire and Water Mana costs and effect descriptions retain the PDF wording. The PDF leaves Fate Mana unspecified; the game retains its existing **0 Mana** Fate cost pending another ruling. There are no prescribed Fire/Water decklists in this release.

See [spell IDs, Mana costs, construction rules, and the JSON decklist format](docs/decklists.md).

## Current limits

If the tower runs out, drawing stops, so automatic draws and hand refresh can produce fewer than six cards. No reshuffle or fatigue rule is invented. There is no AI opponent. Online rooms currently support Fire versus Water, use in-memory match storage, and do not add a turn-timeout rule, friend lists, chat, or photo uploads. Username/password accounts and saved decks use persistent SQLite storage when the configured database file is retained.

The in-game settings/handbook describes the active rules and local two-player flow.

## Project structure

- `src/spells.js` — current master spell metadata, catalog version, and PDF source references.
- `src/decks.js` — deck construction, empty/ready slot validation, JSON import/export, and the 30-slab total.
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
- `src/hub-storage.js` — stable guest/device save keys, compatible recovery and account separation.
- `public/graphics/` — unmodified uploaded PNG graphics.
- `public/optimized/` — pixel-identical, hashed WebP copies and generation manifest.
- `public/art/` — earlier prototype art and the application favicon.
- `test/game.test.js` — phase locks, refresh, conservation, drawing, damage, victory, and save tests.
- `test/decks.test.js` — full-deck and draft validation, element restrictions, quantities, and the 30-slab total.
- `docs/decklists.md` — current catalog reference, custom-deck construction, portable format, and combat rules.
- `docs/multiplayer.md` — two-device local setup, remote hosting resources, room flow, and troubleshooting.
- `server/` — authoritative room server, private player views, SQLite accounts/decks/sessions, validation, and built-frontend serving.
- `Dockerfile` — optional Node 24 container build for a room-server host.
- `scripts/` — Node server, static build, GitHub Pages deployment, and optional artwork optimizer.

Automated checks cover the current catalog, costs and thresholds, caps, Flow timing, optional and mandatory Ember spending, self-damage, open post-roll Fate chains and passes, Twist signs, Loaded timing, Enhancement attempts and consumption, Aura cost and owner-turn expiry, combined damage rounding, compact slab text, custom-deck validation and transfers, turn/refresh rules, card conservation, accounts, room privacy, and save compatibility. Browser checks exercise the rendered collection, deck workflow, battle controls, and responsive layout.
