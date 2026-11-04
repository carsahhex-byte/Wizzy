# Two-screen multiplayer setup

Wizzy includes two ways to play: share one screen, or connect two separate browsers to the room server. Nearby players and remote players use the same room-code flow. The first online prototype pairs one Fire wizard with one Water wizard, using each player's saved deck.

The room server runs the game rules, validates decks and moves, shuffles with server-side randomness, and rolls the dice. A player receives their own hand and public battle information. Their opponent's hand, draw order, player token, and private deck composition are not sent to that browser.

This guide sets up the server; the GitHub Pages website alone cannot run it. No hosting account has been created or paid service provisioned automatically.

## What you need

- The latest source from [carsahhex-byte/Wizzy](https://github.com/carsahhex-byte/Wizzy), on the branch containing the multiplayer update, currently `codex/wizzy-hosting`.
- [Node.js 24 LTS or a supported newer release](https://nodejs.org/en/download). The project uses built-in Node modules and has no npm dependencies to install.
- Two browser sessions. For phones, use Safari on each iPhone. For two windows on one computer, use separate browser profiles or a normal window plus a private window so they do not share the same player token.
- For nearby phone testing, a Mac or other computer on the same Wi-Fi network. For remote testing, an HTTPS Node hosting service.

TestFlight is not required to test this browser version. A later native app can connect to the same room server.

## Nearby testing on the same Wi-Fi

If the source is not already on your Mac, open Terminal and get the tested branch:

```sh
git clone --branch codex/wizzy-hosting https://github.com/carsahhex-byte/Wizzy.git
cd Wizzy
```

If you already have a checkout, use that folder and update to the latest multiplayer branch. In the Wizzy source folder, run:

```sh
npm run build:web
npm run multiplayer
```

The server listens on port **8787** by default and serves both the app and its multiplayer API. On the computer running it, open:

```text
http://localhost:8787/
```

Find that computer's local Wi-Fi address in its network settings. On a Mac, open **System Settings → Wi-Fi → Details → TCP/IP** and look for its IP address. On both phones, open that address with port 8787, for example:

```text
http://192.168.1.20:8787/
```

The example address is a placeholder; use your computer's actual address. Both phones must be on the same network, the computer must remain awake, and its firewall must allow Node to accept connections. Guest Wi-Fi networks sometimes block devices from reaching each other.

Open **Battle → Two Screens**, or the online battle option in Friends. When the app and server share this address, the server field can use the same address. Create a room on one phone, share its code, and join it on the other. Keep the terminal running for the duration of the match.

Use the locally served address for this test. A page opened from the HTTPS GitHub Pages site cannot call a plain HTTP computer address because browsers block mixed HTTPS/HTTP requests.

## Remote testing with an HTTPS host

A small Node service is enough for this prototype. [Render's Node deployment guide](https://render.com/docs/deploy-node-express-app) is one available route; the server uses plain Node HTTP and does not require Express. A Docker-capable host can use the included `Dockerfile` instead.

For a native Node web service, connect the Wizzy repository and select the branch containing the multiplayer code. Configure:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 24 |
| Build command | `npm run build:web` |
| Start command | `npm run multiplayer` |
| Health-check path | `/api/health` |
| `PORT` | Use the port supplied by the hosting service; local default is 8787 |
| `ALLOWED_ORIGINS` | `https://carsahhex-byte.github.io` when using the GitHub Pages frontend |

`ALLOWED_ORIGINS` accepts a comma-separated list of exact browser origins. An origin contains the scheme and host, plus a nonstandard port if applicable. It does **not** include a path such as `/Wizzy/`, a trailing slash, or a wildcard. Add your own domain's origin if you later move the frontend. Keep configuration in the host's runtime environment settings; do not place private player tokens in repository files or build arguments.

Once the service starts, it will have an HTTPS address such as:

```text
https://your-wizzy-server.example
```

Use the real address issued by your host. First open `https://your-wizzy-server.example/api/health` to check that it responds. Then either open the app at the server's root address, or open the existing [Wizzy website](https://carsahhex-byte.github.io/Wizzy/) and enter the HTTPS server address in **Two Screens**. Share the frontend address and room code with your friend; each browser receives its own private player token.

For ten friends, a free tier may be sufficient. A planning allowance of **US$0–$50/month** remains reasonable, depending on the provider and plan. This is not a live price quote; check current pricing, sleep behavior, bandwidth, and service limits before choosing a host.

## Create and join a match

1. Save legal Fire and Water decks in the deck builder: exactly 30 slabs, at most three copies per spell, one main element plus Neutral and Fate.
2. Open **Two Screens** and enter the server address if the frontend is hosted separately.
3. The host chooses Fire or Water and creates a room. Share the room code with the other player.
4. The guest joins with the opposite element and that device's saved deck. Fire takes the first turn.
5. Each player sees their own hand. During a rolling spell, the attacker chooses Fate first, followed by the defender; the server then rolls and resolves the spell.

The first version uses room codes rather than a full Friends account or messaging system. Only the acting player can submit a game action. Revisions and request IDs prevent stale requests or retried requests from applying a move twice.

## Reconnecting and prototype limits

The browser stores its server address and private player token on that device. Keep the same browser profile to reconnect to the same seat. A normal window and private window do not share the token; clearing browser storage also removes it. Do not share player tokens or paste them into a URL. The short room code is the part intended to be shared.

Rooms currently live in the server's memory and expire after six hours without authorized activity. Restarting the server, redeploying it, or allowing a free hosting instance to sleep can erase active rooms. Local browser saves do not restore a lost server match. For dependable longer-running tests, use an instance that stays awake; durable database storage is a later addition.

This prototype does not add persistent friend accounts, chat, photos, spectators, matchmaking, or a new turn-timeout rule. Storybook remains a placeholder. Keep the ordinary shared-screen battle available when a room server is not running.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Two Screens asks for a server address on GitHub Pages | Enter your deployed HTTPS room-server address. Pages serves the app, not the API. |
| A phone cannot reach a local server | Same Wi-Fi, correct computer address and port, computer awake, firewall permission, and network device isolation. `localhost` on a phone means that phone. |
| HTTPS frontend cannot reach an HTTP server | Open both from the local HTTP server for nearby testing, or deploy an HTTPS backend for remote testing. |
| Browser reports an origin/CORS error | Add the exact frontend origin to `ALLOWED_ORIGINS`; omit `/Wizzy/` and trailing slashes. |
| Both test windows appear to use the same seat | Use separate browser profiles or one private window. |
| A room is no longer available | Check whether the server restarted, slept, or expired the room. Create a fresh room. |
| A submitted action was stale | Let the client refresh the latest state, then select the intended action again. |

The setup resources are [Node.js downloads](https://nodejs.org/en/download), [Render's Node service guide](https://render.com/docs/deploy-node-express-app), and [Docker's installation guide](https://docs.docker.com/get-started/get-docker/). Store and TestFlight setup can follow after the two-browser flow is tested.
