import { AIR_LABEL, SCORE_MODES, UNKNOWN, el, formatKm, formatScore, labelOrUnknown, scoreBand } from './dom.js';
import { OSRM, homeKey, peekJob, store } from './store.js';

export const haversineKm = (from, to) => {
  const radius = 6371;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLon = rad(to.lon - from.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const airKm = (job) => {
  if (!store.state.home || job.lat == null || job.lon == null) return null;
  return haversineKm(store.state.home, { lat: job.lat, lon: job.lon });
};
export const routeFor = (job, mode) => {
  if (!store.state.home || !OSRM[mode]) return null;
  const bucket = store.state.routes[homeKey(store.state.home)];
  const hit = bucket && bucket[mode] ? bucket[mode][job.authority] : null;
  if (!hit || typeof hit.min !== 'number') return null;
  return hit;
};
export const travelMinutes = (job) => {
  if (store.state.scoreMode === 'transit') {
    const minutes = peekJob(job.id).transitMinutes;
    return typeof minutes === 'number' ? minutes : null;
  }
  const hit = routeFor(job, store.state.scoreMode);
  return hit ? hit.min : null;
};
export const minutesToScore = (minutes) => {
  const limits = store.state.thresholds.min;
  for (let index = 0; index < limits.length; index += 1) {
    if (minutes <= limits[index]) return 5 - index;
  }
  return 1;
};
export const criterionValue = (job, criterion) => {
  if (criterion.type === 'text' || !(Number(criterion.weight) > 0)) return { counted: false, value: null };
  if (criterion.type === 'travel') {
    const minutes = travelMinutes(job);
    return { counted: true, value: minutes == null ? null : minutesToScore(minutes) };
  }
  const raw = peekJob(job.id).ratings[criterion.id];
  if (criterion.type === 'rating') {
    return { counted: true, value: (typeof raw === 'number' && raw >= 1 && raw <= 5) ? raw : null };
  }
  if (criterion.type === 'yesno') {
    if (raw === true) return { counted: true, value: 5 };
    if (raw === false) return { counted: true, value: 1 };
    return { counted: true, value: null };
  }
  return { counted: false, value: null };
};
export const scoreJob = (job) => {
  let weightSum = 0;
  let total = 0;
  let rated = 0;
  let acc = 0;
  store.state.criteria.forEach((criterion) => {
    const result = criterionValue(job, criterion);
    if (!result.counted) return;
    total += 1;
    if (result.value == null) return;
    rated += 1;
    weightSum += Number(criterion.weight);
    acc += Number(criterion.weight) * result.value;
  });
  return {
    score: weightSum ? acc / weightSum : null,
    rated,
    total,
    partial: rated > 0 && rated < total,
  };
};
export const completionText = (scored) => (
  scored.total ? `דורג ${scored.rated}/${scored.total}` : 'אין ציון: כל המשקלים הם 0'
);
export const scoreNode = (job) => {
  const scored = scoreJob(job);
  return el('p', { class: `score ${scoreBand(scored.score)}${scored.partial ? ' is-partial' : ''}` }, [
    el('strong', { text: scored.score == null ? '—' : formatScore(scored.score) }),
    el('span', { text: completionText(scored) }),
    scored.partial ? el('span', { text: 'חלקי' }) : null,
  ]);
};
export const travelSummary = (job) => {
  if (!store.state.home) return '';
  const mode = store.state.scoreMode;
  const modeLabel = (SCORE_MODES.find(([key]) => key === mode) || ['', ''])[1];
  if (job.lat == null || job.lon == null) return `${modeLabel}: ${UNKNOWN}`;
  if (mode === 'transit') {
    const minutes = peekJob(job.id).transitMinutes;
    if (typeof minutes === 'number') return `תחבורה ציבורית: ${minutes} דק׳`;
    const km = airKm(job);
    return `${AIR_LABEL}: ${formatKm(km)}`;
  }
  const hit = routeFor(job, mode);
  if (hit) return `${modeLabel}: ${hit.min} דק׳ · ${hit.km == null ? '' : formatKm(hit.km)}`.replace(/ · $/, '');
  return `${AIR_LABEL}: ${formatKm(airKm(job))}`;
};
export const matches = (job) => {
  const filters = store.state.filters;
  const user = peekJob(job.id);
  if (filters.q) {
    const hay = [
      job.title, job.authority, job.description, job.role, job.challenge, job.solution,
      (job.categories || []).join(' '), labelOrUnknown(job.district), labelOrUnknown(job.authorityType),
    ].join('\n').toLowerCase();
    if (!hay.includes(String(filters.q).toLowerCase())) return false;
  }
  if (filters.district && labelOrUnknown(job.district) !== filters.district) return false;
  if (filters.authorityType && labelOrUnknown(job.authorityType) !== filters.authorityType) return false;
  if (filters.role && job.role !== filters.role) return false;
  if (filters.domain && !(job.categories || []).includes(filters.domain)) return false;
  if (filters.authority && job.authority !== filters.authority) return false;
  if (filters.status && user.status !== filters.status) return false;
  if (filters.favorite && !user.favorite) return false;
  if (filters.maxKm !== '' && filters.maxKm != null) {
    const km = airKm(job);
    if (km == null || km > Number(filters.maxKm)) return false;
  }
  if (filters.maxMinutes !== '' && filters.maxMinutes != null) {
    const minutes = travelMinutes(job);
    if (minutes == null || minutes > Number(filters.maxMinutes)) return false;
  }
  if (filters.minScore !== '' && filters.minScore != null) {
    const scored = scoreJob(job);
    if (scored.score == null || scored.score < Number(filters.minScore)) return false;
  }
  return true;
};
export const sortValue = (job) => {
  if (store.state.sortKey === 'score') return scoreJob(job).score;
  if (store.state.sortKey === 'time') return travelMinutes(job);
  if (store.state.sortKey === 'name') return job.title || '';
  if (store.state.sortKey === 'completeness') {
    const scored = scoreJob(job);
    return scored.total ? scored.rated / scored.total : null;
  }
  if (store.state.sortKey === 'distance') return airKm(job);
  return null;
};
export const visibleJobs = () => {
  const list = store.jobs.filter(matches);
  const dir = store.state.sortDir === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    const left = sortValue(a);
    const right = sortValue(b);
    const leftMissing = left == null || left === '';
    const rightMissing = right == null || right === '';
    if (leftMissing && rightMissing) return String(a.title).localeCompare(String(b.title), 'he');
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    const order = typeof left === 'string' || typeof right === 'string'
      ? String(left).localeCompare(String(right), 'he')
      : left - right;
    return order * dir || String(a.title).localeCompare(String(b.title), 'he');
  });
};
