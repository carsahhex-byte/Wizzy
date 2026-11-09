import { ASSETS } from './assets.546c1b22a293.js';

const imageLoads = new Map();

/** Share decoded atlas requests; failed or timed-out requests can be retried. */
export function preloadAnimationSheet(sheet) {
  const source = sheet && ASSETS[sheet.asset];
  if (!source || typeof Image !== 'function') return Promise.resolve(false);
  if (imageLoads.has(source)) return imageLoads.get(source);
  const promise = new Promise(resolve => {
    let image, finished = false;
    const timer = setTimeout(() => finish(false), 4000);
    function finish(success) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; }
      resolve(success);
    }
    async function loaded() {
      try { if (typeof image.decode === 'function') await image.decode(); } catch {}
      finish(image.naturalWidth > 0);
    }
    try {
      image = new Image();
      image.onload = loaded;
      image.onerror = () => finish(false);
      image.src = source;
      if (image.complete && image.naturalWidth > 0) loaded();
    } catch { finish(false); }
  });
  imageLoads.set(source, promise);
  promise.then(success => { if (!success && imageLoads.get(source) === promise) imageLoads.delete(source); });
  return promise;
}

/** Callers choose layering and own attachment/lifecycle. */
export function createAnimationSprite(document, className) {
  const node = document.createElement('span');
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  Object.assign(node.style, { position: 'absolute', left: '0', top: '0', overflow: 'hidden',
    backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none' });
  hideAnimationSprite(node);
  return node;
}

/** Anchor a physical source cell in the board's untransformed logical pixels. */
export function paintAnimationFrame(node, sheet, frame, point, { mirror = false, size = 1 } = {}) {
  if (!sheet || !Number.isInteger(frame) || frame < 0 || frame >= sheet.columns * sheet.rows) {
    hideAnimationSprite(node);
    return false;
  }
  const width = sheet.sourceWidth / sheet.columns * sheet.displayScale * size;
  const height = sheet.sourceHeight / sheet.rows * sheet.displayScale * size;
  const anchor = sheet.frameAnchors?.[frame] || { x: .5, y: .5 };
  const column = frame % sheet.columns, row = Math.floor(frame / sheet.columns);
  Object.assign(node.style, {
    display: 'block', width: `${width}px`, height: `${height}px`,
    backgroundImage: `url("${ASSETS[sheet.asset]}")`,
    backgroundSize: `${width * sheet.columns}px ${height * sheet.rows}px`,
    backgroundPosition: `${-column * width}px ${-row * height}px`,
    transformOrigin: `${anchor.x * width}px ${anchor.y * height}px`,
    transform: `translate(${Math.round(point.x - anchor.x * width)}px, ${Math.round(point.y - anchor.y * height)}px)${mirror ? ' scaleX(-1)' : ''}`,
  });
  node.hidden = false;
  Object.assign(node.dataset, { visible: 'true', frame: String(frame), asset: sheet.asset,
    logicalX: String(Math.round(point.x)), logicalY: String(Math.round(point.y)) });
  return true;
}

export function hideAnimationSprite(node) {
  node.hidden = true;
  node.style.display = 'none';
  node.dataset.visible = 'false';
}
