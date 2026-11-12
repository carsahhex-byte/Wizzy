# Accounts and two-screen multiplayer setup

Wizzy supports shared-screen battles, guest room-code battles, and username/password accounts with saved decks. Every player gets the same map, profile, slab collection, filters, and deck editor. Signing in on another device loads that account's profile and saved Fire, Water and Earth decks; guest decks remain local to their device.

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

The local address and GitHub Pages have separate browser storage. To reuse a deck from the website, open **Deck → Download deck** there, then open the local app's **Deck → Upload deck**, choose the JSON file, and press **Save deck**. Otherwise build and save a new deck of 1–30 slabs locally. Each phone needs the saved deck for the element it will play; it does not need decks for every element.

On each phone, open **Battle → Play on two screens** to reach **Battle Portal**. Its **Game server address** normally fills with the local app's address, such as `http://192.168.1.20:8787`. If older saved settings show another address, replace it with the same local address on both phones. Enter a wizard name. One phone chooses Fire, Water or Earth and taps **Create battle →**; the other chooses its own element, enters the shared eight-character **Room code** and taps **Join →**. Each phone uses its selected element's saved deck. Both may choose the same element. Both players then complete their opening die rolls.

## Current named spellbook

New rooms use the sole active collection: **Heatbox, Blaze, Charred Blade, Xineoph, Sunsetter, Anti-Furnace; Sea bolt, Swell, Carbonate, Pacific, Poseidon's Rift; OffoDefo, Bengal Shield, Earthbound, Merciful, Tectonic, Metamorphic; and Fortune, Misfortune, Twist**. The old Spellbook 1/2 selector is removed. Stable IDs retain the `spellbook-2` storage identity, with Fire-6 replacing Fire-5. Save a legal Fire, Water or Earth deck before creating or joining a room; old-collection rooms cannot be newly created through a stale client.

Guest and account saved data from earlier collections remains backed up. Existing current-book decks are preferred; former Fire-5 copies are replaced with Charred Blade for deck review. Retired cards are reported instead of silently becoming new spells. Historical paid casts and completed results are not replayed. An unsafe old testing duel containing Fire-5 is archived, and a new duel uses the reviewed saved deck.

For this release, pull the latest source, run `npm run build:production`, and restart `npm run multiplayer`. Clients and servers must both use combat rules **`earth-golem-v3`** and save version **16**. Updating the website alone does not update a running game server; rebuild and restart that server before creating or joining a room. Existing rooms end on restart. The spellbook compatibility family remains `nov4-v2.1`, so saved Fire and Water decks remain available. Older account records gain empty Earth slots, and older clients that omit Earth when saving cannot erase a saved Earth deck. Earth-3 costs 2 Mana and gains 12 Shield on 7+ after its 5 damage. Earth-4 costs 4 Mana, always gains 3 Shield, and on a final 6+ after dice and Fate makes all damage received during the next opposing turn bypass its caster’s Shield and hit HP. The status lasts through opposing end-turn effects, then expires; it does not grant Golem protection or Mana. Other Mana costs, Fate, Enhancement and Aura retain their rules. Each held Ember adds 5% outgoing Fire damage, capped at 25%; the bank is consumed by outgoing Fire damage before new printed gains. Charred Blade, Sunsetter and Blaze have the revised effects below.

## Create an account and sync decks

1. Open **Account** from the title or Character screen and use the same server address on both devices.
2. Register a username and password. Usernames contain 3–24 letters, digits, underscores, or hyphens and are case insensitive. Passwords contain 10–128 characters. Registration imports that device's current saved profile and current-spellbook deck slots. An element slot may remain empty while you build its deck.
3. On another device, sign in with the same credentials. The account's profile and saved decks load into the same UI and editor.
4. Open **Deck**, build a Fire, Water or Earth deck of **1–30 slabs**, and press **Save deck**. **Upload deck** loads a compatible JSON decklist into the editor for review, and **Download deck** exports a legal nonempty deck. Valid saved decks and profile changes sync while signed in. Editor drafts remain on the device, and changing decks does not alter a match already in progress.
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

1. Sign in if you want account-backed decks, or continue as a guest. Build and save a legal deck for the element you will play. Shared-screen duels use the saved deck for each chosen element, including the same deck in a mirror match; each two-screen player only needs their own chosen element's saved deck.
2. Open **Battle → Play on two screens**, or **Friends → Create or join a battle**. In Battle Portal, both devices use the same **Game server address** and enter their wizard names.
3. The host chooses Fire, Water or Earth and taps **Create battle →**. Share the eight-character **Room code**. The other player independently chooses Fire, Water or Earth, enters the code and taps **Join →**. Each uses their own selected school's saved deck; all pairings, including mirror matches, are allowed.
4. Each player rolls **one d6** to decide who starts. Higher goes first; ties reroll both. Fate and Loaded do not affect initiative.
5. Each player starts with **up to five slabs**, limited by their deck's cards. The second player draws **one extra slab when their first own turn begins if a tower card is available**, up to the six-slab hand limit. If they already used Fate, this adds one to the remaining hand rather than filling it to six. Small decks may have no opening tower cards. Neither player gains the later-turn +2 mana on their opening turn; empty towers do not reshuffle or cause fatigue damage.
6. Both wizards start at **100 HP** with **3 Mana**. Mana is capped at **10**, Shield at **30**, and Embers/Flow at **5**. After the opening turn, each wizard gains two Mana at the beginning of their own turn.
7. All **15 active primary spells roll 2d6**. Blaze costs 0 Mana and gains 1 Ember, plus 1 Mana on a final Modified Roll of 6+. Swell costs 0 Mana and guarantees 1 Mana on cast before dice, capped at 10; after resolution it gains normal 1 Flow plus 1 extra on 7+, capped at 5. Both use the primary slot, normal eligible Loaded and post-roll Fate. The defender responds first after the roll, then players alternate one Fate slab at a time. Every cast resets the pass count; two consecutive passes resolve the spell, and an empty eligible Fate hand passes automatically. Fortune is caster-only (+4), Misfortune defender-only (−4), and either player chooses +2 or −2 for Twist.
8. Each turn allows **one main action**: a primary spell, an Enhancement attempt, or Aura activation. Enhancement costs **0 Mana**. The server rolls **2d6 once**, then opens the ordinary defender-first Fate chain described above. Fortune is for the Enhancement caster, Misfortune for their opponent, and either may use Twist. After two consecutive or automatic passes, the **final Modified Roll** awards the highest qualifying tier **once**: **6–8 adds 10 percentage points**, **9–11 adds 20**, and **12+ adds 30**, up to **30% stored total**. Below 6 gains nothing; failure still uses the action. The percentage is banked until the next outgoing damaging primary spell resolves, then resets to **0%** even if Shield absorbs all damage. Non-damaging spells, Fate and self-damage preserve it; a new duel resets it. Enhancement uses no primary slab, but played Fate goes to discard. **Loaded does not apply or get consumed**, and no Ember/Flow is gained. Normal end-of-turn Loaded expiry still applies.
9. **Aura** costs **1 Mana** and immediately gives a fixed **10% damage bonus** for **three subsequent owner turns, excluding its activation turn**. It uses the main action with no dice or Fate, grants no Ember/Flow and leaves Loaded unused. Aura cannot stack or be recast while active, but may be used again after expiry. The counter stays at three when activation ends, then decreases only when the owner passes each of their next three turns, including a confirmed hand refresh. Opening End Turn, selecting refresh cards or playing the opponent's turn does not decrease it.
10. Enhancement and Aura add together up to 40%. Outgoing Fire attacks also add 5% per held Ember, up to 25%, for a maximum combined 65%; Water receives no Ember percentage. Damage uses the counter before new printed Ember gains. Round once before Shield, halves up. No percentage amplifies healing, Shield gains/removal, resources or self-damage. Outgoing damaging Fire resolution consumes the held Ember bank before new printed gains, even if Shield absorbs all damage. Embers have no turn or round expiry; non-damaging spells, Water damage and self-damage preserve them. Damaging resolution consumes Enhancement, while Aura follows its countdown. Sunsetter has no Ember-spending cost and receives the held-Ember bonus normally. A round ends after both wizards have played, even when Water goes first.

Earth transforms into Golem on reaching **20 Shield**. Golem state and protection are public on both screens. At an actual end-of-turn pass, an unprotected Golem below 20 Shield reverts. A Golem that remains active automatically deals **15 normal damage**, with Shield absorbing damage first. This automatic strike receives no Enhancement or Aura bonus and does not consume Enhancement. Opening or canceling End Turn cannot trigger it.

The server accepts `enhance` and `aura` actions with empty payloads. It rolls Enhancement itself, validates each Fate response, and awards Enhancement only after the chain ends; it also enforces Aura's fixed cost, bonus and duration. Out-of-turn actions, reuse of a spent main action, Enhancement at 30%, and recasting active Aura are rejected. Both players receive the resulting bonuses, Aura countdowns and damage breakdown. The hand frame's right side shows one active wizard's Fire-red or Water-blue Enhancement button, with a green Aura button below. Both wizards' Enhancement labels and Aura countdowns sit on the left. All three main-action controls disable after one is used. Update the running server as well as the interface for these rules.

The current release retains Xineoph (Fire-11) at **2 Mana** and Carbonate (Water-12) at **3 Mana**. Xineoph deals 10 damage, gains 2 Embers and gains 1 Mana on 7+; previously queued Loaded remains available. Swell (Water-0) grants its Mana on cast. Charred Blade (Fire-6) remains 5 Mana, deals 20 base damage, or 30 and gains 2 Embers on 7+, with no separate 10+ tier. Sunsetter (Fire-14) remains 8 Mana and deals 55 base damage, or 65 on 8+, without an Ember-spending cost. Blaze (Fire-15) gains 1 Ember and gains Mana on 6+. Xineoph at 3 Embers deals 12 from its 10 base, consumes its held bank, then ends at 2 Embers. Charred Blade on 7+ at 5 Embers deals 38, then ends at 2. Sunsetter on 8+ at 5 Embers deals 81, or 107 with maximum Enhancement and Aura, then ends at zero. Paid Mana and completed historical outcomes are not refunded, recalculated or replayed on load. A pending old Sunsetter restores previously reserved Embers once, then uses and consumes them under the new rule.

All **18 active slabs** use the same proportional rules size—17 px at a 170 px card width. Titles remain above centered rules, thresholds remain bold, and a large yellow upper-left number shows Mana cost. Original shared artwork remains intact; Xineoph uses the former phoenix illustration, and Charred Blade receives a new rough-pixel flaming sword. Charred Blade is a 5-Mana simple cast; Swell retains its Water power-up. Read Slab shows complete wording, and accessibility labels retain full effect text.

Each player sees only their own hand and can act only at the appropriate step. Room revisions and request IDs prevent stale or retried requests from applying a move twice.

With no dialog open, click or tap elsewhere—including another control or the outer gutters—to cancel an unconfirmed End Turn drawer or Hand Refresh choice and clear its marks. The clicked control then acts if valid; a card clicked from the End Turn drawer is selected in the main phase. Card checks keep Hand Refresh open, and clicking its red confirmation discards the selected cards and passes immediately. Clicking End Turn during refresh instead cancels the refresh and opens a fresh End Turn choice; only another End Turn click passes. Background taps also clear a staged primary/Fate slab; clearing Fate keeps the same responder and pass count. An online cancellation may wait for an in-flight reversible choice to sync, and is limited to that same room, player, turn and response. Cast Spell, Cast Fate, Skip Fate and confirmed refreshes/passes commit immediately and cannot be undone. A spent main action stays spent. Loaded expiry and Aura's countdown happen only when the turn actually passes, so merely opening or canceling End Turn/refresh changes neither.

Both screens use the approved v2 caster and projectile animations. After Fate closes, damaging spells have a one-second caster charge, release at 1.5 seconds, and impact after a one-second flight at 2.5 seconds. The target keeps its standing pose with the original quick 210 ms red flash and four 85 ms legacy impact frames; the 340 ms hit window finishes at 2.84 seconds. Non-damaging spells last two seconds with results shown at 500 ms. Successful Enhancement does the same **after its Fate chain closes**; a final Modified Roll below 6 shows **MISS** without animation. Aura has 500 ms of formation plus a one-second activation hold, then its green ring loops until expiry after three subsequent owner turns, with a 500 ms fizzle. Reconnecting restores the current ring without replaying activation or old spells. Reduced motion settles action visuals immediately and displays a static active ring.

The server remains authoritative and resolves each action once. Each browser holds displayed results until impact, keeps the existing 800 ms HP easing, and blocks battle actions and victory until the presentation finishes. Victory also waits for the losing HP bar to reach zero after the quick hit. Animation callbacks do not apply combat effects or alter saved decks. The gallery and ZIP remain artwork references, including the longer v2 hit-reaction sheet; live targets use the original quick response. Original PNG pixels are preserved with lossless runtime copies.

## Reconnecting and storage limits

Account data and room data have different lifetimes:

- **Accounts, saved decks, and account sessions** persist when the SQLite database file is retained. Signing in from another device loads the saved profile and decks.
- **Active battle rooms** remain in memory and expire after six hours without authorized activity. Restarting, redeploying, or sleeping the server can end active matches even though accounts still exist.
- **Guest profiles, local duels, and incomplete drafts** remain in browser storage on that device.

Keep the same browser profile to reconnect to the same room seat. Clearing browser storage removes that device's room token; signing back into an account restores its decks, not a lost room seat. Normal and private windows do not share these tokens.

The current combat save version is **16** with the November 4 catalog. Current-catalog versions **10–15** migrate. Version 15 retains decks, paid effects, Golem form and previously earned protection while receiving an inactive incoming-damage bypass status. Version 14 keeps its exact hands, decks and paid effects while receiving school and inactive Golem defaults. Version 13 retains hands, decks, Enhancement, Aura and counters; completed Enhancement outcomes keep their historical awards without replay or recalculation. An Enhancement saved before its first roll now gets the new post-roll Fate chain. Version 12 retains Enhancement with no active Aura; versions 10/11 start with 0% Enhancement and no Aura while their earlier Fate history is upgraded. Guest deck storage and deck-file compatibility are unchanged, including existing 30-slab decks. Old-catalog local duels and room sessions remain retired. Account migration retains credentials and archives replaced old deck data. Update both the interface and room server for Enhancement Fate support; redeploying the server replaces its in-memory rooms, so both players should reload and create a new room.

Storybook shows only numbered **Mainquest** labels and assigned boss names per district, leaving unassigned bosses blank. Its beige pixel-paper view uses the slab cards' font style. Opening the general Storybook shows all districts collapsed; leaving it clears expanded entries. The same 14 grey map markers 1–12, 14 and 15 open only their own district. District 14 remains South Lake Union, and 15 combines Seattle Center with Queen Anne; 13 and 4.5 remain removed. The approved rough 8-bit Home UI is now live, with navy/indigo, wood and parchment artwork on its header, map frame, toolbar and navigation buttons. The map bitmap/geography, Storybook behavior and card/deck/combat/account functions are unchanged. The same static view is available to guests and signed-in players; GPS gating, quest completion, rewards and mini-map screens are not added. Friend lists, messaging, photo uploads, matchmaking and turn timeouts remain outside this release.

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

Anti-Furnace and Metamorphic are additive current-book cards; existing deck storage keys and portable deck versions remain compatible. Metamorphic uses public, server-owned prior-turn damage totals and rounds half damage down. Deploy the updated room server together with the client: the combat-rules handshake rejects older server builds instead of resolving these spells with old rules.
