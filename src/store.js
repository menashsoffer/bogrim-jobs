import { CRIT_TYPES, STATUSES, toast } from './dom.js';
import { distanceStops, maxSample, snapScore, snapUp, timeStops } from './filter-scale.js';

export const STORAGE_KEY = 'bogrim-jobs.v1';
export const OSRM = { host: 'routed-car', profile: 'driving' };
export const ORS = 'driving-car';
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
  includeUnrated: false,
});
export const defaultState = () => ({
  version: 1,
  criteria: defaultCriteria(),
  jobs: {},
  home: null,
  filters: defaultFilters(),
  sortKey: 'score',
  sortDir: 'desc',
  thresholds: { min: [25, 40, 60, 90] },
  routingKey: '',
  routes: {},
  geocodeCache: {},
  compareIds: [],
  welcomeSeen: false,
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
  ignoreHistory: false,
  sawPop: false,
  lastSaved: '',
};
const dirtyJobIds = new Set();
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
  };
};
export const ensureJob = (id) => {
  if (!store.state.jobs[id]) store.state.jobs[id] = emptyJob();
  const current = store.state.jobs[id];
  if (!current.ratings) current.ratings = {};
  if (!current.criterionNotes) current.criterionNotes = {};
  if (!Array.isArray(current.callLog)) current.callLog = [];
  if (!STATUSES.includes(current.status)) current.status = STATUSES[0];
  dirtyJobIds.add(id);
  return current;
};
const transitNote = (minutes) => `זמן תחבורה ציבורית שנשמר: ${minutes} דק׳`;
const savedTransitMinutes = (value) => {
  if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'transitMinutes')) return null;
  if (value.transitMinutes == null || value.transitMinutes === '') return null;
  const number = Number(value.transitMinutes);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
};
const markCarOnlyNotice = (state) => {
  Object.defineProperty(state, 'carOnlyNotice', { value: true, enumerable: false, configurable: true });
};
export const sanitizeRoutes = (routes) => {
  const next = {};
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return next;
  Object.entries(routes).forEach(([key, bucket]) => {
    if (!bucket || typeof bucket !== 'object' || !bucket.car || typeof bucket.car !== 'object') return;
    const car = {};
    Object.entries(bucket.car).forEach(([name, value]) => {
      if (!value || typeof value.min !== 'number' || !Number.isFinite(value.min) || value.min < 0) return;
      car[String(name)] = {
        min: value.min,
        km: typeof value.km === 'number' && Number.isFinite(value.km) ? value.km : null,
      };
    });
    if (Object.keys(car).length) next[key] = { car };
  });
  return next;
};
export const validCriterion = (criterion) => Boolean(criterion)
  && typeof criterion.id === 'string'
  && criterion.id.length > 0
  && criterion.id.length < 80
  && typeof criterion.name === 'string'
  && criterion.name.length < 80
  && CRIT_TYPES.some(([type]) => type === criterion.type)
  && Number.isFinite(Number(criterion.weight));
export const sanitizeState = (saved) => {
  const next = defaultState();
  if (!saved || typeof saved !== 'object') return next;
  if (Array.isArray(saved.criteria) && saved.criteria.length && saved.criteria.every(validCriterion)) {
    next.criteria = saved.criteria.map((criterion) => ({
      id: criterion.id,
      name: String(criterion.name).trim().slice(0, 80) || 'קריטריון ללא שם',
      type: criterion.type,
      weight: Math.max(0, Math.min(100, Number(criterion.weight) || 0)),
    }));
  }
  let keptTransit = false;
  if (saved.jobs && typeof saved.jobs === 'object' && !Array.isArray(saved.jobs)) {
    Object.entries(saved.jobs).forEach(([id, value]) => {
      if (!value || typeof value !== 'object') return;
      const job = emptyJob();
      job.favorite = Boolean(value.favorite);
      job.status = STATUSES.includes(value.status) ? value.status : STATUSES[0];
      job.notes = typeof value.notes === 'string' ? value.notes : '';
      const transit = savedTransitMinutes(value);
      if (transit != null) {
        const line = transitNote(transit);
        if (!job.notes.includes(line)) job.notes = job.notes ? `${job.notes}\n${line}` : line;
        keptTransit = true;
      }
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
    next.filters.includeUnrated = saved.filters.includeUnrated === true;
    next.filters.q = String(saved.filters.q || '');
  }
  if (['score', 'time', 'name', 'completeness', 'distance'].includes(saved.sortKey)) next.sortKey = saved.sortKey;
  if (saved.sortDir === 'asc' || saved.sortDir === 'desc') next.sortDir = saved.sortDir;
  if (saved.thresholds && Array.isArray(saved.thresholds.min) && saved.thresholds.min.length === 4) {
    next.thresholds.min = saved.thresholds.min.map((value) => Number(value) || 0);
  }
  if (typeof saved.routingKey === 'string') next.routingKey = saved.routingKey.slice(0, 200);
  next.routes = sanitizeRoutes(saved.routes);
  const routePeak = (field) => {
    const samples = [];
    Object.values(next.routes).forEach((bucket) => {
      Object.values(bucket.car || {}).forEach((value) => {
        if (typeof value[field] === 'number') samples.push(value[field]);
      });
    });
    return maxSample(samples);
  };
  const scalePeak = (observed, saved) => {
    const number = Number(saved);
    if (observed > 0) return observed;
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  next.filters.maxMinutes = snapUp(timeStops(scalePeak(routePeak('min'), next.filters.maxMinutes)), next.filters.maxMinutes);
  next.filters.maxKm = snapUp(distanceStops(scalePeak(routePeak('km'), next.filters.maxKm)), next.filters.maxKm);
  next.filters.minScore = snapScore(next.filters.minScore);
  if (saved.geocodeCache && typeof saved.geocodeCache === 'object') next.geocodeCache = saved.geocodeCache;
  if (Array.isArray(saved.compareIds)) next.compareIds = saved.compareIds.filter((id) => typeof id === 'string').slice(0, 4);
  next.welcomeSeen = saved.welcomeSeen === true;
  if (keptTransit || saved.scoreMode === 'transit' || saved.scoreMode === 'bike' || saved.scoreMode === 'walk') {
    markCarOnlyNotice(next);
  }
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
const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
};
const absorbRemoteJobs = () => {
  const raw = readStored();
  if (!raw || raw === store.lastSaved) return;
  let disk;
  try {
    disk = sanitizeState(JSON.parse(raw));
  } catch (error) {
    return;
  }
  Object.entries(disk.jobs).forEach(([id, job]) => {
    if (!dirtyJobIds.has(id)) store.state.jobs[id] = job;
  });
  Object.keys(store.state.jobs).forEach((id) => {
    if (!dirtyJobIds.has(id) && !disk.jobs[id]) delete store.state.jobs[id];
  });
};
export const takeRemoteState = () => {
  const raw = readStored();
  if (raw === store.lastSaved) return false;
  const kept = new Map();
  dirtyJobIds.forEach((id) => {
    if (store.state.jobs[id]) kept.set(id, store.state.jobs[id]);
  });
  try {
    store.state = raw ? sanitizeState(JSON.parse(raw)) : defaultState();
  } catch (error) {
    return false;
  }
  kept.forEach((job, id) => { store.state.jobs[id] = job; });
  dirtyJobIds.forEach((id) => {
    if (!kept.has(id)) delete store.state.jobs[id];
  });
  store.lastSaved = raw || '';
  return true;
};
export const saveNow = (mode) => {
  clearTimeout(store.saveTimer);
  try {
    if (!mode || !mode.replace) absorbRemoteJobs();
    const raw = JSON.stringify(store.state);
    localStorage.setItem(STORAGE_KEY, raw);
    store.lastSaved = raw;
    dirtyJobIds.clear();
  } catch (error) {
    toast('השמירה בדפדפן נכשלה');
  }
};
export const save = () => {
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(saveNow, 150);
};
