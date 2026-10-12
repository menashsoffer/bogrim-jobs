import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCriteria, redistribute, sliderBounds } from '../src/weights.js';

const weights = (criteria) => criteria.map((criterion) => criterion.weight);
const sum = (criteria) => weights(criteria).reduce((total, weight) => total + weight, 0);

test('50 to 40 with 30 and 20 becomes 36 and 24', () => {
  const next = redistribute([
    { id: 'a', weight: 50 },
    { id: 'b', weight: 30 },
    { id: 'c', weight: 20 },
  ], 'a', 40);
  assert.deepEqual(weights(next), [40, 36, 24]);
  assert.equal(sum(next), 100);
});

test('the largest fraction gets the remainder, not the largest weight', () => {
  const next = redistribute([
    { id: 'a', weight: 50 },
    { id: 'b', weight: 30 },
    { id: 'c', weight: 20 },
  ], 'a', 33);
  assert.deepEqual(weights(next), [33, 40, 27]);
  assert.equal(sum(next), 100);
});

test('an equal fraction goes to the largest weight, then to earlier order', () => {
  const bySize = redistribute([
    { id: 'a', weight: 92 },
    { id: 'b', weight: 2 },
    { id: 'c', weight: 6 },
  ], 'a', 98);
  assert.deepEqual(weights(bySize), [98, 0, 2]);
  const byOrder = redistribute([
    { id: 'a', weight: 91 },
    { id: 'b', weight: 3 },
    { id: 'c', weight: 3 },
    { id: 'd', weight: 3 },
  ], 'a', 2);
  assert.deepEqual(weights(byOrder), [2, 33, 33, 32]);
});

test('a locked weight never changes', () => {
  const next = redistribute([
    { id: 'a', weight: 50, locked: false },
    { id: 'b', weight: 30, locked: true },
    { id: 'c', weight: 20, locked: false },
  ], 'a', 40);
  assert.deepEqual(weights(next), [40, 30, 30]);
  assert.equal(next[1].locked, true);
  const untouched = redistribute(next, 'b', 5);
  assert.deepEqual(weights(untouched), [40, 30, 30]);
});

test('the changed weight cannot pass what locked criteria leave free', () => {
  const next = redistribute([
    { id: 'a', weight: 50, locked: false },
    { id: 'b', weight: 30, locked: true },
    { id: 'c', weight: 20, locked: false },
  ], 'a', 90);
  assert.deepEqual(weights(next), [70, 30, 0]);
});

test('all the others locked keeps the control clamped', () => {
  const criteria = [
    { id: 'a', weight: 40, locked: false },
    { id: 'b', weight: 30, locked: true },
    { id: 'c', weight: 30, locked: true },
  ];
  assert.deepEqual(weights(redistribute(criteria, 'a', 10)), [40, 30, 30]);
  assert.deepEqual(sliderBounds(criteria, 'a'), { min: 40, max: 40, disabled: true });
});

test('all the others at 0 split the difference equally', () => {
  const even = redistribute([
    { id: 'a', weight: 100 },
    { id: 'b', weight: 0 },
    { id: 'c', weight: 0 },
  ], 'a', 40);
  assert.deepEqual(weights(even), [40, 30, 30]);
  const odd = redistribute([
    { id: 'a', weight: 100 },
    { id: 'b', weight: 0 },
    { id: 'c', weight: 0 },
    { id: 'd', weight: 0 },
  ], 'a', 41);
  assert.deepEqual(weights(odd), [41, 20, 20, 19]);
  assert.equal(sum(odd), 100);
});

test('normalize keeps a 100 sum and scales anything else', () => {
  const kept = normalizeCriteria([
    { id: 'role', name: 'תפקיד', type: 'rating', weight: 60 },
    { id: 'distance', name: 'מרחק', type: 'travel', weight: 40 },
    { id: 'note', name: 'הערה', type: 'text', weight: 80 },
  ]);
  assert.equal(kept.find((item) => item.id === 'note').weight, 0);
  assert.equal(kept.find((item) => item.id === 'role').weight, 60);
  assert.equal(kept.find((item) => item.id === 'distance').weight, 40);
  assert.equal(kept.find((item) => item.id === 'role').locked, false);
  const scaled = normalizeCriteria([
    { id: 'a', type: 'rating', weight: 100, locked: true },
    { id: 'b', type: 'rating', weight: 100 },
    { id: 'c', type: 'rating', weight: 100 },
  ]);
  assert.deepEqual(weights(scaled), [34, 33, 33]);
  assert.equal(scaled[0].locked, true);
  const zeros = normalizeCriteria([
    { id: 'a', type: 'rating', weight: 0 },
    { id: 'b', type: 'rating', weight: 0 },
  ]);
  assert.deepEqual(weights(zeros), [50, 50]);
  const uncapped = normalizeCriteria([
    { id: 'a', type: 'rating', weight: 200 },
    { id: 'b', type: 'rating', weight: 100 },
    { id: 'c', type: 'rating', weight: 100 },
  ]);
  assert.deepEqual(weights(uncapped), [50, 25, 25]);
  const alone = normalizeCriteria([{ id: 'only', type: 'rating', weight: 0 }]);
  assert.deepEqual(weights(alone), [100]);
});

const along = (criteria, id, values) => {
  const basis = criteria.map((item) => ({ ...item }));
  return values.reduce((current, value) => redistribute(current, id, value, { basis }), criteria);
};

const countdown = (from, to, step) => {
  const values = [];
  for (let value = from; value >= to; value -= step) values.push(value);
  return values;
};

test('arrowing 50/30/20 down to 40 stays 40/36/24', () => {
  const start = [
    { id: 'a', weight: 50 },
    { id: 'b', weight: 30 },
    { id: 'c', weight: 20 },
  ];
  assert.deepEqual(weights(along(start, 'a', countdown(49, 40, 1))), [40, 36, 24]);
});

test('stepping to 0 by twos stays 0/60/40', () => {
  const start = [
    { id: 'a', weight: 50 },
    { id: 'b', weight: 30 },
    { id: 'c', weight: 20 },
  ];
  assert.deepEqual(weights(along(start, 'a', countdown(48, 0, 2))), [0, 60, 40]);
});

test('dragging to 100 and back restores the opening weights', () => {
  const start = [
    { id: 'a', weight: 50 },
    { id: 'b', weight: 30 },
    { id: 'c', weight: 20 },
  ];
  const up = [];
  for (let value = 51; value <= 100; value += 1) up.push(value);
  const next = along(start, 'a', up.concat(countdown(99, 50, 1)));
  assert.deepEqual(weights(next), [50, 30, 20]);
});

test('one step up from the defaults does not raise distance', () => {
  const next = along([
    { id: 'role', weight: 35 },
    { id: 'distance', weight: 25 },
    { id: 'conditions', weight: 15 },
    { id: 'recommendations', weight: 15 },
    { id: 'peers', weight: 10 },
  ], 'role', [36]);
  assert.deepEqual(weights(next), [36, 24, 15, 15, 10]);
});

test('zeros split a ten-point drop evenly and a one-point drop by order', () => {
  const start = [
    { id: 'a', weight: 100 },
    { id: 'b', weight: 0 },
    { id: 'c', weight: 0 },
  ];
  assert.deepEqual(weights(redistribute(start, 'a', 90)), [90, 5, 5]);
  assert.deepEqual(weights(redistribute(start, 'a', 99)), [99, 1, 0]);
  assert.deepEqual(weights(along(start, 'a', countdown(99, 90, 1))), [90, 5, 5]);
});
