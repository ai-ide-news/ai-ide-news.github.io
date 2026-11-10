import test from 'node:test';
import assert from 'node:assert/strict';
import { deepseekClock, deepseekPeriod, countdown, DEEPSEEK_PRICING } from '../src/deepseek-clock.js';
const at = (date) => Date.parse(date);

test('DeepSeek switches exactly at each UTC price boundary', () => {
  for (const [date, period, next] of [
    ['2026-11-10T00:59:59Z', 'off', '2026-11-10T01:00:00Z'],
    ['2026-11-10T01:00:00Z', 'peak', '2026-11-10T04:00:00Z'],
    ['2026-11-10T04:00:00Z', 'off', '2026-11-10T06:00:00Z'],
    ['2026-11-10T06:00:00Z', 'peak', '2026-11-10T10:00:00Z'],
    ['2026-11-10T10:00:00Z', 'off', '2026-11-11T01:00:00Z'],
  ]) assert.deepEqual(deepseekClock(at(date)), { period, next: at(next) });
});

test('weekends including make-up workdays stay off-peak', () => {
  assert.equal(deepseekPeriod(at('2026-10-10T02:00:00Z')), 'off');
  assert.deepEqual(deepseekClock(at('2026-11-13T10:00:00Z')), { period: 'off', next: at('2026-11-16T01:00:00Z') });
});

test('Chinese public holidays skip peak windows, including the next year', () => {
  assert.deepEqual(deepseekClock(at('2026-09-30T10:00:00Z')), { period: 'off', next: at('2026-10-08T01:00:00Z') });
  assert.deepEqual(deepseekClock(at('2027-02-05T02:00:00Z')), { period: 'off', next: at('2027-02-15T01:00:00Z') });
  assert.equal(deepseekPeriod(at('2027-06-09T02:00:00Z')), 'off');
});

test('unknown holiday years do not claim a verified rate or countdown', () => {
  assert.deepEqual(deepseekClock(at('2028-01-03T02:00:00Z')), { period: 'unknown', next: null });
});

test('countdown supports long weekends and clamps elapsed time', () => {
  assert.equal(countdown(90061000), '1d 01:01:01');
  assert.equal(countdown(-1000), '00:00:00');
  assert.equal(countdown(1), '00:00:01');
  for (const model of DEEPSEEK_PRICING.models) model.off.forEach((rate, i) => assert.equal(model.peak[i], rate * 2));
});
