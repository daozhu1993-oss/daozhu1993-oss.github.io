import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../planner.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  function proposalDiff('), source.indexOf('  async function generate('));
const duration = value => value < 60 ? `${value}分钟` : `${Math.floor(value / 60)}小时${value % 60 ? `${value % 60}分` : ''}`;
const diff = (before, after) => runInNewContext(`${handler}\nproposalDiff(before, after)`, {
  before: { days: before }, after: { days: after }, duration,
  escape: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
});
const day = date => ({
  date, title: '甲至乙', distanceKm: 120, drivingMinutes: 150, overnight: { id: 'B', name: '乙' },
  legs: [{ mode: 'drive', from: { id: 'A', name: '甲' }, to: { id: 'B', name: '乙' }, depart: '08:00', arrive: '10:40', distanceMeters: 120000, durationSeconds: 9000, note: '道路待核对' }],
  items: [{ kind: 'rest', place: { id: 'B', name: '乙' }, start: '12:00', end: '13:00', note: '午餐', sourceIds: [] }],
});

test('revision preview ignores invisible IDs but shows the actual stop, time and note changes', () => {
  const original = [day('2026-11-12'), day('2026-11-13'), day('2026-11-14')];
  const proposed = structuredClone(original);
  proposed[0].items[0].place.id = 'OTHER_ID';
  proposed[0].items[0].sourceIds = ['MODEL_INTERNAL'];
  proposed[1].legs[0].to.name = '途中午餐点';
  proposed[1].items[0].place.name = '途中午餐点';
  proposed[1].items[0].start = '11:20';
  proposed[2].items[0].note = '改为午餐后休息';
  const result = diff(original, proposed);
  assert.equal((result.match(/<li>/g) || []).length, 2);
  assert.doesNotMatch(result, /2026-11-12/);
  assert.match(result, /2026-11-13/);
  assert.match(result, /途中午餐点/);
  assert.match(result, /11:20/);
  assert.match(result, /改为午餐后休息/);
  assert.notEqual(result.match(/原计划：([^<]+)<\/p><p>新计划：([^<]+)/)?.[1], result.match(/原计划：([^<]+)<\/p><p>新计划：([^<]+)/)?.[2]);
});

test('identical visible itinerary gives an honest no-change message', () => {
  assert.match(diff([day('2026-11-12')], [structuredClone(day('2026-11-12'))]), /逐日路线、时间和说明没有变化/);
});
