// Draft journal content. These chapters do not track arrival or completion.
const chapter = (title, actors, steps, reward = '', onward = '') => ({ title, actors, steps, reward, onward });
const district = (id, name, x, y, chapters = [], note = '') => ({ id, name, position: { x, y }, chapters, note });
const freezeDistrict = value => Object.freeze({ ...value,
  position: Object.freeze(value.position),
  chapters: Object.freeze(value.chapters.map(item => Object.freeze({ ...item,
    actors: Object.freeze(item.actors), steps: Object.freeze(item.steps),
  }))),
});

export const DISTRICTS = Object.freeze([
  district(1, 'Pike Place', .428, .581, [
    chapter('A little magic in the Market', ['The Golden Pig', 'An unnamed goblin'], [
      'Visit Pike Place to make new connections as the Seattle Freeze grows.',
      'Follow the talking Golden Pig to the Gum Wall. When a goblin appears, accept a magic stone and choose your element.',
      'Battle the goblin and begin the journey to bring warmth back to Seattle.',
    ], 'Your elemental journey begins.', 'Follow Tsoqua toward Pioneer Square.'),
  ]),
  district(2, 'Pioneer Square', .508, .603, [
    chapter('The chase through Occidental Square', ['Tsoqua', 'Two kidnapped children', 'The firemen'], [
      'Chase Tsoqua after she kidnaps two children from Pike Place.',
      'Follow her through Occidental Square and win the first major battle of your journey.',
      'Meet the firemen, who recognize your bravery and send you to Seattle’s dragon protectors.',
    ], 'Receive a spell from the firemen.', 'Meet the Dragon Trio in the International District.'),
  ]),
  district(3, 'International District', .518, .696, [
    chapter('The Dragon Trio', ['Yong', 'Yung', 'Yeng'], [
      'Meet Yong and Yung. Support a local business and return to receive a spell from each dragon.',
      'Battle Yeng to prove yourself. Follow his directions to the Cascadia fountain and recite the stone writing to receive spell materials.',
      'Return to Yong and Yung so they can infuse the slab with dragonfire.',
    ], 'New dragonfire spells.', 'Warn the spirits in Atlantic about the coming Freeze.'),
  ]),
  district(4, 'Atlantic', .596, .681, [
    chapter('A song against the Freeze', ['Jimi Hendrix'], [
      'Visit Jimi Hendrix Park and meet Jimi’s spirit.',
      'Ask someone for their favorite Jimi Hendrix song, then bring the answer back to Jimi.',
      'Learn how Enhancement can help you prepare stronger magic in battle.',
    ], 'Your first Enhancement.', 'Meet Kai’Ru, the Blade of Eden.'),
    chapter('The Blade of Eden', ['Kai’Ru'], [
      'Meet Kai’Ru near Wisteria. Beneath his sharp words is a champion devoted to ending the Freeze.',
      'Defeat him in battle and earn his trust. He becomes your guide through the next chapters.',
    ], 'Your signature spell.', 'Begin the Capitol Hill chapter at Rainbow Bridge.'),
  ]),
  district(5, 'Capitol Hill', .562, .519, [
    chapter('A place at the table', ['Kai’Ru', 'People around Capitol Hill'], [
      'Begin at Rainbow Bridge. Invite people to join you at their favorite restaurant around Capitol Hill.',
      'Share a meal with one person, or ask up to twenty people and visit one of the restaurants they suggest if nobody can join.',
      'The effort to connect matters, whether or not someone accepts the invitation.',
    ], 'A story about courage and connection.', 'Continue with Kai’Ru to Washington Arboretum.'),
    chapter('Return later: an ally for the voyage', ['Bruce Lee'], [
      'After meeting the Tlingit leader at South Lake Union, visit Bruce Lee’s memorial and ask him to join the mission.',
      'Return to the Yaadachoon with his help before the final voyage.',
    ], '', 'Return to district 14, South Lake Union / Lake Union.'),
  ]),
  district(6, 'Washington Arboretum', .622, .466, [
    chapter('Advice among the trees', ['Kai’Ru', 'People in the Arboretum'], [
      'Ask at least three people for advice and take note of their words in your Storybook.',
      'Play the Roses Game with one other person: choose a spot, set a one-minute timer, and notice something you see and feel. Keep phones and conversation away until the timer ends.',
      'The Freeze intensifies. Kai’Ru returns to help Yong, Yung, and Yeng defend the International District.',
    ], '', 'Find George Washington at the University of Washington.'),
  ]),
  district(7, 'University of Washington', .616, .349, [
    chapter('Magic across campus', ['George Washington', 'UW students', 'The Bwizzys'], [
      'Help George defend campus. Share his temporary magic stones with students and visit campus monuments and statues.',
      'Create ten photos with new people, posing together as if casting magic against the Bwizzys.',
      'Return to find George overtaken by the Freeze. Defeat him to save his spirit.',
      'With at least three other people, take one photo with hands raised to summon lightning and another pointing toward the camera to cast it.',
    ], 'The storm frees George, who rewards you with elemental spell 8.', 'Visit the Lady of the Lake at Green Lake.'),
  ]),
  district(8, 'Northgate', .555, .151, [
    chapter('The Kraken wakes', ['The Kraken'], [
      'The Freeze has awakened the Kraken beneath the stadium. Defeat it before it can consume Seattle.',
      'A distant roar reveals that more of the city’s sleeping spirits are waking.',
    ], '', 'Travel to Fremont to stop the rampaging Troll.'),
  ]),
  district(9, 'Green Lake', .526, .269, [
    chapter('Remember their names', ['Tha’le, the Soul of Eden', 'Three dogs and their people'], [
      'Meet Tha’le by the lake. Pet three dogs and take a photo with each for your Storybook.',
      'Return to the lake and remember their names. Tha’le offers Fortune when you remember, or Misfortune when you tell her you forgot.',
    ], 'Your next spell and a Fate slab.', 'Defeat the Kraken in Northgate.'),
  ]),
  district(10, 'Gas Works Park', .480, .374, [], 'No mainline chapter is assigned here yet.'),
  district(11, 'Fremont', .402, .333, [
    chapter('The Troll’s riddle', ['The Fremont Troll', 'The Turtle'], [
      'Find the rampaging Troll under the bridge and listen for the riddle in his words. The riddle itself is still being written.',
      'Solve it so he can return to slumber. Follow his invitation to the garden and meet his friend, the Turtle.',
      'The Turtle sends you to the Troll’s cousin in Ballard, who belongs to a magical brotherhood.',
    ], '', 'Find Freddie Footsplinters in Ballard.'),
  ]),
  district(12, 'Ballard', .330, .297, [
    chapter('A brotherhood’s gift', ['Freddie Footsplinters', 'Kai’Ru', 'Tha’le'], [
      'Battle Freddie Footsplinters to earn his Aura, then visit Bergen’s Place to equip it.',
      'Kai’Ru and Tha’le arrive with a warning: the Bwizzys plan to open a portal at the Space Needle and unleash the Forever Dark.',
      'Before facing them, seek the spirits who can help unite the city.',
    ], 'Aura and elemental spell 9.', 'Meet the Tlingit spirits at South Lake Union.'),
  ]),
  district(14, 'South Lake Union / Lake Union', .505, .436, [
    chapter('Gather at the Yaadachoon', ['The Tlingit spirits', 'Their unnamed leader'], [
      'Find the Yaadachoon, the ship where your allies will assemble for the battle against the Bwizzys.',
      'The Tlingit leader agrees to help, but asks you to recruit one more ally: Bruce Lee.',
      'Visit Bruce Lee’s memorial in Capitol Hill, then return to the ship and set out with your allies.',
    ], 'A united force for the final battle.', 'Visit district 5 for Bruce Lee, return here, then travel to Seattle Center.'),
  ]),
  district(15, 'Seattle Center', .428, .514, [
    chapter('The warmth we carry', ['The unnamed Bwizzy leader', 'Your Seattle allies'], [
      'Explore the statues around Seattle Center, taking photos with new people and solving the final riddles, puzzles, and quests.',
      'Meet the Bwizzy leader beneath the Space Needle and win the final battle.',
      'Gather people’s attention in a busy place and take a picture with as many people together as possible: the final test of your courage to connect.',
      'Look back through your Storybook as the credits trace your journey. The magic that changes Seattle comes from human connection.',
    ], 'The main story concludes.', 'Post-game journeys, including West Seattle, belong to a later chapter.'),
  ], 'Queen Anne is included in this district.'),
].map(freezeDistrict));

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
