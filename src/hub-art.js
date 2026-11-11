import { ASSETS } from './assets.js';

const escapeArt = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const screenAssets = { deck:'roughDeckScreen', character:'roughCharacterScreen', friends:'roughFriendsScreen', battle:'roughBattleScreen' };
const navigation = {
  deck: [[8,156,298,139],[321,156,298,139],[634,156,300,139],[948,156,299,139]],
  character: [[8,444,298,137],[321,444,299,137],[635,444,299,137],[948,444,299,137]],
  friends: [[7,731,299,137],[321,731,299,138],[635,731,299,138],[948,731,299,137]],
  battle: [[7,1019,299,138],[321,1018,298,139],[635,1019,299,138],[948,1019,299,138]],
};

/** Presentation crops leave every approved PNG unchanged. */
export function roughHubCrop(asset, rectangle, className = '') {
  if (!ASSETS[asset]) return '';
  const [x,y,w,h] = rectangle;
  const [width,height] = ({roughNavButtons:[1254,1254],wizardIdleClean:[1254,1254],earthIdleClean:[1774,887]})[asset] || [948,1659];
  return `<span class="wz-rough-crop ${className}" aria-hidden="true" data-rough-art="${asset}" style="aspect-ratio:${w}/${h}"><img alt="" draggable="false" src="${escapeArt(ASSETS[asset])}" style="width:${width/w*100}%;height:${height/h*100}%;left:${-x/w*100}%;top:${-y/h*100}%"></span>`;
}

export function roughNavigationArt(name) {
  const states = ['normal','hover','pressed','disabled'];
  if (!navigation[name]) return '';
  return `<span class="wz-nav-art" aria-hidden="true" data-rough-navigation="${name}">${navigation[name].map((rectangle,index) => roughHubCrop('roughNavButtons',rectangle,`wz-nav-${states[index]}`)).join('')}</span>`;
}

export function roughScreenStone(screen) {
  const asset = screenAssets[screen];
  if (!asset || !ASSETS[asset]) return '';
  // Separate blank stone-only patches avoid the diagonal wooden corner braces.
  const rectangle = { deck:[40,228,32,32], character:[48,300,32,32], friends:[848,316,32,32], battle:[64,452,32,32] }[screen];
  return `<div class="wz-rough-stone-grid" aria-hidden="true">${Array.from({length:144},() => roughHubCrop(asset,rectangle)).join('')}</div>`;
}

export function roughWizardPortrait(element, className = '') {
  const portrait = {
    fire: ['wizardIdleClean',[82,49,170,241],'right'],
    water: ['wizardIdleClean',[70,674,178,242],'left'],
    earth: ['earthIdleClean',[116,66,239,344],'right'],
  }[element];
  return portrait ? roughHubCrop(portrait[0],portrait[1],`wz-approved-portrait ${className}`).replace('data-rough-art=',`data-native-facing="${portrait[2]}" data-rough-art=`) : '';
}

export function roughPartyArt() {
  return roughHubCrop('roughFriendsScreen',[110,152,730,398],'wz-approved-party');
}
