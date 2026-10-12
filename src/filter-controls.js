import { el } from './dom.js';
import { distanceStops, distanceText, maxSample, scoreStops, scoreText, stopIndex, timeStops, timeText } from './filter-scale.js';
import { airKm } from './score.js';
import { homeKey, save, store } from './store.js';

const rangeStops = new Map();

const travelPeaks = () => {
  const minutes = [];
  const km = [];
  if (!store.state.home) return { minutes, km };
  const bucket = store.state.routes[homeKey(store.state.home)];
  Object.values((bucket && bucket.car) || {}).forEach((value) => {
    if (typeof value.min === 'number') minutes.push(value.min);
    if (typeof value.km === 'number') km.push(value.km);
  });
  if (!km.length) store.jobs.forEach((job) => {
    const distance = airKm(job);
    if (distance != null) km.push(distance);
  });
  return { minutes, km };
};

const scalePeak = (samples, saved) => {
  const observed = maxSample(samples);
  const number = Number(saved);
  if (observed > 0) return observed;
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const paintStepped = (id, stops, saved, textFor, disabled, hint) => {
  const control = document.getElementById(id);
  const readout = document.getElementById(`${id}-readout`);
  const hintNode = document.getElementById(`${id}-hint`);
  if (!control || !readout) return null;
  rangeStops.set(id, stops);
  const maxIndex = Math.max(stops.length - 1, 0);
  control.max = String(maxIndex);
  control.disabled = disabled;
  const index = Math.min(stopIndex(stops, saved), maxIndex);
  const stop = stops[index];
  const canonical = stop == null ? '' : stop;
  control.value = String(index);
  const text = textFor(stop);
  readout.textContent = text;
  control.setAttribute('aria-valuetext', text);
  if (hintNode) {
    hintNode.textContent = hint;
    hintNode.hidden = !hint;
    if (hint) control.setAttribute('aria-describedby', hintNode.id);
    else control.removeAttribute('aria-describedby');
  }
  return { canonical, stored: saved == null ? '' : saved };
};
const commitStepped = (id, painted) => {
  if (!painted || String(painted.canonical) === String(painted.stored)) return;
  if (id === 'filter-max-min') store.state.filters.maxMinutes = painted.canonical;
  if (id === 'filter-max-km') store.state.filters.maxKm = painted.canonical;
  if (id === 'filter-min-score') store.state.filters.minScore = painted.canonical;
  save();
};

export const refreshFilterScales = () => {
  const peaks = travelPeaks();
  const home = Boolean(store.state.home);
  commitStepped('filter-max-min', paintStepped(
    'filter-max-min',
    timeStops(scalePeak(peaks.minutes, store.state.filters.maxMinutes)),
    store.state.filters.maxMinutes,
    timeText,
    !home,
    home ? '' : 'הזינו כתובת בית כדי לסנן לפי זמן נסיעה',
  ));
  commitStepped('filter-max-km', paintStepped(
    'filter-max-km',
    distanceStops(scalePeak(peaks.km, store.state.filters.maxKm)),
    store.state.filters.maxKm,
    distanceText,
    !home,
    home ? '' : 'הזינו כתובת בית כדי לסנן לפי מרחק',
  ));
  const scoreSet = store.state.filters.minScore !== '' && store.state.filters.minScore != null;
  commitStepped('filter-min-score', paintStepped('filter-min-score', scoreStops(), store.state.filters.minScore, scoreText, false, ''));
  const unrated = document.getElementById('include-unrated');
  const unratedHint = document.getElementById('unrated-hint');
  if (unrated) {
    unrated.checked = Boolean(store.state.filters.includeUnrated);
    if (scoreSet) unrated.setAttribute('aria-describedby', 'unrated-hint');
    else unrated.removeAttribute('aria-describedby');
  }
  if (unratedHint) unratedHint.hidden = !scoreSet;
};

export const mountSteppedRange = (id, label, textFor, onChange, ends) => {
  const control = el('input', {
    id,
    type: 'range',
    class: 'step-range',
    dir: 'ltr',
    min: '0',
    step: '1',
    'aria-orientation': 'horizontal',
  });
  const readout = el('span', { class: 'range-readout', id: `${id}-readout` });
  const hint = el('p', { class: 'hint', id: `${id}-hint`, hidden: true });
  control.addEventListener('input', () => {
    const stops = rangeStops.get(id) || [null];
    const stop = stops[Number(control.value)];
    onChange(stop == null ? '' : stop);
    const text = textFor(stop);
    control.setAttribute('aria-valuetext', text);
    readout.textContent = text;
  });
  const scale = ends
    ? el('div', { class: 'range-ends', dir: 'ltr' }, [
      el('span', { text: ends[0] }),
      el('span', { text: ends[1] }),
    ])
    : null;
  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', for: id, text: label }),
    control,
    scale,
    readout,
    hint,
  ]);
};
