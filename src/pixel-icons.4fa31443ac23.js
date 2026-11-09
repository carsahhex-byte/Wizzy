import { resolveAssetUrl } from './asset-url.ea7bd4354fef.js';

export const PIXEL_ICON_FILE = 'Wizzy Battle Pixel Icons.png';
const atlas = Object.freeze({width:1536,height:1024});
// Square viewports preserve every icon's proportions in a one-em text box.
export const PIXEL_ICON_CROPS = Object.freeze({ ...Object.fromEntries([
  ['fire',83,66,421], ['water',558,71,419], ['heart',1037,92,396],
  ['mana',67,530,453], ['shield',556,549,421], ['die',1043,564,381],
].map(([kind,x,y,size])=>[kind,Object.freeze({...atlas,x,y,w:size,h:size})])),
  sword: Object.freeze({width:1254,height:1254,x:164,y:168,w:924,h:924}),
});
const iconUrl = resolveAssetUrl('battlePixelIcons',PIXEL_ICON_FILE);
const swordUrl = resolveAssetUrl('battleSwordIcon','Wizzy Pixel Sword Icon.png');
const escapeIcon = value => String(value).replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));

/** Decorative image; its caller supplies the resource's accessible text. */
export function pixelIconMarkup(kind,className='') {
  if(!Object.hasOwn(PIXEL_ICON_CROPS,kind))return '';
  const crop=PIXEL_ICON_CROPS[kind];
  return `<span class="pixel-icon pixel-icon-${kind} ${escapeIcon(className)}" data-pixel-icon="${kind}" aria-hidden="true"><img alt="" draggable="false" src="${escapeIcon(kind==='sword'?swordUrl:iconUrl)}" style="width:${crop.width/crop.w*100}%;height:${crop.height/crop.h*100}%;left:${-crop.x/crop.w*100}%;top:${-crop.y/crop.h*100}%" /></span>`;
}
