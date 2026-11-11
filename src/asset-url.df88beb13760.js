import { OPTIMIZED_ART } from './optimized-art.12a4557c02c4.js';

const resolvedAssets = new Map();

// Share one decoded object URL per original embedded image in standalone games.
function embeddedAssetUrl(value) {
  if (typeof document === 'undefined' || !value?.startsWith('data:image/')
    || typeof URL.createObjectURL !== 'function') return value;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (!match) return value;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: match[1] }));
}

/** Independent artwork resolution keeps small UI helpers out of import cycles. */
export function resolveAssetUrl(key, filename) {
  if (resolvedAssets.has(key)) return resolvedAssets.get(key);
  const assetPath = OPTIMIZED_ART[key]
    ? `./public/optimized/${OPTIMIZED_ART[key].file}`
    : `./public/graphics/${encodeURIComponent(filename)}`;
  const url = embeddedAssetUrl(globalThis.WIZZY_ASSET_URLS?.[key]) || (
    typeof document === 'undefined' ? assetPath : new URL(assetPath, document.baseURI).href
  );
  resolvedAssets.set(key, url);
  return url;
}
