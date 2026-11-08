# Wizzy idle wizard art preview

These Fire and Water idle animations are for review only. They have not been added to battle, and this package changes no game mechanics or combat effects.

Open `index.html` in Safari, Chrome, or Firefox to view both wizards at battle scale. Use Play/Pause, Restart, and Speed to inspect their movement. The preview respects your reduced-motion setting and starts paused when it is enabled.

The transparent PNG is the complete original sprite sheet. Fire faces right and Water faces left. `metadata.json` contains the frame order, playback timing, scale, and foot anchors used by the viewer. The PNG pixels are preserved; the viewer crops and positions frames without editing the artwork.

The ZIP includes the PNG, this README, metadata, and the complete offline browser viewer. Keep the extracted files in the same folder.

To regenerate the package from the repository:

```sh
node scripts/package-idle-review.js --output dist/previews/idle-wizards
```

This packaging command creates preview files only. It does not register artwork, build the game, or publish a site.
