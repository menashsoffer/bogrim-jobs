import { CRIT_TYPES, SCORE_MODES, STATUSES, toast } from './dom.js';

export const STORAGE_KEY = 'bogrim-jobs.v1';
export const OSRM = {
  car: { host: 'routed-car', profile: 'driving' },
  bike: { host: 'routed-bike', profile: 'bike' },
  walk: { host: 'routed-foot', profile: 'foot' },
};
export const ORS = { car: 'driving-car', bike: 'cycling-regular', walk: 'foot-walking' };
export const defaultCriteria = () => ([
  { id: 'role', name: 'התפקיד והאנשים', type: 'rating', weight: 35 },
  { id: 'distance', name: 'מרחק מהבית', type: 'travel', weight: 25 },
  { id: 'conditions', name: 'תנאים', type: 'rating', weight: 15 },
  { id: 'recommendations', name: 'המלצות', type: 'rating', weight: 15 },
  { id: 'peers', name: 'בוגרים אחרים', type: 'rating', weight: 10 },
]);
export const defaultFilters = () => ({
  q: '',
  district: '',
  authorityType: '',
  role: '',
  domain: '',
  authority: '',
  status: '',
  favorite: false,
  maxMinutes: '',
  maxKm: '',
  minScore: '',
});
export const defaultState = () => ({
  version: 1,
  criteria: defaultCriteria(),
  jobs: {},
  home: null,
  filters: defaultFilters(),
  sortKey: 'score',
  sortDir: 'desc',
  scoreMode: 'car',
  thresholds: { min: [25, 40, 60, 90] },
  routingKey: '',
  routes: {},
  geocodeCache: {},
  compareIds: [],
});
export const store = {
  data: null,
  jobs: [],
  jobsById: new Map(),
  authorityPoint: new Map(),
  state: defaultState(),
  searchTimer: 0,
  openJobId: '',
  returnFocus: null,
  map: null,
  mapLayer: null,
  leafletLoading: null,
  saveTimer: 0,
};
export const homeKey = (home) => (home ? `${home.lat.toFixed(5)},${home.lon.toFixed(5)}` : '');
export const normName = (value) => String(value || '').replace(/[\s\-–־'"״׳"().,]/g, '').toLowerCase();
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
export const emptyJob = () => ({
  favorite: false,
  status: STATUSES[0],
  notes: '',
  ratings: {},
  criterionNotes: {},
  callLog: [],
  transitMinutes: null,
});
export const peekJob = (id) => {
  const current = store.state.jobs[id];
  if (!current) return emptyJob();
  return {
    favorite: Boolean(current.favorite),
    status: STATUSES.includes(current.status) ? current.status : STATUSES[0],
    notes: typeof current.notes === 'string' ? current.notes : '',
    ratings: current.ratings && typeof current.ratings === 'object' ? current.ratings : {},
    criterionNotes: current.criterionNotes && typeof current.criterionNotes === 'object' ? current.criterionNotes : {},
    callLog: Array.isArray(current.callLog) ? current.callLog : [],
    transitMinutes: typeof current.transitMinutes === 'number' ? current.transitMinutes : null,
  };
};
export const ensureJob = (id) => {
  if (!store.state.jobs[id]) store.state.jobs[id] = emptyJob();
  const current = store.state.jobs[id];
  if (!current.ratings) current.ratings = {};
  if (!current.criterionNotes) current.criterionNotes = {};
  if (!Array.isArray(current.callLog)) current.callLog = [];
  if (!STATUSES.includes(current.status)) current.status = STATUSES[0];
  return current;
};
export const validCriterion = (criterion) => Boolean(criterion)
  && typeof criterion.id === 'string'
  && criterion.id.length > 0
  && criterion.id.length < 80
  && typeof criterion.name === 'string'
  && CRIT_TYPES.some(([type]) => type === criterion.type)
  && Number.isFinite(Number(criterion.weight));
export const sanitizeState = (saved) => {
  const next = defaultState();
  if (!saved || typeof saved !== 'object') return next;
  if (Array.isArray(saved.criteria) && saved.criteria.length && saved.criteria.every(validCriterion)) {
    next.criteria = saved.criteria.map((criterion) => ({
      id: criterion.id,
      name: String(criterion.name).slice(0, 80),
      type: criterion.type,
      weight: Math.max(0, Math.min(100, Number(criterion.weight) || 0)),
    }));
  }
  if (saved.jobs && typeof saved.jobs === 'object' && !Array.isArray(saved.jobs)) {
    Object.entries(saved.jobs).forEach(([id, value]) => {
      if (!value || typeof value !== 'object') return;
      const job = emptyJob();
      job.favorite = Boolean(value.favorite);
      job.status = STATUSES.includes(value.status) ? value.status : STATUSES[0];
      job.notes = typeof value.notes === 'string' ? value.notes : '';
      job.transitMinutes = typeof value.transitMinutes === 'number' && value.transitMinutes >= 0
        ? value.transitMinutes
        : null;
      if (value.ratings && typeof value.ratings === 'object') {
        Object.entries(value.ratings).forEach(([key, rating]) => {
          if (typeof rating === 'number' || typeof rating === 'boolean') job.ratings[key] = rating;
        });
      }
      if (value.criterionNotes && typeof value.criterionNotes === 'object') {
        Object.entries(value.criterionNotes).forEach(([key, note]) => {
          if (typeof note === 'string') job.criterionNotes[key] = note;
        });
      }
      if (Array.isArray(value.callLog)) {
        job.callLog = value.callLog.filter((entry) => entry && typeof entry.text === 'string').map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : uid(),
          at: typeof entry.at === 'string' ? entry.at : new Date().toISOString(),
          contactName: typeof entry.contactName === 'string' ? entry.contactName : '',
          text: entry.text,
        }));
      }
      next.jobs[id] = job;
    });
  }
  if (saved.home && Number.isFinite(Number(saved.home.lat)) && Number.isFinite(Number(saved.home.lon))) {
    next.home = {
      label: String(saved.home.label || 'הבית').slice(0, 180),
      lat: Number(saved.home.lat),
      lon: Number(saved.home.lon),
    };
  }
  if (saved.filters && typeof saved.filters === 'object') {
    next.filters = { ...defaultFilters(), ...saved.filters };
    next.filters.favorite = Boolean(saved.filters.favorite);
    next.filters.q = String(saved.filters.q || '');
  }
  if (['score', 'time', 'name', 'completeness', 'distance'].includes(saved.sortKey)) next.sortKey = saved.sortKey;
  if (saved.sortDir === 'asc' || saved.sortDir === 'desc') next.sortDir = saved.sortDir;
  if (SCORE_MODES.some(([mode]) => mode === saved.scoreMode)) next.scoreMode = saved.scoreMode;
  if (saved.thresholds && Array.isArray(saved.thresholds.min) && saved.thresholds.min.length === 4) {
    next.thresholds.min = saved.thresholds.min.map((value) => Number(value) || 0);
  }
  if (typeof saved.routingKey === 'string') next.routingKey = saved.routingKey.slice(0, 200);
  if (saved.routes && typeof saved.routes === 'object') next.routes = saved.routes;
  if (saved.geocodeCache && typeof saved.geocodeCache === 'object') next.geocodeCache = saved.geocodeCache;
  if (Array.isArray(saved.compareIds)) next.compareIds = saved.compareIds.filter((id) => typeof id === 'string').slice(0, 4);
  return next;
};
export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    return defaultState();
  }
};
export const saveNow = () => {
  clearTimeout(store.saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
  } catch (error) {
    toast('השמירה בדפדפן נכשלה');
  }
};
export const save = () => {
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(saveNow, 150);
};
