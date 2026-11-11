(() => {
  'use strict';
  const controlIds = ['play-toggle', 'restart', 'step-back', 'step-forward', 'speed', 'sequence-step'];
  const controls = Object.fromEntries(controlIds.map(id => [id, document.getElementById(id)]));
  const errorBanner = document.getElementById('load-error');
  const timing = document.getElementById('timing');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const feetY = 218;
  const images = new Map();
  let metadata;
  let ready = false;
  let playing = !reducedMotion.matches;
  let elapsed = 0;
  let speed = 1;
  let lastTime = null;

  function fail(message) {
    ready = false;
    playing = false;
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    timing.textContent = 'Preview unavailable';
    for (const control of Object.values(controls)) control.disabled = true;
    document.documentElement.dataset.previewReady = 'false';
    document.body.dataset.ready = 'false';
  }

  function stepIndex() {
    return Math.floor(elapsed / metadata.frameMs) % (metadata.framesPerCycle * 2);
  }

  function updatePlayButton() {
    controls['play-toggle'].textContent = playing ? 'Pause' : 'Play';
    controls['play-toggle'].setAttribute('aria-pressed', String(playing));
    lastTime = null;
  }

  function paint() {
    if (!ready) return;
    const step = stepIndex();
    controls['sequence-step'].value = String(step);
    document.getElementById('step-label').textContent = `${step} / 15`;
    for (const wizard of metadata.wizards) {
      const sheet = metadata.sheets[wizard.sheet];
      const frame = wizard.sequence[step];
      const canvas = document.getElementById(`${wizard.id}-canvas`);
      const state = document.getElementById(`${wizard.id}-frame`);
      const context = canvas.getContext('2d');
      const cellWidth = sheet.sourceWidth / sheet.columns;
      const cellHeight = sheet.sourceHeight / sheet.rows;
      const scale = metadata.targetBodyHeight / (wizard.sourceBodyHeight || sheet.sourceBodyHeight);
      const width = cellWidth * scale;
      const height = cellHeight * scale;
      const anchor = sheet.frameAnchors[frame];
      const blink = wizard.blinkFrames.includes(frame);
      const cycle = Math.floor(step / metadata.framesPerCycle) + 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(images.get(wizard.sheet),
        (frame % sheet.columns) * cellWidth, Math.floor(frame / sheet.columns) * cellHeight,
        cellWidth, cellHeight,
        canvas.width / 2 - anchor.x * width, feetY - anchor.y * height,
        width, height);
      Object.assign(canvas.dataset, {frame: String(frame), sequenceStep: String(step), cycle: String(cycle), blinking: String(blink), feetY: String(feetY), targetBodyHeight: String(metadata.targetBodyHeight)});
      canvas.setAttribute('aria-label', `${wizard.name}: cycle ${cycle} of 2, ${blink ? 'blink' : 'eyes open'}, sheet frame ${frame}`);
      state.dataset.blinking = String(blink);
      state.textContent = `Cycle ${cycle} / 2 · ${blink ? 'Blink' : 'Eyes open'} · Sheet frame ${frame}`;
    }
  }

  function seek(step) {
    if (!ready) return;
    playing = false;
    elapsed = ((Math.trunc(step) % 16 + 16) % 16) * metadata.frameMs;
    updatePlayButton();
    paint();
  }

  function validateMetadata(data) {
    if (data.previewOnly !== true || data.frameMs !== 160 || data.framesPerCycle !== 8 || data.targetBodyHeight !== 144) throw new Error('Unexpected preview timing or scale.');
    const ids = data.wizards?.map(wizard => wizard.id);
    if (JSON.stringify(ids?.slice().sort()) !== JSON.stringify(['earth', 'fire', 'water'])) throw new Error('This review must contain Fire, Water and Earth only.');
    for (const wizard of data.wizards) {
      const sheet = data.sheets?.[wizard.sheet];
      if (!sheet || !sheet.file || !sheet.sourceWidth || !sheet.sourceHeight || !sheet.columns || !sheet.rows || !(wizard.sourceBodyHeight || sheet.sourceBodyHeight)) throw new Error('Missing sprite geometry.');
      if (wizard.sequence?.length !== 16 || !Array.isArray(wizard.blinkFrames) || !wizard.blinkFrames.length) throw new Error('Missing two-cycle playback sequence.');
      if (wizard.sequence.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= sheet.columns * sheet.rows || !sheet.frameAnchors?.[frame])) throw new Error('A playback frame is outside its sheet.');
      if (wizard.sequence.slice(0, 8).some(frame => wizard.blinkFrames.includes(frame)) || wizard.sequence.slice(8).filter(frame => wizard.blinkFrames.includes(frame)).length !== 1) throw new Error('The first cycle must stay open-eyed, with one blink in the second cycle.');
    }
  }

  try {
    metadata = JSON.parse(document.getElementById('idle-metadata').textContent);
    validateMetadata(metadata);
    const sheetLoads = Object.entries(metadata.sheets).map(([id, sheet]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth !== sheet.sourceWidth || image.naturalHeight !== sheet.sourceHeight) return reject(new Error('Sprite dimensions do not match the preview metadata.'));
        images.set(id, image);
        resolve();
      };
      image.onerror = () => reject(new Error('Keep both PNG files inside the art folder beside this preview.'));
      image.src = sheet.dataUrl || sheet.file.split('/').map(encodeURIComponent).join('/');
    }));
    Promise.all(sheetLoads).then(() => {
      ready = true;
      for (const control of Object.values(controls)) control.disabled = false;
      timing.textContent = `16 playback steps · 2 × 8-frame cycles · ${metadata.frameMs} ms / step · ${(16 * metadata.frameMs / 1000).toFixed(2)} s loop at 1×`;
      document.documentElement.dataset.previewReady = 'true';
      document.body.dataset.ready = 'true';
      paint();
    }).catch(error => fail(error.message));
    window.WIZZY_IDLE_WISP_FREE_REVIEW = metadata;
    window.WIZZY_IDLE_WISP_FREE_PLAYER = {seek, getState: () => ({ready, playing, step: ready ? stepIndex() : 0, speed})};
  } catch (error) {
    fail(`This review could not start: ${error.message}`);
  }

  controls['play-toggle'].addEventListener('click', () => {playing = !playing; updatePlayButton(); paint();});
  controls.restart.addEventListener('click', () => {elapsed = 0; lastTime = null; paint();});
  controls['step-back'].addEventListener('click', () => seek(stepIndex() - 1));
  controls['step-forward'].addEventListener('click', () => seek(stepIndex() + 1));
  controls['sequence-step'].addEventListener('input', event => seek(Number(event.target.value)));
  controls.speed.addEventListener('change', event => {speed = Number(event.target.value); lastTime = null;});
  document.addEventListener('visibilitychange', () => {lastTime = null;});
  function tick(time) {
    if (ready && playing && !document.hidden) {
      if (lastTime !== null) elapsed = (elapsed + Math.max(0, time - lastTime) * speed) % (16 * metadata.frameMs);
      lastTime = time;
      paint();
    } else lastTime = null;
    requestAnimationFrame(tick);
  }
  updatePlayButton();
  requestAnimationFrame(tick);
})();
