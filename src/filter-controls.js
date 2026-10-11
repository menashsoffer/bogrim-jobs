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
  if (!control || !readout) return;
  rangeStops.set(id, stops);
  const maxIndex = Math.max(stops.length - 1, 0);
  control.max = String(maxIndex);
  control.disabled = disabled;
  const index = Math.min(stopIndex(stops, saved), maxIndex);
  const stop = stops[index];
  const canonical = stop == null ? '' : stop;
  const stored = saved == null ? '' : saved;
  if (String(canonical) !== String(stored)) {
    if (id === 'filter-max-min') store.state.filters.maxMinutes = canonical;
    if (id === 'filter-max-km') store.state.filters.maxKm = canonical;
    if (id === 'filter-min-score') store.state.filters.minScore = canonical;
    save();
  }
  control.value = String(index);
  const text = textFor(stop);
  readout.textContent = text;
  control.setAttribute('aria-valuetext', text);
  if (!hintNode) return;
  hintNode.textContent = hint;
  hintNode.hidden = !hint;
  if (hint) control.setAttribute('aria-describedby', hintNode.id);
  else control.removeAttribute('aria-describedby');
};

export const refreshFilterScales = () => {
  const peaks = travelPeaks();
  const home = Boolean(store.state.home);
  paintStepped(
    'filter-max-min',
    timeStops(scalePeak(peaks.minutes, store.state.filters.maxMinutes)),
    store.state.filters.maxMinutes,
    timeText,
    !home,
    home ? '' : 'הזינו כתובת בית כדי לסנן לפי זמן נסיעה',
  );
  paintStepped(
    'filter-max-km',
    distanceStops(scalePeak(peaks.km, store.state.filters.maxKm)),
    store.state.filters.maxKm,
    distanceText,
    !home,
    home ? '' : 'הזינו כתובת בית כדי לסנן לפי מרחק',
  );
  const scoreSet = store.state.filters.minScore !== '' && store.state.filters.minScore != null;
  paintStepped('filter-min-score', scoreStops(), store.state.filters.minScore, scoreText, false, '');
  const unrated = document.getElementById('include-unrated');
  const unratedHint = document.getElementById('unrated-hint');
  if (unrated) {
    unrated.checked = Boolean(store.state.filters.includeUnrated);
    if (scoreSet) unrated.setAttribute('aria-describedby', 'unrated-hint');
    else unrated.removeAttribute('aria-describedby');
  }
  if (unratedHint) unratedHint.hidden = !scoreSet;
};

export const mountSteppedRange = (id, label, textFor, onChange) => {
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
  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', for: id, text: label }),
    control,
    readout,
    hint,
  ]);
};
