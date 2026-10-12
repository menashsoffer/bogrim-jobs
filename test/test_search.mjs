import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesWords, normalizeText, queryWords, searchText } from '../src/search.js';

const found = (query, ...parts) => matchesWords(queryWords(query), searchText(parts));

test('quotes, gershayim and final letters do not matter', () => {
  assert.equal(normalizeText('עוזר.ת מנכ"ל'), 'עוזר ת מנכל');
  assert.equal(normalizeText('מנכ״ל'), normalizeText('מנכל'));
  assert.equal(normalizeText('מנכ׳ל'), normalizeText('מנכ"ל'));
  assert.equal(normalizeText('שלום'), normalizeText('שלומ'));
});

test('niqqud, maqaf and repeated spaces are dropped', () => {
  assert.equal(normalizeText('חִנּוּךְ'), 'חנוכ');
  assert.equal(normalizeText('חינוך'), 'חינוכ');
  assert.equal(normalizeText('באר־שבע  '), 'באר שבע');
  assert.equal(normalizeText('Tel-Aviv'), 'tel aviv');
});

test('words may come in any order and in separate places', () => {
  assert.equal(found('הנדסיים פרויקטים', 'רפרנט.ית פרויקטים הנדסיים'), true);
  assert.equal(found('חינוך מנהל', 'מנהל אגף', 'תחום חינוך'), true);
  assert.equal(found('חינוך תברואה', 'מנהל אגף חינוך'), false);
});

test('a half-typed word matches while typing', () => {
  assert.equal(found('פרויקט הנדס', 'פרויקטים הנדסיים'), true);
  assert.equal(found('מנכ', 'עוזר.ת מנכ"ל'), true);
});

test('what matched before still matches', () => {
  assert.equal(found('נהל', 'מנהל'), true);
  assert.equal(found('מנהל חינוך', 'מנהל חינוך'), true);
  assert.equal(found('Haifa', 'haifa port'), true);
});

test('an empty or punctuation-only query has no words', () => {
  assert.deepEqual(queryWords(''), []);
  assert.deepEqual(queryWords('   '), []);
  assert.deepEqual(queryWords(' - . "'), []);
  assert.deepEqual(queryWords(null), []);
});

test('a word that is nowhere does not match', () => {
  assert.equal(found('קקקק', 'מנהל אגף חינוך'), false);
});
