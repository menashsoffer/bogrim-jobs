const FINALS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
export const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4-\u05C7]/g, '')
  .replace(/["'`״׳”“’‘„]/g, '')
  .replace(/[ךםןףץ]/g, (letter) => FINALS[letter])
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
export const queryWords = (query) => {
  const text = normalizeText(query);
  return text ? text.split(' ') : [];
};
export const searchText = (parts) => normalizeText(parts.join(' '));
export const matchesWords = (words, text) => words.every((word) => text.includes(word));
