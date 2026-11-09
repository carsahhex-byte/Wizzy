# Spell Sketch · local drawing-duel prototype

Spell Sketch is a separate browser experiment: memorize a block outline, draw it from memory, and counter an opponent's spell with the same outline. It supports **Pass & play** for two players sharing one screen, plus solo **Practice**. It does not connect to Wizzy accounts, decks, saves or room servers, and it does not yet support a remote duel between two phones.

## Open and package

Open `index.html` directly in a modern browser, or serve this folder with any static web server. The prototype uses only its local HTML, CSS and JavaScript; it has no dependencies, external artwork or network requests.

From the Wizzy repository root, package the separate hosted page and downloads:

```sh
node scripts/package-glyph-duel.js
```

The output lives under `dist/prototypes/glyph-duel/`, including the hosted `index.html`, a fresh **`spell-sketch-16x16-creator.html`** launch page, the updated earlier `spell-sketch-16x16.html` alias, a self-contained **`spell-sketch.html`** that can be opened offline, and a ZIP. Packaging this experiment does not rebuild or change the live Wizzy game. Open the [shape-creator edition](https://carsahhex-byte.github.io/Wizzy/prototypes/glyph-duel/spell-sketch-16x16-creator.html) to avoid a cached older page.

## Play a duel

1. Choose **Pass & play**, optionally adjust Settings, then select **Start test**. Both players start at **100 HP**; Player 1 attacks first.
2. The attacker chooses **Circle**, **Square**, **Triangle** or a saved custom shape, then studies its **16 × 16** block pattern. The default study period is **3 seconds**. The exact reference disappears before drawing begins.
3. Draw from memory with a finger, stylus or mouse. Use **Draw**, **Erase**, **Undo** or **Clear**, then finish early or let the timer lock the attempt. The ink budget counts unique occupied blocks; erasing, undoing or clearing returns those blocks to the available budget.
4. Pass the screen without showing the cast. The defender receives the **same original outline**, study period, drawing time and ink budget, then draws a counter from memory.
5. Both results are revealed together, with matched, missing and extra blocks. Damage is applied once, and the other player becomes the attacker. Reaching zero HP ends the duel.

Both players get **12 seconds** to draw in round 1. After both have taken one attacking turn, the next full round shortens the window by **1 second**, down to **4 seconds**. Study time is separate from drawing time. Timers use actual deadlines: switching tabs, hiding the page or opening a restart confirmation does not pause them. If the study timer is processed late, drawing still ends at the originally scheduled deadline rather than granting extra time.

Practice uses the same study, drawing and scoring rules without an opponent or HP damage. It shows the session's best and last accuracy, and shortens the window after each completed attempt. Reloading or restarting clears the current session; there is no saved match history. Saved custom shapes are separate from the match and remain in the local shape library.

Keyboard drawing is also available when the board is focused: arrow keys move the cursor, **Space** applies the current tool, **D / E** select Draw / Erase, and **Ctrl/Command + Z** undoes.

## Create and save shapes

Open **Create shape** from setup or the spell picker. Choose **Edit selected shape** to adjust the custom shape currently selected for testing. The editor has a **16 × 16** grid with **Draw**, **Erase**, **Undo** and **Clear** tools. Give the shape a name of **1–40 characters** and mark at least one block. A custom pattern can contain **1–256 unique blocks**; it does not have to be an outline, and the editor has no ink limit. **Create shape** saves a new pattern; **Save changes** updates the custom pattern being edited. Both close the editor and select the saved shape for testing. **Cancel** or Escape closes it without changing the saved library. The library holds up to **50 custom patterns**, with **Edit** and **Delete** controls; the three built-in shapes remain available.

The local library uses the browser-storage key `spell-sketch.custom-shapes.v1`, separate from every Wizzy save. It persists across reloads and fresh launch paths on the **same browser and origin**. It does not sync to accounts, other browsers or other devices. A downloaded file may have separate or restricted storage depending on the browser. If storage is blocked or unavailable, the editor warns that changes are available only for the current session.

Starting a cast takes a fixed snapshot of the selected pattern. The attacker and defender therefore receive the same target, time and ink budget for that turn. Later library edits or deletions do not alter an attempt already in progress.

## Ink, matching and damage

The built-in spells are deterministic outlines. Custom spells use the exact saved blocks. The default budget is **115% of the target blocks, rounded up**, capped at the grid's **256 blocks**:

| Outline | Target blocks | Default budget |
| --- | ---: | ---: |
| Circle | 28 | 33 |
| Square | 40 | 46 |
| Triangle | 30 | 35 |

Accuracy uses the Dice overlap score:

```text
accuracy = 2 × matched blocks ÷ (target blocks + drawn blocks)
```

An empty drawing scores **0%** against any valid target. Missing blocks and extra marks both reduce accuracy. **One block** matching, the default, allows a drawn block to match a target block up to one grid position away horizontally, vertically or diagonally. Matching is one-to-one: a drawn block cannot cover several target blocks, and several marks cannot receive credit for the same target. **Exact** matching removes this position grace.

Default spell power is **30**. Damage uses the unrounded accuracy fractions and rounds the final result **up once** to a whole HP:

```text
damage = ceil(spell power × attack accuracy × (1 − counter accuracy))
```

For example, an 80% cast against a 50% counter deals `30 × 0.8 × 0.5 = 12` damage. Any positive unblocked result deals at least **1 HP**; a zero-accuracy cast or perfect counter deals zero. Damage never reduces HP below zero.

Settings can change starting/minimum draw time, the decrease per round, study time, spell power, ink percentage and matching precision. Circle, Square and Triangle retain the same canonical masks throughout a session. The drawing results are shown only after the counter is locked; the defender studies the original target rather than the attacker's marks.

## Source and checks

- `index.html` / `style.css` — standalone interface and responsive layout.
- `rules.js` — outline masks, one-to-one overlap scoring, damage and round timing.
- `app.js` — local session, pointer/keyboard drawing, ink tools, hidden handoffs and deadlines.
- `shape-editor.js` — custom-pattern editor and the isolated local shape library.
- `rules.test.mjs` — deterministic masks, scoring, matching, limits, damage and timing checks.

Run the isolated rules tests from the repository root:

```sh
node --test prototypes/glyph-duel/rules.test.mjs
```

This folder has no imports from Wizzy's live game modules and uses no Wizzy storage keys. Publishing it adds a separate prototype page and downloads while preserving the existing game's build, combat rules and saved decks.
