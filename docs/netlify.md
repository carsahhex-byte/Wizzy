# Publish Wizzy on Netlify

The renamed 13-card spellbook is ready. GitHub keeps the source; Netlify builds and hosts the browser game. A custom domain is optional.

## One-time setup

1. Open <https://app.netlify.com/> and create an account or sign in with GitHub.
2. Choose **Add new project** (or **Add new site**) and **Import an existing project**, then choose GitHub.
3. Authorize access to **carsahhex-byte/Wizzy** and select that repository.
4. Set the production branch to **codex/wizzy-hosting**. The current game is on this branch; do not select `main` or the static `gh-pages` branch.
5. Keep the base directory empty. The committed `netlify.toml` supplies:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm run build:production` |
   | Publish directory | `dist` |
   | Node version | `24` |

6. Choose **Deploy**. When Netlify marks the deploy as published, open the provided `https://YOUR-SITE.netlify.app/#title` address.

Use the base site address for bookmarks and invitations, rather than a versioned `wizzy-<hash>.html` path. The app uses hash routes, so no SPA catch-all redirect is required. Do not rewrite `/api/*` to `index.html`.

If desired, change the generated site name to a memorable available name in Netlify's project/site settings. Availability is determined by Netlify.

## Future updates and testing

Pushing to the configured production branch lets Netlify build and publish the update automatically. GitHub Pages deployment is no longer part of that path. Netlify retains earlier deployments for rollback.

For reviewing future work first, use a pull-request Deploy Preview or enable a separate branch deploy in Netlify. Keep the stable site address for regular play. Preview addresses are different browser origins and have separate guest saves.

The game-only production build excludes the optional `previews/` and `prototypes/` directories; it retains the entire playable game and runtime artwork. It checks artwork integrity and emits content-hashed assets and modules. `netlify.toml` revalidates HTML and `build-info.json` while allowing long caching of hashed artwork.

## Keep guest decks when changing addresses

Browser storage belongs to each website origin. Before leaving the GitHub Pages address, open **Deck → Download deck** for each saved element deck you want to keep.

On the Netlify site, open **Deck → Upload deck**, review the imported cards, and press **Save deck**. Retired cards are reported for review; Fire-5 copies map to Charred Blade. Existing downloads and the old site's data remain available. Saved duels and guest profile settings do not transfer automatically.

## Accounts and two-phone battles

Netlify serves the static frontend; it does not run `server/index.js`, SQLite account storage, or multiplayer rooms. Shared-screen play works without those services.

For accounts or two-phone play, keep or deploy the existing HTTPS game server and:

1. Update and restart it with the renamed spellbook code.
2. Add the exact Netlify origin to its comma-separated `ALLOWED_ORIGINS`, preserving other allowed origins. Example: `https://carsahhex-byte.github.io,https://YOUR-SITE.netlify.app`. Do not include `/#title`, `/Wizzy/`, or a trailing slash.
3. Enter the server's real HTTPS URL in **Account** and **Battle → Play on two screens** on both phones.

Fresh `*.netlify.app` installs leave the server address unconfigured instead of trying to use Netlify as the room API. Explicit or previously saved server addresses still work. See [the server setup guide](multiplayer.md) for hosting and persistence.

If switching later to a custom frontend domain, add that exact origin to the game server as well. Guest saves will again need export/import when the website origin changes.

## Manual upload fallback

A prepared game-only ZIP can be used if you prefer not to connect GitHub yet:

1. Download and extract **Wizzy-Netlify-Upload.zip**.
2. In Netlify, choose the manual deployment option or open <https://app.netlify.com/drop>.
3. Drop the extracted **wizzy-netlify** folder. Its root contains `index.html`, `build-info.json`, `src`, `public`, and `_headers`.
4. Open the site address Netlify returns, followed by `/#title`.

The manual package contains the complete game and its artwork. Optional sprite-review galleries and the separate drawing prototype are omitted to reduce the upload size. Connected repository production builds omit them as well. For a local review build with those unchanged galleries and the experiment, run `npm run build:web` and `npm run preview`. All originals remain in the repository.

The upload ZIP is a snapshot. Later updates require another manual upload unless the project is connected to GitHub. A manual upload and a connected project may produce different site addresses; keep one stable site for regular play and its guest saves.
