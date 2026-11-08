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

Get the source if it is not already on your computer:

```sh
git clone --branch codex/wizzy-hosting https://github.com/carsahhex-byte/Wizzy.git
cd Wizzy
```

In that folder, build the app and start its server:

```sh
npm run build:web
npm run multiplayer
```

On the computer, open `http://localhost:8787/`. On both phones, open the computer's Wi-Fi IP address with port **8787**, for example `http://192.168.1.20:8787/`. Use the real address shown in **System Settings → Wi-Fi → Details → TCP/IP** on a Mac. `localhost` on a phone refers to the phone, not your Mac.

Both phones must be on the same network, the computer must remain awake, and its firewall must allow Node to accept connections. Guest networks can isolate devices. Keep the terminal running while testing.

Use this locally served HTTP address for the nearby test. The HTTPS GitHub Pages site cannot call an HTTP Mac address because browsers block mixed HTTPS/HTTP requests. Use a password unique to this private game during LAN testing.

## Create an account and sync decks

1. Open **Account** from the title or Character screen and use the same server address on both devices.
2. Register a username and password. Usernames contain 3–24 letters, digits, underscores, or hyphens and are case insensitive. Passwords contain 10–128 characters. Registration imports that device's current saved profile and current-spellbook deck slots. An element slot may remain empty while you build its deck.
3. On another device, sign in with the same credentials. The account's profile and saved decks load into the same UI and editor.
4. Open **Deck**, build a 30-slab Fire or Water deck, and press **Save deck**. **Upload deck** loads a compatible JSON decklist into the editor for review, and **Download deck** exports a complete legal deck. Valid saved decks and profile changes sync while signed in. Incomplete editor drafts remain on the device, and changing decks does not alter a match already in progress.
5. Each friend creates their own account. Signing out returns to the device's guest profile/decks.

The server stores salted password hashes and hashed 30-day session tokens, not plaintext passwords. The browser stores its private session token so it can reconnect; passwords are not saved in browser storage. Do not share account or room tokens. The short battle room code is the part intended to be shared.

This beta has no email provider or automated password recovery. Choose credentials you can retain. Persistent account storage is required for accounts to survive hosting restarts or redeploys.

Guest play remains available. Guest matches use this device's saved deck; signed-in matches use the corresponding account deck stored by the server. Both routes enforce exactly 30 slabs, no per-spell copy limit, and one element plus Fate. There are no generated starter decks or Neutral spells in the November 4 catalog. Empty account slots are allowed, but a room seat requires a complete legal deck for its role.

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
2. Open **Battle → Two Screens**, or the room option in Friends. Both devices use the same server address.
3. The host chooses Fire or Water and creates a room. Share its code. The other player joins as the opposite element using that role's saved deck.
4. Each player rolls **one d6** to decide who starts. Higher goes first; ties reroll both. Fate and Loaded do not affect initiative.
5. Both start with five slabs. The second player draws **one extra slab when their first own turn begins**, normally reaching six (the hand limit). If they already used Fate, the bonus adds one to the remaining hand rather than filling it to six. Neither player gains the later-turn +2 mana on their opening turn.
6. Both wizards start at **100 HP** with **3 Mana**. Mana is capped at **10**, Shield at **30**, and Embers/Flow at **5**. After the opening turn, each wizard gains two Mana at the beginning of their own turn.
7. Fire-0 is a **0 Mana primary spell** that immediately gains **1 Ember**, capped at 5, without dice, Fate or Loaded consumption. Fire-15 is also **0 Mana**, immediately gaining **1 Ember and 1 Mana**, capped independently at 5 and 10, with no dice, Fate or Loaded consumption. Both consume the primary action. The other 28 primary spells pay their printed cost and roll **2d6 before Fate**. The defender responds first, then players alternate **one Fate slab at a time**. Every cast resets the pass count. **Two consecutive passes** resolve the spell; no eligible Fate means an automatic pass. Passing once does not prevent responding to a later card. Fortune remains primary-caster-only (+4), Misfortune defender-only (−4), and either player chooses +2 or −2 for Twist. The same raw dice remain visible while modifiers accumulate. There is no three-window limit.
8. Each turn allows **one main action**: a primary spell, an Enhancement attempt, or Aura activation. Enhancement costs **0 Mana**. The server rolls raw **2d6**; **6–8 adds 10 percentage points**, **9–11 adds 20**, and **12+ adds 30**. Only the highest qualifying tier applies; add it to the stored percentage, capped at **30% total**. Below 6 gains nothing. Failure also uses the action. The percentage is banked until the next outgoing damaging primary spell resolves, then resets to **0%** even if Shield absorbs all damage. Non-damaging spells, Fate and self-damage preserve it; a new duel resets it. Fate and Loaded do not apply or get consumed by the attempt, and no Ember/Flow is gained. Normal end-of-turn Loaded expiry still applies.
9. **Aura** costs **1 Mana** and immediately gives a fixed **10% damage bonus** for **three subsequent owner turns, excluding its activation turn**. It uses the main action with no dice or Fate, grants no Ember/Flow and leaves Loaded unused. Aura cannot stack or be recast while active, but may be used again after expiry. The counter stays at three when activation ends, then decreases only when the owner passes each of their next three turns, including a confirmed hand refresh. Opening End Turn, selecting refresh cards or playing the opponent's turn does not decrease it.
10. Enhancement and Aura add together, up to **40%**, and increase total outgoing spell damage including threshold, Ember and Flow contributions. Round once before Shield to the nearest integer, with halves up. Neither bonus changes healing, Shield gains/removal, resources or self-damage. Damaging resolution consumes Enhancement; Aura remains until its countdown expires. A round ends after both wizards have played, even when Water goes first.

The server accepts `enhance` and `aura` actions with empty payloads. It rolls Enhancement itself and enforces Aura's fixed cost, bonus and duration. Out-of-turn actions, reuse of a spent main action, Enhancement at 30%, and recasting active Aura are rejected. Both players receive the resulting bonuses, Aura countdowns and damage breakdown. The hand frame's right side shows one active wizard's Fire-red or Water-blue Enhancement button, with a green Aura button below. Both wizards' Enhancement labels and Aura countdowns sit on the left. All three main-action controls disable after one is used. Update the running server as well as the interface for these rules.

All 33 slabs have larger live compact rules with bold roll thresholds. This readable display text preserves canonical effects; Read Slab still shows the complete wording.

Each player sees only their own hand and can act only at the appropriate step. Room revisions and request IDs prevent stale or retried requests from applying a move twice.

Both screens use the approved v2 battle animations. After Fate closes, damaging spells have a one-second caster charge, release at 1.5 seconds, impact after a one-second flight at 2.5 seconds, and finish the defender's two-second reaction at 4.5 seconds. Non-damaging spells and successful Enhancement last two seconds with results shown at 500 ms; failed Enhancement shows **MISS** without animation. Aura has 500 ms of formation plus a one-second activation hold, then its green ring loops until expiry after three subsequent owner turns, with a 500 ms fizzle. Reconnecting restores the current ring without replaying activation or old spells. Reduced motion settles action visuals immediately and displays a static active ring.

The server remains authoritative and resolves each action once. Each browser holds displayed results until impact, keeps the existing 800 ms HP easing, and blocks battle actions and victory until the presentation finishes. Spell values, IDs, Enhancement tiers, deck rules and save version are unchanged. The gallery and ZIP are references for the same approved live sheets; original PNG pixels are preserved with lossless runtime copies.

## Reconnecting and storage limits

Account data and room data have different lifetimes:

- **Accounts, saved decks, and account sessions** persist when the SQLite database file is retained. Signing in from another device loads the saved profile and decks.
- **Active battle rooms** remain in memory and expire after six hours without authorized activity. Restarting, redeploying, or sleeping the server can end active matches even though accounts still exist.
- **Guest profiles, local duels, and incomplete drafts** remain in browser storage on that device.

Keep the same browser profile to reconnect to the same room seat. Clearing browser storage removes that device's room token; signing back into an account restores its decks, not a lost room seat. Normal and private windows do not share these tokens.

The current combat save version is **13** with the November 4 catalog. Current-catalog version 12 local saves migrate with no active Aura while retaining Enhancement, hands, resources and pending progress. Version 10/11 saves additionally start at 0% Enhancement. Guest deck storage and deck compatibility are unchanged. Old-catalog local duels and room sessions remain retired. Previous browser deck data stays separate; account migration retains credentials and archives replaced old deck data. A server deployment replaces the in-memory rooms, so both players should reload the current interface and create a new room after updating the server.

This release does not add friend lists, messaging, photo uploads, matchmaking, or turn timeouts. Storybook remains a placeholder.

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
