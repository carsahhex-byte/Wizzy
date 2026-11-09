# Accounts and two-screen multiplayer setup

Wizzy supports shared-screen battles, guest room-code battles, and username/password accounts with saved decks. Every player gets the same map, profile, slab collection, filters, and deck editor. Signing in on another device loads that account's profile and saved Fire/Water decks; guest decks remain local to their device.

The server validates decks and moves, shuffles the cards, and rolls dice. Each phone receives only its own hand and public battle information. The other hand, draw order, private deck composition, and player tokens are not sent to that browser.

GitHub Pages serves the frontend. A running server is required for accounts, deck synchronization, and two-screen matches. No hosting account or paid storage has been provisioned automatically.

## What you need

- The latest source from [carsahhex-byte/Wizzy](https://github.com/carsahhex-byte/Wizzy), branch `codex/wizzy-hosting`.
- [Node.js 24 or a supported newer release](https://nodejs.org/en/download), including built-in SQLite. There are no npm dependencies to install.
- Two devices or separate browser profiles. For two windows on one Mac, use a normal window and a private window so room tokens do not share storage.
- For nearby testing, a Mac or other computer on the same Wi-Fi. For remote testing, an HTTPS Node host with persistent disk storage for accounts.

TestFlight can be configured later. The browser version tests the same account and battle service.

## Nearby testing on the same Wi-Fi

Install [Node.js 24 or newer](https://nodejs.org/en/download) on the Mac. There are no npm dependencies to install. Get the source if it is not already on your computer:

```sh
git clone --branch codex/wizzy-hosting https://github.com/carsahhex-byte/Wizzy.git
cd Wizzy
```

If you already have a checkout of this branch, open its folder in Terminal and run `git pull --ff-only` instead of cloning again.

In that folder, build the app and start its server:

```sh
npm run build:web
npm run multiplayer
```

The multiplayer server already binds to **0.0.0.0**, so it accepts connections from other devices without a `HOST` setting. Its default `PORT` is **8787**.

On the Mac, open `http://localhost:8787/`. Find its actual Wi-Fi **IP Address** in **System Settings → Wi-Fi → Details → TCP/IP**. On both phones, open Safari at that address with port **8787** and `/#title`, for example `http://192.168.1.20:8787/#title`. Replace the example with your Mac's real IP. `localhost` on a phone refers to the phone, not your Mac.

Both phones must be on the same network, the computer must remain awake, and its firewall must allow Node to accept connections. Guest networks can isolate devices. Keep the terminal running while testing.

Use this locally served **HTTP** app on both phones. The HTTPS GitHub Pages site cannot call an HTTP Mac address because browsers block mixed HTTPS/HTTP requests. No account is required for guest room-code battles.

The local address and GitHub Pages have separate browser storage. To reuse a deck from the website, open **Deck → Download deck** there, then open the local app's **Deck → Upload deck**, choose the JSON file, and press **Save deck**. Otherwise build and save a new deck of 1–30 slabs locally. Each phone needs the saved deck for the element it will play; it does not need both elements.

On each phone, open **Battle → Play on two screens** to reach **Battle Portal**. Its **Game server address** normally fills with the local app's address, such as `http://192.168.1.20:8787`. If older saved settings show another address, replace it with the same local address on both phones. Enter a wizard name. One phone chooses Fire or Water and taps **Create battle →**; the other enters the shared eight-character **Room code** and taps **Join →**. Joining automatically takes the opposite element and uses that saved deck. Both players then complete their opening die rolls.

## Create an account and sync decks

1. Open **Account** from the title or Character screen and use the same server address on both devices.
2. Register a username and password. Usernames contain 3–24 letters, digits, underscores, or hyphens and are case insensitive. Passwords contain 10–128 characters. Registration imports that device's current saved profile and current-spellbook deck slots. An element slot may remain empty while you build its deck.
3. On another device, sign in with the same credentials. The account's profile and saved decks load into the same UI and editor.
4. Open **Deck**, build a Fire or Water deck of **1–30 slabs**, and press **Save deck**. **Upload deck** loads a compatible JSON decklist into the editor for review, and **Download deck** exports a legal nonempty deck. Valid saved decks and profile changes sync while signed in. Editor drafts remain on the device, and changing decks does not alter a match already in progress.
5. Each friend creates their own account. Signing out returns to the device's guest profile/decks.

The server stores salted password hashes and hashed 30-day session tokens, not plaintext passwords. The browser stores its private session token so it can reconnect; passwords are not saved in browser storage. Do not share account or room tokens. The short battle room code is the part intended to be shared.

This beta has no email provider or automated password recovery. Choose credentials you can retain. Persistent account storage is required for accounts to survive hosting restarts or redeploys.

Guest play remains available. Guest matches use this device's saved deck; signed-in matches use the corresponding account deck stored by the server. Both routes accept **1–30 slabs**, with no per-spell copy limit and one element plus Fate. Existing 30-slab decks remain valid. There are no generated starter decks or Neutral spells in the November 4 catalog. Empty drafts and account slots are allowed for editing, but a room seat requires a legal nonempty saved deck for its role.

## Remote hosting with persistent accounts

A small Node service with HTTPS and persistent disk is enough. [Render's Node deployment guide](https://render.com/docs/deploy-node-express-app) and [persistent disk guide](https://render.com/docs/disks) describe one hosting route. A Docker host can use the included `Dockerfile`.

Connect the repository, select the tested branch, and configure:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 24 |
| Build command | `npm run build:web` |
| Start command | `npm run multiplayer` |
| Health-check path | `/api/health` |
| `PORT` | Use the host-supplied port; local default is 8787 |
| `ALLOWED_ORIGINS` | `https://carsahhex-byte.github.io` for the Pages frontend |
| Persistent disk mount | `/data` |
| `ACCOUNT_DB_PATH` | `/data/wizzy.sqlite` |

A free ephemeral filesystem is unsuitable for permanent accounts: the database can disappear on redeploy or instance replacement. Choose a plan that supports persistent disks, or move to a managed database in a later deployment. Confirm current provider prices and disk options before choosing a plan. The previous US$0–$50/month estimate is a planning allowance, not a price quote or a promise that a free plan includes durable storage.

`ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins. It contains scheme and host, plus a nonstandard port if used; omit `/Wizzy/`, trailing slashes, and wildcards. Add your own frontend origin if needed. Use HTTPS for remote sign-in and matches.

After deployment, open the host's real HTTPS address followed by `/api/health`. Then open the app from that host, or use the existing [Wizzy website](https://carsahhex-byte.github.io/Wizzy/) and enter the HTTPS server address in Account and **Battle → Two Screens**. No account secret belongs in repository files or build arguments.

## Database location and backups

Running `npm run multiplayer` stores accounts, saved decks, and account sessions in **`data/wizzy.sqlite`** by default. `ACCOUNT_DB_PATH` selects a different writable file. Keep that file outside the static `dist/` directory. Database files are excluded from Git and Docker build contexts.

The container uses `/data/wizzy.sqlite`, runs as the `node` user, and declares `/data` as its data volume. Mount a persistent named volume or hosting disk at `/data`; ensure the runtime user can write there. For a local Docker test:

```sh
docker build -t wizzy .
docker volume create wizzy-data
docker run --rm -p 8787:8787 -v wizzy-data:/data wizzy
```

Back up the data directory separately from the source repository. For a simple consistent backup, stop the server cleanly, copy the entire database directory including any `-wal` or `-shm` companion files, then restart. Treat backups as private account data. Restoring the account database does not restore in-memory rooms.

## Create and join a battle

1. Sign in if you want account-backed decks, or continue as a guest. Build and save a legal deck for the element you will play. Shared-screen duels need both saved decks; each two-screen player only needs their chosen role's saved deck.
2. Open **Battle → Play on two screens**, or **Friends → Create or join a battle**. In Battle Portal, both devices use the same **Game server address** and enter their wizard names.
3. The host chooses Fire or Water and taps **Create battle →**. Share the eight-character **Room code**. The other player enters it and taps **Join →**, automatically taking the opposite element and using that role's saved deck.
4. Each player rolls **one d6** to decide who starts. Higher goes first; ties reroll both. Fate and Loaded do not affect initiative.
5. Each player starts with **up to five slabs**, limited by their deck's cards. The second player draws **one extra slab when their first own turn begins if a tower card is available**, up to the six-slab hand limit. If they already used Fate, this adds one to the remaining hand rather than filling it to six. Small decks may have no opening tower cards. Neither player gains the later-turn +2 mana on their opening turn; empty towers do not reshuffle or cause fatigue damage.
6. Both wizards start at **100 HP** with **3 Mana**. Mana is capped at **10**, Shield at **30**, and Embers/Flow at **5**. After the opening turn, each wizard gains two Mana at the beginning of their own turn.
7. Only **Fire-0** resolves immediately: **0 Mana, gain 1 Ember** (cap 5), without dice, Fate or Loaded consumption. The other **30 of 31 primary spells roll 2d6**, including **Fire-15** and **Water-0**. Both cost **0 Mana**, use the primary slot, normal eligible Loaded and post-roll Fate, and retain power-up animations. Fire-15 gains **1 Ember**, plus **1 Mana on a final Modified Roll of 7+**; Water-0 gains **1 Mana on 7+** and gets its normal **1 Flow after resolution even when Mana fails**. Mana caps at 10 and Flow/Embers at 5. The defender responds first after the roll, then players alternate **one Fate slab at a time**. Every cast resets the pass count. **Two consecutive passes** resolve the spell; no eligible Fate means an automatic pass. Passing once does not prevent responding to a later card. Fortune remains primary-caster-only (+4), Misfortune defender-only (−4), and either player chooses +2 or −2 for Twist. The same raw dice remain visible while modifiers accumulate. There is no three-window limit.
8. Each turn allows **one main action**: a primary spell, an Enhancement attempt, or Aura activation. Enhancement costs **0 Mana**. The server rolls **2d6 once**, then opens the ordinary defender-first Fate chain described above. Fortune is for the Enhancement caster, Misfortune for their opponent, and either may use Twist. After two consecutive or automatic passes, the **final Modified Roll** awards the highest qualifying tier **once**: **6–8 adds 10 percentage points**, **9–11 adds 20**, and **12+ adds 30**, up to **30% stored total**. Below 6 gains nothing; failure still uses the action. The percentage is banked until the next outgoing damaging primary spell resolves, then resets to **0%** even if Shield absorbs all damage. Non-damaging spells, Fate and self-damage preserve it; a new duel resets it. Enhancement uses no primary slab, but played Fate goes to discard. **Loaded does not apply or get consumed**, and no Ember/Flow is gained. Normal end-of-turn Loaded expiry still applies.
9. **Aura** costs **1 Mana** and immediately gives a fixed **10% damage bonus** for **three subsequent owner turns, excluding its activation turn**. It uses the main action with no dice or Fate, grants no Ember/Flow and leaves Loaded unused. Aura cannot stack or be recast while active, but may be used again after expiry. The counter stays at three when activation ends, then decreases only when the owner passes each of their next three turns, including a confirmed hand refresh. Opening End Turn, selecting refresh cards or playing the opponent's turn does not decrease it.
10. Enhancement and Aura add together, up to **40%**, and increase total outgoing spell damage including threshold, Ember and Flow contributions. Round once before Shield to the nearest integer, with halves up. Neither bonus changes healing, Shield gains/removal, resources or self-damage. Damaging resolution consumes Enhancement; Aura remains until its countdown expires. A round ends after both wizards have played, even when Water goes first.

The server accepts `enhance` and `aura` actions with empty payloads. It rolls Enhancement itself, validates each Fate response, and awards Enhancement only after the chain ends; it also enforces Aura's fixed cost, bonus and duration. Out-of-turn actions, reuse of a spent main action, Enhancement at 30%, and recasting active Aura are rejected. Both players receive the resulting bonuses, Aura countdowns and damage breakdown. The hand frame's right side shows one active wizard's Fire-red or Water-blue Enhancement button, with a green Aura button below. Both wizards' Enhancement labels and Aura countdowns sit on the left. All three main-action controls disable after one is used. Update the running server as well as the interface for these rules.

For Fire-15 and Water-0's new **7+ Mana rules**, pull the latest source, run `npm run build:web`, and restart `npm run multiplayer`. Clients require the `conditional-mana-v1` room-rules marker and prompt you to update/restart an older server. This network check does not change save version 14 or spellbook compatibility.

Both screens show all **34 slabs: 16 Fire, 15 Water and 3 Fate**, with one proportional rules size—17 px at a 170 px card width—without shrinking longer descriptions. Titles stay above the centered rules, thresholds remain bold, and a large yellow number at the upper left shows Mana cost. Compact math and damage/healing/resource/die symbols preserve canonical effects, including optional spending, replacement versus extra outcomes, and Flow timing. Accessible text retains full words and Mana labels; Read Slab shows the complete wording. Water-0 reuses existing Water artwork; prior cards, decks and save/book compatibility are retained.

Each player sees only their own hand and can act only at the appropriate step. Room revisions and request IDs prevent stale or retried requests from applying a move twice.

With no dialog open, click or tap noninteractive battle background—including the outer gutters—to cancel an unconfirmed End Turn drawer or Hand Refresh mode and selections, or to clear a staged primary/Fate slab. Canceling Fate keeps the same responder and pass count. Cards and controls still perform their own actions. An online cancellation may wait for an in-flight reversible choice to sync, and is limited to that same room, player, turn and response. Cast Spell, Cast Fate, Skip Fate and confirmed refreshes/passes commit immediately and cannot be undone. A spent main action stays spent. Loaded expiry and Aura's countdown happen only when the turn actually passes, so merely opening or canceling End Turn/refresh changes neither.

Both screens use the approved v2 caster and projectile animations. After Fate closes, damaging spells have a one-second caster charge, release at 1.5 seconds, and impact after a one-second flight at 2.5 seconds. The target keeps its standing pose with the original quick 210 ms red flash and four 85 ms legacy impact frames; the 340 ms hit window finishes at 2.84 seconds. Non-damaging spells last two seconds with results shown at 500 ms. Successful Enhancement does the same **after its Fate chain closes**; a final Modified Roll below 6 shows **MISS** without animation. Aura has 500 ms of formation plus a one-second activation hold, then its green ring loops until expiry after three subsequent owner turns, with a 500 ms fizzle. Reconnecting restores the current ring without replaying activation or old spells. Reduced motion settles action visuals immediately and displays a static active ring.

The server remains authoritative and resolves each action once. Each browser holds displayed results until impact, keeps the existing 800 ms HP easing, and blocks battle actions and victory until the presentation finishes. Victory also waits for the losing HP bar to reach zero after the quick hit. Animation callbacks do not apply combat effects or alter saved decks. The gallery and ZIP remain artwork references, including the longer v2 hit-reaction sheet; live targets use the original quick response. Original PNG pixels are preserved with lossless runtime copies.

## Reconnecting and storage limits

Account data and room data have different lifetimes:

- **Accounts, saved decks, and account sessions** persist when the SQLite database file is retained. Signing in from another device loads the saved profile and decks.
- **Active battle rooms** remain in memory and expire after six hours without authorized activity. Restarting, redeploying, or sleeping the server can end active matches even though accounts still exist.
- **Guest profiles, local duels, and incomplete drafts** remain in browser storage on that device.

Keep the same browser profile to reconnect to the same room seat. Clearing browser storage removes that device's room token; signing back into an account restores its decks, not a lost room seat. Normal and private windows do not share these tokens.

The current combat save version is **14** with the November 4 catalog. Current-catalog versions **10–13** migrate. Version 13 retains hands, decks, Enhancement, Aura and counters; completed Enhancement outcomes keep their historical awards without replay or recalculation. An Enhancement saved before its first roll now gets the new post-roll Fate chain. Version 12 retains Enhancement with no active Aura; versions 10/11 start with 0% Enhancement and no Aura while their earlier Fate history is upgraded. Guest deck storage and deck-file compatibility are unchanged, including existing 30-slab decks. Old-catalog local duels and room sessions remain retired. Account migration retains credentials and archives replaced old deck data. Update both the interface and room server for Enhancement Fate support; redeploying the server replaces its in-memory rooms, so both players should reload and create a new room.

Storybook shows only numbered **Mainquest** labels and assigned boss names per district, leaving unassigned bosses blank. Its beige pixel-paper view uses the slab cards' font style. Opening the general Storybook shows all districts collapsed; leaving it clears expanded entries. Grey map markers 1–12, 14 and 15 open only their own district. District 14 remains South Lake Union, and 15 combines Seattle Center with Queen Anne; 13 and 4.5 remain removed. The same static view is available to guests and signed-in players. GPS gating, quest completion and rewards are not connected. The separate rough pixel map UI concept is review-only and has not changed the live map or added mini-map screens. Friend lists, messaging, photo uploads, matchmaking and turn timeouts remain outside this release.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Account or Two Screens asks for a server | Enter the same running server address on both phones. Pages serves the frontend, not the account/room API. |
| An account vanishes after redeployment | Confirm `ACCOUNT_DB_PATH` points at the mounted persistent disk and that backups exist. An ephemeral filesystem can be replaced. |
| A phone cannot reach a Mac server | Same Wi-Fi, actual Mac IP, port 8787, Mac awake, firewall permission, and device isolation on the network. |
| HTTPS page cannot reach an HTTP Mac | Open the locally served HTTP app for LAN testing, or deploy an HTTPS backend. |
| Browser reports CORS/origin error | Add the exact frontend origin to `ALLOWED_ORIGINS`, without `/Wizzy/` or a trailing slash. |
| Two test windows use the same room seat | Use separate browser profiles or one private window. |
| A room expires but the account still works | Room memory was lost or expired. Create a new room; the account deck remains in SQLite. |
| A deck update reports a conflict | Refresh the account's saved decks before retrying; another signed-in device may have saved a newer revision. |
| A move was stale | Let the client refresh the room, then choose the intended action again. |

Resources: [Node.js downloads](https://nodejs.org/en/download), [Render Node hosting](https://render.com/docs/deploy-node-express-app), [Render persistent disks](https://render.com/docs/disks), and [Docker installation](https://docs.docker.com/get-started/get-docker/). TestFlight can connect to the same service later.
