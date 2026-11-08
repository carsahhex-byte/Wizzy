(() => {
  'use strict';
  const playToggle = document.querySelector('#play-toggle');
  const restart = document.querySelector('#restart');
  const speedControl = document.querySelector('#speed');
  const timing = document.querySelector('#timing');
  const errorBanner = document.querySelector('#load-error');
  const image = new Image();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let metadata;
  let playing = !reducedMotion.matches;
  let ready = false;
  let elapsed = 0;
  let speed = 1;
  let lastTime = null;
  const stages = ['fire', 'water'].map(element => ({
    element,
    canvas: document.querySelector(`#${element}-canvas`),
    state: document.querySelector(`#${element}-frame`),
  }));

  function fail(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    timing.textContent = 'Preview unavailable';
    for (const control of [playToggle, restart, speedControl]) control.disabled = true;
    for (const stage of stages) stage.state.textContent = 'Sprite sheet unavailable';
  }

  function updatePlayButton() {
    playToggle.textContent = playing ? 'Pause' : 'Play';
    playToggle.setAttribute('aria-pressed', String(playing));
    lastTime = null;
  }

  function paint() {
    if (!ready) return;
    const cellWidth = metadata.sourceWidth / metadata.columns;
    const cellHeight = metadata.sourceHeight / metadata.rows;
    const frameMs = metadata.frameMs || 160;
    const width = cellWidth * metadata.displayScale;
    const height = cellHeight * metadata.displayScale;
    for (const stage of stages) {
      const frames = metadata.animations[stage.element];
      const relative = Math.floor(elapsed / frameMs) % frames.length;
      const frame = frames[relative];
      const anchor = metadata.frameAnchors[frame];
      const column = frame % metadata.columns;
      const row = Math.floor(frame / metadata.columns);
      const context = stage.canvas.getContext('2d');
      context.clearRect(0, 0, stage.canvas.width, stage.canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image,
        column * cellWidth, row * cellHeight, cellWidth, cellHeight,
        stage.canvas.width / 2 - anchor.x * width, 218 - anchor.y * height,
        width, height);
      stage.canvas.dataset.frame = String(frame);
      stage.canvas.dataset.relativeFrame = String(relative);
      stage.canvas.dataset.feetY = '218';
      stage.state.textContent = `${playing ? 'Playing' : 'Paused'} · frame ${relative + 1} / ${frames.length}`;
    }
  }

  try {
    metadata = JSON.parse(document.querySelector('#idle-metadata').textContent);
    if (!metadata.file || !metadata.sourceWidth || !metadata.sourceHeight || !metadata.columns
      || !metadata.rows || !metadata.displayScale || !metadata.frameAnchors
      || !metadata.animations?.fire?.length || !metadata.animations?.water?.length) {
      throw new Error('Missing sprite metadata');
    }
    const file = `./${encodeURIComponent(metadata.file)}`;
    for (const id of ['download-png', 'view-atlas']) document.querySelector(`#${id}`).href = file;
    document.querySelector('#download-png').download = metadata.file;
    document.querySelector('#atlas-image').src = file;
    document.querySelector('#sheet-details').textContent = `${metadata.sourceWidth} × ${metadata.sourceHeight} PNG · ${metadata.columns} columns × ${metadata.rows} rows · original transparent artwork`;
    const frames = metadata.animations.fire.length;
    timing.textContent = `${frames} frames · ${metadata.frameMs || 160} ms per frame · ${(frames * (metadata.frameMs || 160) / 1000).toFixed(2)} s loop`;
    image.onload = () => {
      if (image.naturalWidth !== metadata.sourceWidth || image.naturalHeight !== metadata.sourceHeight) {
        fail('The sprite sheet dimensions do not match this preview. Download the full ZIP again.');
        return;
      }
      ready = true;
      document.documentElement.dataset.previewReady = 'true';
      paint();
    };
    image.onerror = () => fail('The sprite sheet could not be loaded. Keep the preview files together or download the full ZIP again.');
    image.src = file;
  } catch {
    fail('This preview is missing its animation information. Download the full ZIP again.');
  }

  playToggle.addEventListener('click', () => {
    playing = !playing;
    updatePlayButton();
    paint();
  });
  restart.addEventListener('click', () => {
    elapsed = 0;
    lastTime = null;
    paint();
  });
  speedControl.addEventListener('change', event => {
    speed = Number(event.target.value);
    lastTime = null;
  });
  document.addEventListener('visibilitychange', () => { lastTime = null; });
  function tick(time) {
    if (ready && playing && !document.hidden) {
      if (lastTime !== null) elapsed += Math.max(0, time - lastTime) * speed;
      lastTime = time;
      paint();
    } else lastTime = null;
    requestAnimationFrame(tick);
  }
  updatePlayButton();
  requestAnimationFrame(tick);
})();
