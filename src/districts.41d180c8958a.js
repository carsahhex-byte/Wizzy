// Shared district positions and the minimal Storybook boss labels.
const district = (id, name, x, y, boss = '') => Object.freeze({
  id, name, position: Object.freeze({ x, y }), boss,
});

export const DISTRICTS = Object.freeze([
  district(1, 'Pike Place', .428, .581, 'Goblin'),
  district(2, 'Pioneer Square', .508, .603, 'Tsoqua'),
  district(3, 'International District', .518, .696, 'Yeng'),
  district(4, 'Atlantic', .596, .681, 'Kai’Ru'),
  district(5, 'Capitol Hill', .562, .519),
  district(6, 'Washington Arboretum', .622, .466),
  district(7, 'University of Washington', .616, .349, 'George Washington'),
  district(8, 'Northgate', .555, .151, 'Kraken'),
  district(9, 'Green Lake', .526, .269),
  district(10, 'Gas Works Park', .480, .374),
  district(11, 'Fremont', .402, .333, 'Fremont Troll'),
  district(12, 'Ballard', .330, .297, 'Freddie Footsplinters'),
  district(14, 'South Lake Union / Lake Union', .505, .436),
  district(15, 'Seattle Center', .428, .514, 'Bwizzy Leader'),
]);

const districtById = new Map(DISTRICTS.map(item => [item.id, item]));

export function normalizeDistrictId(value) {
  if (typeof value === 'string' && !/^(?:[1-9]|1[0-5])$/.test(value)) return null;
  const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(id) && districtById.has(id) ? id : null;
}

export function getDistrict(value) {
  return districtById.get(normalizeDistrictId(value)) || null;
}

/** Invalid/retired links within Storybook open its overview, never another screen. */
export function parseStorybookRoute(hash) {
  if (typeof hash !== 'string') return null;
  const route = hash.replace(/^#/, '');
  if (!/^storybook(?:\/|$)/.test(route)) return null;
  const match = /^storybook\/district\/([^/]+)\/?$/.exec(route);
  return { screen: 'storybook', districtId: match ? normalizeDistrictId(match[1]) : null };
}
