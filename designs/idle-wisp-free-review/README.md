# Wisp-free idle sprite review

This is a private, offline draft viewer for Fire, Water and Earth idle sprites. It does not install artwork in the game, change battle mechanics, publish a page or upload files.

The review uses two edited draft PNG sprite sheets: a combined Fire/Water sheet and an Earth-only sheet. The earlier Fire/Water, Earth and Air artwork remains untouched. Air is not included in this preview. The package copies the new draft PNG bytes without resizing, recompression or other image processing.

## Open the packaged review

For a single-file preview, open the separately delivered `preview.html` in Safari or another browser. It embeds both edited draft PNGs, the animation metadata, script and styles, so no folder or network connection is needed. The embedded PNGs decode to the same bytes as the draft source files.

Extract `Idle-Wisp-Free-Review.zip` and open `Idle-Wisp-Free-Review/index.html` in a browser. Keep the `art` folder alongside `index.html`. There are no network requests, JavaScript modules, external fonts or dependencies. The animation metadata, viewer script and styles are embedded inside the HTML.

The ZIP contains the regular folder preview and edited draft PNGs. It omits the separate single-file `preview.html` to avoid storing duplicate image data.

Use Play/Pause, Restart, the speed selector and the previous/next Step buttons. The slider selects playback steps 0–15. Each wizard's label shows its cycle, eye state and physical sheet-frame index, also numbered from zero. Stepping pauses playback.

There are two eight-step cycles at 160 milliseconds per step: no blink in the first cycle and one blink in the second. The first cycle holds a matching open-eyed pose in place of the closed-eye frame. The second cycle uses the normal frames, including one blink. This changes blink frequency without slowing the animation. At normal speed, the complete loop lasts 2.56 seconds. The viewer fixes each sprite's measured foot anchor to the same baseline and uses a 144-pixel target body height. Reduced-motion browser preferences start the preview paused.

## Source metadata

`metadata.json` describes:

- `frameMs: 160`, `framesPerCycle: 8`, `targetBodyHeight: 144`.
- `sheets`: PNG file, dimensions, rows/columns, measured source body height and normalized cell foot anchors for every physical frame. Fire/Water is 4×4; Earth is 4×2 under the `earthAir` logical key.
- `wizards`: exactly Fire, Water and Earth. Each has a sheet key, 16 physical-frame indices in playback order and `blinkFrames` containing the physical closed-eye frame index. A wizard can override `sourceBodyHeight` if necessary.

The packager verifies geometry, timing, blink order and original PNG dimensions. Packaged metadata includes each PNG's SHA-256 and byte count; PNG bytes are stored unchanged in the ZIP while text files are compressed.

## Rebuild the isolated package

```sh
node scripts/package-idle-wisp-free-review.js /workspace/artifacts/Idle-Wisp-Free-Review
```

The packager only writes to a separate output folder outside the repository. It refuses to overwrite unexpected files. Source PNGs, earlier previews, live game assets and production build configuration remain unchanged.
