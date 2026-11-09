import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, getDistrict, normalizeDistrictId, parseStorybookRoute } from '../src/districts.js';

test('the shared map and journal use the fourteen approved district IDs and normalized positions', () => {
  assert.deepEqual(DISTRICTS.map(item => item.id), [1,2,3,4,5,6,7,8,9,10,11,12,14,15]);
  assert.equal(new Set(DISTRICTS.map(item => item.id)).size, 14);
  for (const item of DISTRICTS) {
    assert.ok(Object.isFrozen(item) && Object.isFrozen(item.position) && Object.isFrozen(item.chapters));
    assert.ok(item.name && item.position.x > 0 && item.position.x < 1 && item.position.y > 0 && item.position.y < 1);
    assert.equal(getDistrict(String(item.id)), item);
  }
  assert.deepEqual(getDistrict(14).position, {x:.505,y:.436});
  assert.deepEqual(getDistrict(15).position, {x:.428,y:.514});
});

test('district normalization rejects retired, fractional, malformed and prototype-like IDs', () => {
  for (const value of [13,4.5,0,16,-1,NaN,Infinity,null,undefined,{},[],true,'13','4.5','05','5x','__proto__','constructor','']) {
    assert.equal(normalizeDistrictId(value), null);
    assert.equal(getDistrict(value), null);
  }
});

test('Storybook deep links select valid districts and safely fall back to the full journal', () => {
  for (const hash of ['#storybook','storybook','#storybook/','#storybook/district/13','#storybook/district/4.5','#storybook/district/05','#storybook/district/unknown','#storybook/other']) {
    assert.deepEqual(parseStorybookRoute(hash), {screen:'storybook',districtId:null});
  }
  for (const id of DISTRICTS.map(item => item.id)) assert.deepEqual(parseStorybookRoute(`#storybook/district/${id}`), {screen:'storybook',districtId:id});
  assert.deepEqual(parseStorybookRoute('#storybook/district/5/'), {screen:'storybook',districtId:5});
  for (const hash of ['#home','#deck','#storybooks','#battle',null,undefined,{}]) assert.equal(parseStorybookRoute(hash), null);
});

test('mainline journal preserves the approved actors, revisits and intentionally unassigned district', () => {
  const text = JSON.stringify(DISTRICTS);
  assert.match(text, /Jimi Hendrix/); assert.doesNotMatch(text, /Jimmy|Yang/);
  assert.ok(getDistrict(3).chapters[0].actors.includes('Yeng'));
  assert.ok(getDistrict(4).chapters.some(item => item.actors.includes('Kai’Ru')));
  assert.ok(getDistrict(5).chapters.some(item => item.actors.includes('Bruce Lee')));
  assert.match(getDistrict(14).chapters[0].onward, /district 5.*return here.*Seattle Center/);
  assert.equal(getDistrict(15).name, 'Seattle Center');
  assert.match(getDistrict(15).note, /Queen Anne/);
  assert.deepEqual(getDistrict(10).chapters, []);
  assert.match(getDistrict(10).note, /No mainline chapter/);
});
