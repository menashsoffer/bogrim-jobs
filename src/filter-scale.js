import { formatDuration, formatKm, formatScore } from './dom.js';

const UNLIMITED = 'ללא הגבלה';

export const maxSample = (values) => values.reduce((max, value) => (
  typeof value === 'number' && Number.isFinite(value) && value > max ? value : max
), 0);

export const timeStops = (peak) => {
  const ceiling = Math.max(15, Math.ceil((Number(peak) || 0) / 15) * 15);
  const stops = [];
  for (let minute = 5; minute < 60 && minute <= ceiling; minute += 5) stops.push(minute);
  for (let minute = 60; minute <= ceiling; minute += 15) stops.push(minute);
  stops.push(null);
  return stops;
};

export const distanceStops = (peak) => {
  const ceiling = Math.max(10, Math.ceil((Number(peak) || 0) / 10) * 10);
  const stops = [];
  for (let km = 5; km <= 50 && km <= ceiling; km += 5) stops.push(km);
  for (let km = 60; km <= ceiling; km += 10) stops.push(km);
  stops.push(null);
  return stops;
};

export const scoreStops = () => [null, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export const snapUp = (stops, saved) => {
  if (saved === '' || saved == null) return '';
  const number = Number(saved);
  if (!Number.isFinite(number) || number <= 0) return '';
  const next = stops.find((stop) => stop != null && stop + 1e-9 >= number);
  return next == null ? '' : next;
};

export const snapScore = (saved) => {
  const snapped = snapUp(scoreStops(), saved);
  if (snapped === '' && saved !== '' && saved != null && Number(saved) > 5) return 5;
  return snapped;
};

export const stopIndex = (stops, value) => {
  if (value === '' || value == null) return Math.max(stops.findIndex((stop) => stop == null), 0);
  const exact = stops.findIndex((stop) => stop != null && Math.abs(stop - Number(value)) < 1e-6);
  if (exact >= 0) return exact;
  const higher = stops.findIndex((stop) => stop != null && stop >= Number(value));
  return higher >= 0 ? higher : stops.length - 1;
};

export const timeText = (value) => (value == null ? UNLIMITED : `עד ${formatDuration(value)}`);
export const distanceText = (value) => (value == null ? UNLIMITED : `עד ${formatKm(value)}`);
export const scoreText = (value) => (value == null ? 'הכול' : `ציון מ-${formatScore(value)} ומעלה`);
