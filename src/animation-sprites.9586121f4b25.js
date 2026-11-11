import { ASSETS } from './assets.bdca32752f3b.js';

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
  const column = frame % sheet.columns, row = Math.floor(frame / sheet.columns);
  const rect = sheet.frameRects ? sheet.frameRects[frame] : {
    x: column * sheet.sourceWidth / sheet.columns, y: row * sheet.sourceHeight / sheet.rows,
    w: sheet.sourceWidth / sheet.columns, h: sheet.sourceHeight / sheet.rows,
  };
  // Explicit regions keep full-scene draft atlases from drawing extra actors.
  // Missing or invalid regions must never fall back to a whole source cell.
  if (!rect || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key]))
    || rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0
    || rect.x + rect.w > sheet.sourceWidth || rect.y + rect.h > sheet.sourceHeight) {
    hideAnimationSprite(node);
    return false;
  }
  const scale = sheet.displayScale * (sheet.frameScales?.[frame] ?? 1) * size;
  const width = rect.w * scale;
  const height = rect.h * scale;
  const anchor = sheet.frameAnchors?.[frame] || sheet.anchor || { x: .5, y: .5 };
  Object.assign(node.style, {
    display: 'block', width: `${width}px`, height: `${height}px`,
    backgroundImage: `url("${ASSETS[sheet.asset]}")`,
    backgroundSize: `${sheet.sourceWidth * scale}px ${sheet.sourceHeight * scale}px`,
    backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
    clipPath: sheet.frameClips?.[frame] || '',
    transformOrigin: `${anchor.x * width}px ${anchor.y * height}px`,
    transform: `translate(${Math.round(point.x - anchor.x * width)}px, ${Math.round(point.y - anchor.y * height)}px)${mirror ? ' scaleX(-1)' : ''}`,
  });
  node.hidden = false;
  Object.assign(node.dataset, { visible: 'true', frame: String(frame), asset: sheet.asset,
    logicalX: String(Math.round(point.x)), logicalY: String(Math.round(point.y)),
    sourceRect: `${rect.x},${rect.y},${rect.w},${rect.h}` });
  return true;
}

export function hideAnimationSprite(node) {
  node.hidden = true;
  node.style.display = 'none';
  node.dataset.visible = 'false';
}
