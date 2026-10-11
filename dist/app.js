const STATUSES = ['לא נבדק', 'דיברתי איתם', 'מעניין', 'פסול'];
const UNKNOWN = 'לא ידוע';
const AIR_LABEL = 'קו אווירי (הערכה)';
const STORAGE_KEY = 'bogrim-jobs.v1';
const CRIT_TYPES = [
  ['rating', 'דירוג 1–5'],
  ['yesno', 'כן/לא'],
  ['text', 'טקסט'],
  ['travel', 'נסיעה אוטומטית'],
];
const SCORE_MODES = [
  ['car', 'רכב'],
  ['bike', 'אופניים'],
  ['walk', 'הליכה'],
  ['transit', 'תחבורה ציבורית'],
];
const OSRM = {
  car: { host: 'routed-car', profile: 'driving' },
  bike: { host: 'routed-bike', profile: 'bike' },
  walk: { host: 'routed-foot', profile: 'foot' },
};
const ORS = { car: 'driving-car', bike: 'cycling-regular', walk: 'foot-walking' };

const defaultCriteria = () => ([
  { id: 'role', name: 'התפקיד והאנשים', type: 'rating', weight: 35 },
  { id: 'distance', name: 'מרחק מהבית', type: 'travel', weight: 25 },
  { id: 'conditions', name: 'תנאים', type: 'rating', weight: 15 },
  { id: 'recommendations', name: 'המלצות', type: 'rating', weight: 15 },
  { id: 'peers', name: 'בוגרים אחרים', type: 'rating', weight: 10 },
]);

const defaultFilters = () => ({
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

const defaultState = () => ({
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

const el = (tag, attrs = {}, kids = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'value') node.value = String(value);
    else if (key === 'on') {
      Object.entries(value).forEach(([name, handler]) => node.addEventListener(name, handler));
    } else if (key === 'data') {
      Object.entries(value).forEach(([name, dataValue]) => { node.dataset[name] = String(dataValue); });
    } else if (key === 'checked' || key === 'disabled' || key === 'hidden') node[key] = true;
    else node.setAttribute(key, value === true ? '' : String(value));
  });
  const list = Array.isArray(kids) ? kids.flat() : [kids];
  list.forEach((kid) => {
    if (kid == null || kid === false) return;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  });
  return node;
};

const labelOrUnknown = (value) => (value == null || value === '' ? UNKNOWN : String(value));
const formatScore = (score) => (Math.round(score * 10) / 10).toFixed(1);
const formatKm = (km) => {
  if (km == null || Number.isNaN(km)) return UNKNOWN;
  const rounded = km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km));
  return `${rounded} ק"מ`;
};
const formatStamp = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};
const homeKey = (home) => (home ? `${home.lat.toFixed(5)},${home.lon.toFixed(5)}` : '');
const normName = (value) => String(value || '').replace(/[\s\-–־'"״׳"().,]/g, '').toLowerCase();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const haversineKm = (from, to) => {
  const radius = 6371;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLon = rad(to.lon - from.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const scoreBand = (score) => {
  if (score == null) return 'score-none';
  return `score-${Math.max(1, Math.min(5, Math.round(score)))}`;
};

const statusClass = (status) => {
  if (status === 'דיברתי איתם') return 'status status-talk';
  if (status === 'מעניין') return 'status status-yes';
  if (status === 'פסול') return 'status status-no';
  return 'status';
};

const safeHttps = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.hostname !== 'www.bogrim-muni.com' && parsed.hostname !== 'bogrim-muni.com') return '';
    return parsed.href;
  } catch (error) {
    return '';
  }
};

const safeTel = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{8,15}$/.test(digits)) return '';
  return `tel:${digits}`;
};

const safeMail = (email) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) return '';
  return `mailto:${email}`;
};

let data = null;
let jobs = [];
let jobsById = new Map();
let authorityPoint = new Map();
let state = defaultState();
let searchTimer = 0;
let openJobId = '';
let returnFocus = null;
let map = null;
let mapLayer = null;
let leafletLoading = null;

const emptyJob = () => ({
  favorite: false,
  status: STATUSES[0],
  notes: '',
  ratings: {},
  criterionNotes: {},
  callLog: [],
  transitMinutes: null,
});

const peekJob = (id) => {
  const current = state.jobs[id];
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

const ensureJob = (id) => {
  if (!state.jobs[id]) state.jobs[id] = emptyJob();
  const current = state.jobs[id];
  if (!current.ratings) current.ratings = {};
  if (!current.criterionNotes) current.criterionNotes = {};
  if (!Array.isArray(current.callLog)) current.callLog = [];
  if (!STATUSES.includes(current.status)) current.status = STATUSES[0];
  return current;
};

const validCriterion = (criterion) => Boolean(criterion)
  && typeof criterion.id === 'string'
  && criterion.id.length > 0
  && criterion.id.length < 80
  && typeof criterion.name === 'string'
  && CRIT_TYPES.some(([type]) => type === criterion.type)
  && Number.isFinite(Number(criterion.weight));

const sanitizeState = (saved) => {
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

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    return defaultState();
  }
};

let saveTimer = 0;
const saveNow = () => {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    toast('השמירה בדפדפן נכשלה');
  }
};
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
};

const toast = (message) => {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-on');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('is-on'), 3200);
};

const showLimit = (message) => {
  const alert = document.getElementById('limit-alert');
  if (alert) {
    alert.hidden = false;
    alert.textContent = message;
  }
  toast(message);
};

const airKm = (job) => {
  if (!state.home || job.lat == null || job.lon == null) return null;
  return haversineKm(state.home, { lat: job.lat, lon: job.lon });
};

const routeFor = (job, mode) => {
  if (!state.home || !OSRM[mode]) return null;
  const bucket = state.routes[homeKey(state.home)];
  const hit = bucket && bucket[mode] ? bucket[mode][job.authority] : null;
  if (!hit || typeof hit.min !== 'number') return null;
  return hit;
};

const travelMinutes = (job) => {
  if (state.scoreMode === 'transit') {
    const minutes = peekJob(job.id).transitMinutes;
    return typeof minutes === 'number' ? minutes : null;
  }
  const hit = routeFor(job, state.scoreMode);
  return hit ? hit.min : null;
};

const minutesToScore = (minutes) => {
  const limits = state.thresholds.min;
  for (let index = 0; index < limits.length; index += 1) {
    if (minutes <= limits[index]) return 5 - index;
  }
  return 1;
};

const criterionValue = (job, criterion) => {
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

const scoreJob = (job) => {
  let weightSum = 0;
  let total = 0;
  let rated = 0;
  let acc = 0;
  state.criteria.forEach((criterion) => {
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

const scoreNode = (job) => {
  const scored = scoreJob(job);
  return el('p', { class: `score ${scoreBand(scored.score)}${scored.partial ? ' is-partial' : ''}` }, [
    el('strong', { text: scored.score == null ? '—' : formatScore(scored.score) }),
    el('span', { text: `דורג ${scored.rated}/${scored.total}` }),
    scored.partial ? el('span', { text: 'חלקי' }) : null,
  ]);
};

const travelSummary = (job) => {
  if (!state.home) return '';
  const mode = state.scoreMode;
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

const matches = (job) => {
  const filters = state.filters;
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

const sortValue = (job) => {
  if (state.sortKey === 'score') return scoreJob(job).score;
  if (state.sortKey === 'time') return travelMinutes(job);
  if (state.sortKey === 'name') return job.title || '';
  if (state.sortKey === 'completeness') {
    const scored = scoreJob(job);
    return scored.total ? scored.rated / scored.total : null;
  }
  if (state.sortKey === 'distance') return airKm(job);
  return null;
};

const visibleJobs = () => {
  const list = jobs.filter(matches);
  const dir = state.sortDir === 'asc' ? 1 : -1;
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

const updateCompareCount = () => {
  const badge = document.getElementById('compare-count');
  if (badge) badge.textContent = String(state.compareIds.length);
};

const toggleCompare = (id, on) => {
  const has = state.compareIds.includes(id);
  if (on && !has) {
    if (state.compareIds.length >= 4) {
      showLimit('אפשר להשוות עד 4 משרות');
      return false;
    }
    state.compareIds.push(id);
  } else if (!on && has) {
    state.compareIds = state.compareIds.filter((item) => item !== id);
  }
  save();
  updateCompareCount();
  return true;
};

const renderResults = () => {
  const host = document.getElementById('results');
  const count = document.getElementById('result-count');
  if (!host) return;
  const list = visibleJobs();
  if (count) count.textContent = `מוצגות ${list.length} משרות`;
  host.replaceChildren();
  if (!list.length) {
    host.append(el('p', { class: 'empty', text: 'לא נמצאו משרות' }));
    return;
  }
  list.forEach((job) => {
    const user = peekJob(job.id);
    const travel = travelSummary(job);
    const open = el('button', {
      type: 'button',
      class: 'card-open',
      data: { job: job.id },
      on: { click: () => openJob(job.id, open) },
    }, [
      el('span', { class: 'card-title', text: job.title || job.role }),
      el('span', { class: 'card-meta', text: `${job.authority} · ${labelOrUnknown(job.district)} · ${labelOrUnknown(job.authorityType)}` }),
    ]);
    const fav = el('button', {
      type: 'button',
      class: `btn fav${user.favorite ? ' is-on' : ''}`,
      'aria-pressed': user.favorite ? 'true' : 'false',
      'aria-label': 'מועדף',
      text: user.favorite ? '★ מועדף' : '☆ מועדף',
      on: { click: () => {
        const record = ensureJob(job.id);
        record.favorite = !record.favorite;
        save();
        renderResults();
        if (openJobId === job.id) refreshDrawer();
      }},
    });
    const compare = el('input', { type: 'checkbox' });
    compare.checked = state.compareIds.includes(job.id);
    compare.addEventListener('change', () => {
      const ok = toggleCompare(job.id, compare.checked);
      if (!ok) compare.checked = false;
    });
    const card = el('article', { class: `card${user.status === 'פסול' ? ' is-rejected' : ''}` }, [
      scoreNode(job),
      open,
      el('div', { class: 'chips' }, [
        el('span', { class: 'chip role', text: job.role || UNKNOWN }),
        ...(job.categories || []).map((category) => el('span', { class: 'chip', text: category })),
      ]),
      travel ? el('p', { class: 'travel-line', text: travel }) : null,
      el('div', { class: 'card-actions' }, [
        fav,
        el('span', { class: statusClass(user.status), text: user.status }),
        el('label', { class: 'check' }, [compare, 'השוואה']),
      ]),
    ]);
    host.append(card);
  });
};

const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

const renderListShell = () => {
  const view = document.getElementById('view-list');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';
  view.replaceChildren();
  const filters = state.filters;
  const selectField = (id, label, options, current, assign) => {
    const control = el('select', { id });
    control.append(el('option', { value: '', text: 'הכל' }));
    options.forEach((option) => {
      const node = el('option', { value: option, text: option });
      if (option === current) node.selected = true;
      control.append(node);
    });
    control.addEventListener('change', () => {
      assign(control.value);
      save();
      renderResults();
    });
    return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), control]);
  };
  const numberField = (id, label, current, assign) => {
    const control = el('input', { id, type: 'number', min: '0', step: '1', value: current });
    control.addEventListener('change', () => {
      assign(control.value);
      save();
      renderResults();
    });
    return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), control]);
  };
  const search = el('input', {
    id: 'search',
    type: 'search',
    value: filters.q,
    on: { input: () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.q = search.value.trim();
        save();
        renderResults();
      }, 300);
    }},
  });
  const favorite = el('input', { id: 'favorite-only', type: 'checkbox' });
  favorite.checked = Boolean(filters.favorite);
  favorite.addEventListener('change', () => {
    state.filters.favorite = favorite.checked;
    save();
    renderResults();
  });
  const sort = el('select', { id: 'sort-key' });
  [['score', 'ציון'], ['time', 'זמן נסיעה'], ['name', 'שם'], ['completeness', 'השלמה'], ['distance', 'מרחק']].forEach(([key, label]) => {
    const option = el('option', { value: key, text: label });
    if (key === state.sortKey) option.selected = true;
    sort.append(option);
  });
  sort.addEventListener('change', () => {
    state.sortKey = sort.value;
    if (state.sortKey === 'name' || state.sortKey === 'time' || state.sortKey === 'distance') state.sortDir = 'asc';
    else state.sortDir = 'desc';
    save();
    const dir = document.getElementById('sort-dir');
    if (dir) dir.textContent = state.sortDir === 'asc' ? 'עולה' : 'יורד';
    renderResults();
  });
  const dirButton = el('button', {
    type: 'button',
    class: 'btn',
    id: 'sort-dir',
    'aria-label': 'כיוון מיון',
    text: state.sortDir === 'asc' ? 'עולה' : 'יורד',
    on: { click: () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      dirButton.textContent = state.sortDir === 'asc' ? 'עולה' : 'יורד';
      save();
      renderResults();
    }},
  });
  const mode = el('select', { id: 'score-mode', 'aria-label': 'ציון המרחק לפי' });
  SCORE_MODES.forEach(([key, label]) => {
    const option = el('option', { value: key, text: label });
    if (key === state.scoreMode) option.selected = true;
    mode.append(option);
  });
  mode.addEventListener('change', () => {
    state.scoreMode = mode.value;
    save();
    renderResults();
    if (openJobId) refreshDrawer();
  });
  const filterBox = el('div', { class: 'filters', id: 'filters' }, [
    el('div', { class: 'row' }, [
      el('h2', { text: 'סינון' }),
      el('button', {
        type: 'button',
        class: 'btn close-filters',
        id: 'close-filters',
        text: 'סגירה',
        on: { click: () => {
          filterBox.classList.remove('is-open');
          const toggle = document.getElementById('filter-toggle');
          if (toggle) toggle.focus();
        }},
      }),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'חיפוש' }), search]),
    selectField('filter-district', 'מחוז', uniqueValues(jobs.map((job) => labelOrUnknown(job.district))), filters.district, (value) => { state.filters.district = value; }),
    selectField('filter-type', 'סוג רשות', uniqueValues(jobs.map((job) => labelOrUnknown(job.authorityType))), filters.authorityType, (value) => { state.filters.authorityType = value; }),
    selectField('filter-role', 'תפקיד', uniqueValues(jobs.map((job) => job.role)), filters.role, (value) => { state.filters.role = value; }),
    selectField('filter-domain', 'תחום', uniqueValues(jobs.flatMap((job) => job.categories || [])), filters.domain, (value) => { state.filters.domain = value; }),
    selectField('filter-authority', 'רשות', uniqueValues(jobs.map((job) => job.authority)), filters.authority, (value) => { state.filters.authority = value; }),
    selectField('filter-status', 'סטטוס', STATUSES, filters.status, (value) => { state.filters.status = value; }),
    numberField('filter-max-min', 'זמן נסיעה מקסימלי', filters.maxMinutes, (value) => { state.filters.maxMinutes = value; }),
    numberField('filter-max-km', 'מרחק מקסימלי', filters.maxKm, (value) => { state.filters.maxKm = value; }),
    numberField('filter-min-score', 'ציון מינימלי', filters.minScore, (value) => { state.filters.minScore = value; }),
    el('label', { class: 'check' }, [favorite, 'מועדפים בלבד']),
    el('button', {
      type: 'button',
      class: 'btn',
      id: 'clear-filters',
      text: 'נקה סינון',
      on: { click: () => {
        clearTimeout(searchTimer);
        state.filters = defaultFilters();
        save();
        view.dataset.ready = '';
        renderListShell();
        renderResults();
      }},
    }),
  ]);
  const layout = el('div', { class: 'list-layout' }, [
    filterBox,
    el('div', {}, [
      el('div', { class: 'toolbar' }, [
        el('button', {
          type: 'button',
          class: 'btn filter-toggle',
          id: 'filter-toggle',
          text: 'סינון',
          on: { click: () => {
            filterBox.classList.add('is-open');
            search.focus();
          }},
        }),
        el('p', { id: 'result-count', class: 'grow', 'aria-live': 'polite', text: '' }),
        el('label', { class: 'field', style: null }, [el('span', { class: 'field-label', text: 'מיון' }), sort]),
        dirButton,
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'ציון המרחק לפי' }), mode]),
      ]),
      el('p', { id: 'home-hint', class: 'hint', hidden: Boolean(state.home), text: 'כדי לראות מרחק, הגדירו כתובת בית בהגדרות.' }),
      el('p', { id: 'limit-alert', class: 'alert', role: 'alert', hidden: true }),
      el('div', { id: 'results', class: 'results' }),
    ]),
  ]);
  view.append(layout);
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = Boolean(state.home);
};

const setBackgroundInert = (on) => {
  document.querySelectorAll('body > *:not(#drawer-root):not(#toast)').forEach((node) => {
    node.inert = on;
  });
};

const trapFocus = (event) => {
  const drawer = document.getElementById('drawer');
  if (!drawer) return;
  const focusable = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
    .filter((node) => node.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const externalLink = (href, text) => el('a', {
  class: 'btn',
  href,
  target: '_blank',
  rel: 'noopener noreferrer',
  text,
});

const paintDrawer = () => {
  const job = jobsById.get(openJobId);
  const root = document.getElementById('drawer-root');
  if (!job || !root) return;
  const user = peekJob(job.id);
  const scored = scoreJob(job);
  const url = safeHttps(job.url);
  const backdrop = el('button', {
    type: 'button',
    class: 'backdrop',
    tabindex: '-1',
    'aria-label': 'סגירת הפרטים',
    on: { click: () => closeJob() },
  });
  const body = el('div', { class: 'drawer-body' });
  const head = el('div', { class: 'drawer-head' }, [
    el('div', { class: 'row' }, [
      el('button', {
        type: 'button',
        class: 'btn',
        id: 'drawer-close',
        text: 'סגירה',
        on: { click: () => closeJob() },
      }),
      el('button', {
        type: 'button',
        class: `btn fav${user.favorite ? ' is-on' : ''}`,
        id: 'drawer-favorite',
        'aria-pressed': user.favorite ? 'true' : 'false',
        'aria-label': 'מועדף',
        text: user.favorite ? '★ מועדף' : '☆ מועדף',
        on: { click: () => {
          ensureJob(job.id).favorite = !ensureJob(job.id).favorite;
          save();
          refreshDrawer('drawer-favorite');
          renderResults();
        }},
      }),
    ]),
    el('h2', { id: 'drawer-title', text: job.title || job.role }),
    el('p', { class: 'muted', text: `${job.authority} · ${labelOrUnknown(job.district)} · ${labelOrUnknown(job.authorityType)}` }),
    el('p', { class: `score ${scoreBand(scored.score)}${scored.partial ? ' is-partial' : ''}` }, [
      el('strong', { text: scored.score == null ? '—' : formatScore(scored.score) }),
      el('span', { text: `דורג ${scored.rated}/${scored.total}` }),
      scored.partial ? el('span', { text: 'חלקי' }) : null,
    ]),
    url ? el('a', {
      class: 'btn primary',
      id: 'source-link',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'למודעה המקורית',
    }) : el('p', { text: 'אין קישור למודעה' }),
  ]);

  const status = el('select', { id: 'job-status' });
  STATUSES.forEach((name) => {
    const option = el('option', { value: name, text: name });
    if (name === user.status) option.selected = true;
    status.append(option);
  });
  status.addEventListener('change', () => {
    ensureJob(job.id).status = status.value;
    save();
    renderResults();
  });
  body.append(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'סטטוס' }), status]));

  state.criteria.forEach((criterion) => {
    const result = criterionValue(job, criterion);
    const raw = user.ratings[criterion.id];
    let control = null;
    if (criterion.type === 'rating') {
      const group = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': criterion.name });
      for (let star = 1; star <= 5; star += 1) {
        const id = `star-${criterion.id}-${star}`;
        group.append(el('button', {
          type: 'button',
          class: `star${typeof raw === 'number' && raw >= star ? ' is-on' : ''}`,
          id,
          role: 'radio',
          'aria-checked': raw === star ? 'true' : 'false',
          'aria-label': `${star} מתוך 5`,
          text: '★',
          on: { click: () => {
            ensureJob(job.id).ratings[criterion.id] = star;
            save();
            refreshDrawer(id);
            renderResults();
          }},
        }));
      }
      group.append(el('button', {
        type: 'button',
        class: 'btn',
        text: 'ניקוי דירוג',
        'aria-label': `ניקוי דירוג ${criterion.name}`,
        on: { click: () => {
          delete ensureJob(job.id).ratings[criterion.id];
          save();
          refreshDrawer();
          renderResults();
        }},
      }));
      control = group;
    } else if (criterion.type === 'yesno') {
      const group = el('div', { class: 'yesno', role: 'radiogroup', 'aria-label': criterion.name });
      [['כן', true], ['לא', false]].forEach(([label, flag]) => {
        group.append(el('button', {
          type: 'button',
          class: `btn${raw === flag ? ' primary' : ''}`,
          'aria-pressed': raw === flag ? 'true' : 'false',
          text: label,
          on: { click: () => {
            ensureJob(job.id).ratings[criterion.id] = flag;
            save();
            refreshDrawer();
            renderResults();
          }},
        }));
      });
      group.append(el('button', {
        type: 'button',
        class: 'btn',
        text: 'ניקוי דירוג',
        on: { click: () => {
          delete ensureJob(job.id).ratings[criterion.id];
          save();
          refreshDrawer();
          renderResults();
        }},
      }));
      control = group;
    } else if (criterion.type === 'travel') {
      const text = result.value == null ? 'לא דורג' : `ציון אוטומטי: ${result.value} מתוך 5`;
      control = el('p', { text });
    }
    const notes = el('textarea', {
      id: `notes-${criterion.id}`,
      value: user.criterionNotes[criterion.id] || '',
      on: { input: (event) => {
        ensureJob(job.id).criterionNotes[criterion.id] = event.target.value;
        save();
      }},
    });
    body.append(el('section', { class: 'criterion' }, [
      el('div', { class: 'criterion-head' }, [
        el('h3', { text: criterion.name }),
        criterion.type === 'text' ? el('span', { class: 'muted', text: 'לא נכלל בציון' }) : el('span', { class: 'muted', text: `משקל ${criterion.weight}` }),
      ]),
      control,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'הערות' }), notes]),
    ]));
  });

  body.append(el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'הערות כלליות' }),
    el('textarea', {
      id: 'general-notes',
      value: user.notes,
      on: { input: (event) => {
        ensureJob(job.id).notes = event.target.value;
        save();
      }},
    }),
  ]));

  const callName = el('input', { id: 'call-name', type: 'text' });
  const callText = el('textarea', { id: 'call-text' });
  const calls = el('div', { id: 'call-log' });
  [...user.callLog].sort((a, b) => String(b.at).localeCompare(String(a.at))).forEach((entry) => {
    calls.append(el('article', { class: 'call' }, [
      el('p', { class: 'muted', text: formatStamp(entry.at) }),
      entry.contactName ? el('p', { text: entry.contactName }) : null,
      el('p', { class: 'pre', text: entry.text }),
      el('button', {
        type: 'button',
        class: 'btn',
        text: 'מחיקת רשומה',
        'aria-label': `מחיקת רשומה ${entry.contactName || ''}`.trim(),
        on: { click: () => {
          const record = ensureJob(job.id);
          record.callLog = record.callLog.filter((item) => item.id !== entry.id);
          save();
          refreshDrawer();
        }},
      }),
    ]));
  });
  body.append(el('section', { class: 'block' }, [
    el('h3', { text: 'יומן שיחות' }),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'שם איש הקשר' }), callName]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'תוכן השיחה' }), callText]),
    el('button', {
      type: 'button',
      class: 'btn primary',
      id: 'call-add',
      text: 'הוספת רשומה',
      on: { click: () => {
        const text = callText.value.trim();
        const contactName = callName.value.trim();
        if (!text && !contactName) {
          toast('מלאו שם או תוכן ליומן השיחות');
          return;
        }
        ensureJob(job.id).callLog.push({ id: uid(), at: new Date().toISOString(), contactName, text });
        save();
        refreshDrawer();
      }},
    }),
    calls,
  ]));

  body.append(travelSection(job));
  body.append(factsSection(job));
  ['challenge', 'description', 'solution'].forEach((key) => {
    const titles = { challenge: 'האתגר', description: 'תיאור התפקיד', solution: 'כיווני פתרון' };
    if (!job[key]) return;
    body.append(el('section', { class: 'block' }, [
      el('h3', { text: titles[key] }),
      el('p', { class: 'pre', text: job[key] }),
    ]));
  });
  if (data.meta && data.meta.includeContacts) body.append(contactsSection(job));

  const drawer = el('aside', {
    class: 'drawer',
    id: 'drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'drawer-title',
  }, [head, body]);
  root.replaceChildren(backdrop, drawer);
};

const travelSection = (job) => {
  const section = el('section', { class: 'block' }, [el('h3', { text: 'נסיעה' })]);
  if (!state.home) {
    section.append(el('p', { text: 'הגדירו כתובת בית בהגדרות כדי לראות מרחק ומסלול.' }));
    return section;
  }
  if (job.lat == null || job.lon == null) {
    section.append(el('p', { text: UNKNOWN }));
    return section;
  }
  const km = airKm(job);
  const modes = el('div', { class: 'modes' });
  [['car', 'רכב'], ['bike', 'אופניים'], ['walk', 'הליכה'], ['transit', 'תחבורה ציבורית']].forEach(([mode, label]) => {
    let detail = `${AIR_LABEL}: ${formatKm(km)}`;
    if (mode === 'transit') {
      const minutes = peekJob(job.id).transitMinutes;
      if (typeof minutes === 'number') detail = `${minutes} דק׳`;
    } else {
      const hit = routeFor(job, mode);
      if (hit) detail = `${hit.min} דק׳ · ${hit.km == null ? formatKm(km) : formatKm(hit.km)}`;
    }
    modes.append(el('button', {
      type: 'button',
      class: `mode${state.scoreMode === mode ? ' is-selected' : ''}`,
      'aria-pressed': state.scoreMode === mode ? 'true' : 'false',
      on: { click: () => {
        state.scoreMode = mode;
        save();
        const select = document.getElementById('score-mode');
        if (select) select.value = mode;
        refreshDrawer();
        renderResults();
      }},
    }, [el('strong', { text: label }), el('span', { text: detail })]));
  });
  section.append(modes);
  const origin = `${state.home.lat},${state.home.lon}`;
  const destination = `${job.lat},${job.lon}`;
  const google = (mode) => `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
  const moovit = `https://moovit.com/?from=${encodeURIComponent(state.home.label || 'הבית')}&fll=${state.home.lat}_${state.home.lon}&to=${encodeURIComponent(job.authority)}&tll=${job.lat}_${job.lon}&lang=he`;
  const waze = `https://www.waze.com/ul?ll=${destination}&navigate=yes&from=${origin}`;
  section.append(el('div', { class: 'row' }, [
    externalLink(google('transit'), 'Google Maps'),
    externalLink(moovit, 'Moovit'),
    externalLink(waze, 'Waze'),
  ]));
  const transit = el('input', {
    id: 'transit-minutes',
    type: 'number',
    min: '0',
    step: '1',
    value: peekJob(job.id).transitMinutes == null ? '' : String(peekJob(job.id).transitMinutes),
  });
  transit.addEventListener('change', () => {
    const record = ensureJob(job.id);
    record.transitMinutes = transit.value === '' ? null : Number(transit.value);
    save();
    refreshDrawer('transit-minutes');
    renderResults();
  });
  section.append(el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'זמן תחבורה ציבורית שמצאתי (דקות)' }),
    transit,
  ]));
  section.append(el('p', { class: 'hint', text: 'בלי מסלול מחושב מוצג קו אווירי (הערכה). חישוב המסלול נעשה רק בהגדרות, אחרי אישור.' }));
  return section;
};

const factsSection = (job) => el('section', { class: 'block' }, [
  el('h3', { text: 'פרטי המשרה' }),
  el('dl', { class: 'facts' }, [
    el('dt', { text: 'תפקיד' }), el('dd', { text: job.role || UNKNOWN }),
    el('dt', { text: 'תחום' }), el('dd', { text: (job.categories || []).join(', ') || UNKNOWN }),
    el('dt', { text: 'אוכלוסייה' }), el('dd', { text: labelOrUnknown(job.population) }),
    el('dt', { text: 'אשכול חברתי-כלכלי' }), el('dd', { text: labelOrUnknown(job.socioEconomic) }),
    el('dt', { text: 'מדד פריפריאליות' }), el('dd', { text: labelOrUnknown(job.peripherality) }),
    el('dt', { text: 'תפקיד המנהל/ת' }), el('dd', { text: labelOrUnknown(job.managerTitle) }),
    job.locationPrecision && job.locationPrecision !== 'exact'
      ? [el('dt', { text: 'מיקום במפה' }), el('dd', { text: job.locationNote || 'מיקום מקורב' })]
      : null,
  ]),
]);

const contactsSection = (job) => {
  const people = [
    ['מנהל/ת', job.managerName, job.managerTitle, job.managerEmail, job.managerPhone],
    ['איש קשר', job.contactName, '', job.contactEmail, job.contactPhone],
    ['מערך ליווי', job.liaisonName, '', job.liaisonEmail, job.liaisonPhone],
  ].filter((person) => person.slice(1).some(Boolean));
  if (!people.length) return el('section');
  const section = el('section', { class: 'block', id: 'contacts' }, [el('h3', { text: 'אנשי קשר' })]);
  people.forEach(([role, name, title, email, phone]) => {
    const tel = safeTel(phone);
    const mail = safeMail(email);
    section.append(el('article', { class: 'criterion' }, [
      el('p', { class: 'muted', text: role }),
      name ? el('p', { text: name }) : null,
      title ? el('p', { text: title }) : null,
      tel ? el('a', { href: tel, text: String(phone) }) : null,
      mail ? el('a', { href: mail, text: String(email) }) : null,
    ]));
  });
  return section;
};

const refreshDrawer = (focusId) => {
  const previous = document.querySelector('.drawer-body');
  const scroll = previous ? previous.scrollTop : 0;
  paintDrawer();
  const next = document.querySelector('.drawer-body');
  if (next) next.scrollTop = scroll;
  if (focusId) {
    const node = document.getElementById(focusId);
    if (node) node.focus();
  }
};

const openJob = (id, opener) => {
  if (!jobsById.has(id)) return;
  returnFocus = opener instanceof HTMLElement ? opener : null;
  openJobId = id;
  if (location.hash !== `#job=${id}`) history.replaceState(null, '', `#job=${id}`);
  paintDrawer();
  setBackgroundInert(true);
  const close = document.getElementById('drawer-close');
  if (close) close.focus();
};

const closeJob = () => {
  if (!openJobId && !document.getElementById('drawer')) return;
  const jobId = openJobId;
  const focus = returnFocus;
  openJobId = '';
  returnFocus = null;
  document.getElementById('drawer-root').replaceChildren();
  setBackgroundInert(false);
  if (location.hash.startsWith('#job=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (focus && document.contains(focus)) focus.focus();
  else if (jobId) {
    const button = document.querySelector(`button.card-open[data-job="${CSS.escape(jobId)}"]`);
    if (button) button.focus();
  }
};

const renderCompare = () => {
  const view = document.getElementById('view-compare');
  const chosen = state.compareIds.map((id) => jobsById.get(id)).filter(Boolean);
  view.replaceChildren(el('div', { class: 'panel' }, [
    el('h2', { text: 'השוואה' }),
    el('p', { class: 'hint', text: chosen.length < 2 ? 'בחרו לפחות 2 משרות להשוואה, ועד 4.' : 'עד 4 משרות זו לצד זו.' }),
  ]));
  if (!chosen.length) {
    view.append(el('p', { class: 'empty', text: 'לא נמצאו משרות' }));
    return;
  }
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: '' }), ...chosen.map((job) => el('th', { scope: 'col' }, [
    el('span', { text: job.title || job.role }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'הסרה',
      on: { click: () => {
        toggleCompare(job.id, false);
        renderCompare();
        renderResults();
      }},
    }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'פרטים',
      on: { click: (event) => openJob(job.id, event.currentTarget) },
    }),
  ]))]);
  table.append(el('thead', {}, [head]));
  const row = (label, cells) => el('tr', {}, [el('th', { scope: 'row', text: label }), ...cells]);
  const body = el('tbody');
  body.append(row('ציון', chosen.map((job) => {
    const scored = scoreJob(job);
    return el('td', { text: scored.score == null ? '—' : formatScore(scored.score) });
  })));
  body.append(row('השלמה', chosen.map((job) => {
    const scored = scoreJob(job);
    return el('td', { text: `דורג ${scored.rated}/${scored.total}${scored.partial ? ' חלקי' : ''}` });
  })));
  state.criteria.forEach((criterion) => {
    body.append(row(criterion.name, chosen.map((job) => {
      const result = criterionValue(job, criterion);
      const note = peekJob(job.id).criterionNotes[criterion.id] || '';
      let value = 'לא דורג';
      if (criterion.type === 'text') value = note || '—';
      else if (criterion.type === 'yesno' && result.value === 5) value = 'כן';
      else if (criterion.type === 'yesno' && result.value === 1) value = 'לא';
      else if (result.value != null) value = String(result.value);
      return el('td', {}, [el('span', { text: value }), note && criterion.type !== 'text' ? el('div', { class: 'muted', text: note }) : null]);
    })));
  });
  body.append(row('סטטוס', chosen.map((job) => el('td', { text: peekJob(job.id).status }))));
  body.append(row('נסיעה', chosen.map((job) => el('td', { text: travelSummary(job) || '—' }))));
  body.append(row('רשות', chosen.map((job) => el('td', { text: job.authority }))));
  table.append(body);
  view.append(el('div', { class: 'table-scroll' }, [table]));
};

const localityHits = (query, exactOnly) => {
  const needle = normName(query);
  if (!needle) return [];
  const hits = [];
  (data.localities || []).forEach((row) => {
    if (!Array.isArray(row) || row.length < 3) return;
    const name = String(row[0]);
    const normalized = normName(name);
    const exact = normalized === needle;
    if (exactOnly && !exact) return;
    if (!exact && !normalized.includes(needle)) return;
    hits.push({ label: name, lat: Number(row[1]), lon: Number(row[2]), exact });
  });
  hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label, 'he'));
  return hits.slice(0, 8);
};

const setHomeStatus = (message) => {
  const node = document.getElementById('home-status');
  if (node) node.textContent = message;
};

const setHome = (place) => {
  state.home = {
    label: String(place.label).split(',').slice(0, 3).join(', ').trim(),
    lat: Math.round(Number(place.lat) * 1e5) / 1e5,
    lon: Math.round(Number(place.lon) * 1e5) / 1e5,
  };
  saveNow();
  setHomeStatus(`הבית הוגדר: ${state.home.label}`);
  const results = document.getElementById('home-results');
  if (results) results.replaceChildren();
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = true;
  toast('הבית הוגדר');
  if (!document.getElementById('view-list').hidden) renderResults();
};

const showHomeChoices = (choices) => {
  const host = document.getElementById('home-results');
  if (!host) return;
  host.replaceChildren(...choices.map((choice) => el('button', {
    type: 'button',
    class: 'btn',
    text: choice.label,
    on: { click: () => setHome(choice) },
  })));
};

const nominatimSearch = async (query) => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'il,ps');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'he');
  url.searchParams.set('viewbox', '34.2,33.4,35.95,29.45');
  url.searchParams.set('bounded', '0');
  const response = await fetch(url);
  if (!response.ok) throw new Error('nominatim');
  const rows = await response.json();
  return rows.map((row) => ({
    label: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  })).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon));
};

const onGeocode = async () => {
  const input = document.getElementById('home-address');
  const query = input ? input.value.trim() : '';
  if (!query) {
    setHomeStatus('הקלידו כתובת.');
    return;
  }
  const exact = localityHits(query, true);
  if (exact.length) {
    setHome(exact[0]);
    return;
  }
  const cacheKey = normName(query);
  if (Array.isArray(state.geocodeCache[cacheKey]) && state.geocodeCache[cacheKey].length) {
    showHomeChoices(state.geocodeCache[cacheKey]);
    setHomeStatus('נמצאו תוצאות שמורות במכשיר. בחרו אחת:');
    return;
  }
  setHomeStatus('מאתר כתובת…');
  try {
    const found = await nominatimSearch(query);
    if (found.length) {
      const keys = Object.keys(state.geocodeCache);
      if (keys.length > 30) delete state.geocodeCache[keys[0]];
      state.geocodeCache[cacheKey] = found;
      save();
    }
    const local = localityHits(query, false);
    const choices = found.concat(local).slice(0, 8);
    if (!choices.length) {
      setHomeStatus('לא הצלחנו לאתר את הכתובת. נסו שם יישוב מהרשימה, או בדקו את החיבור לאינטרנט.');
      return;
    }
    setHomeStatus(found.length ? 'בחרו תוצאה:' : 'האיתור המקוון לא מצא כתובת. אפשר לבחור יישוב מהרשימה המקומית:');
    showHomeChoices(choices);
  } catch (error) {
    const local = localityHits(query, false);
    if (local.length) {
      setHomeStatus('האיתור המקוון נכשל. אפשר לבחור יישוב מהרשימה המקומית:');
      showHomeChoices(local);
      return;
    }
    setHomeStatus('לא הצלחנו לאתר את הכתובת. נסו שם יישוב מהרשימה, או בדקו את החיבור לאינטרנט.');
  }
};

const onGps = () => {
  if (!navigator.geolocation) {
    setHomeStatus('הדפדפן לא מאפשר גישה למיקום.');
    return;
  }
  setHomeStatus('מבקש את מיקום המכשיר…');
  navigator.geolocation.getCurrentPosition(
    (position) => setHome({ label: 'המיקום שלי', lat: position.coords.latitude, lon: position.coords.longitude }),
    () => setHomeStatus('לא התקבל מיקום. אפשר להקליד כתובת במקום.'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
};

const storeRoute = (mode, authority, value) => {
  const key = homeKey(state.home);
  if (!state.routes[key]) state.routes[key] = { car: {}, bike: {}, walk: {} };
  if (!state.routes[key][mode]) state.routes[key][mode] = {};
  state.routes[key][mode][authority] = value;
};

const fetchOsrm = async (mode, names) => {
  const spec = OSRM[mode];
  const coords = [`${state.home.lon},${state.home.lat}`].concat(names.map((name) => {
    const point = authorityPoint.get(name);
    return `${point.lon},${point.lat}`;
  })).join(';');
  const url = `https://routing.openstreetmap.de/${spec.host}/table/v1/${spec.profile}/${coords}?sources=0&annotations=duration,distance`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('osrm');
  const body = await response.json();
  if (body.code !== 'Ok' || !body.durations || !body.durations[0]) throw new Error('osrm');
  names.forEach((name, index) => {
    const duration = body.durations[0][index + 1];
    const distance = body.distances && body.distances[0] ? body.distances[0][index + 1] : null;
    if (duration == null) return;
    storeRoute(mode, name, { min: Math.max(0, Math.round(duration / 60)), km: distance == null ? null : Math.round(distance / 100) / 10 });
  });
};

const fetchOrs = async (mode, names) => {
  const locations = [[state.home.lon, state.home.lat]].concat(names.map((name) => {
    const point = authorityPoint.get(name);
    return [point.lon, point.lat];
  }));
  const response = await fetch(`https://api.openrouteservice.org/v2/matrix/${ORS[mode]}`, {
    method: 'POST',
    headers: { Authorization: state.routingKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, sources: [0], metrics: ['duration', 'distance'], units: 'm' }),
  });
  if (!response.ok) throw new Error('ors');
  const body = await response.json();
  names.forEach((name, index) => {
    const duration = body.durations && body.durations[0] ? body.durations[0][index + 1] : null;
    const distance = body.distances && body.distances[0] ? body.distances[0][index + 1] : null;
    if (duration == null) return;
    storeRoute(mode, name, { min: Math.max(0, Math.round(duration / 60)), km: distance == null ? null : Math.round(distance / 100) / 10 });
  });
};

const computeRoutes = async () => {
  const status = document.getElementById('route-status');
  if (!state.home) {
    if (status) status.textContent = 'קודם מגדירים כתובת בית.';
    return;
  }
  const names = [...authorityPoint.keys()];
  const missing = ['car', 'bike', 'walk'].some((mode) => names.some((name) => !(state.routes[homeKey(state.home)] && state.routes[homeKey(state.home)][mode] && state.routes[homeKey(state.home)][mode][name])));
  if (!missing) {
    if (status) status.textContent = 'זמני הנסיעה כבר שמורים במכשיר.';
    return;
  }
  const service = state.routingKey ? 'openrouteservice' : 'OSRM';
  const agreed = window.confirm(`חישוב המסלול שולח את קואורדינטות הבית ומיקומי הרשויות לשירות חיצוני (${service}). להמשיך?`);
  if (!agreed) {
    if (status) status.textContent = 'החישוב בוטל. מוצג קו אווירי (הערכה).';
    return;
  }
  if (status) status.textContent = 'מחשב מסלולים…';
  let failed = false;
  for (let index = 0; index < ['car', 'bike', 'walk'].length; index += 1) {
    const mode = ['car', 'bike', 'walk'][index];
    const todo = names.filter((name) => !(state.routes[homeKey(state.home)] && state.routes[homeKey(state.home)][mode] && state.routes[homeKey(state.home)][mode][name]));
    if (!todo.length) continue;
    if (index > 0) await sleep(1200);
    try {
      const chunks = [];
      for (let start = 0; start < todo.length; start += 80) chunks.push(todo.slice(start, start + 80));
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        if (chunkIndex > 0) await sleep(1200);
        if (state.routingKey) await fetchOrs(mode, chunks[chunkIndex]);
        else await fetchOsrm(mode, chunks[chunkIndex]);
      }
    } catch (error) {
      failed = true;
    }
  }
  saveNow();
  if (status) status.textContent = failed
    ? 'חלק מהמסלולים לא התקבלו. איפה שאין מסלול מוצג קו אווירי (הערכה).'
    : 'זמני הנסיעה נשמרו במכשיר.';
  renderResults();
  if (openJobId) refreshDrawer();
};

const download = (filename, text, type) => {
  const blob = new Blob([text], { type });
  const link = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 500);
};

const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
};

const exportCsv = () => {
  const headers = ['משרה', 'רשות', 'סוג רשות', 'מחוז', 'תפקיד', 'תחום', 'אוכלוסייה', 'אשכול חברתי-כלכלי', 'מדד פריפריאליות', 'ציון', 'דורג', 'סטטוס', 'מועדף', 'הערות כלליות'];
  state.criteria.forEach((criterion) => {
    headers.push(criterion.name);
    if (criterion.type !== 'text') headers.push(`${criterion.name} – הערות`);
  });
  headers.push('דקות נסיעה', 'ק"מ קו אווירי', 'קישור');
  const lines = [headers.map(csvCell).join(',')];
  jobs.forEach((job) => {
    const user = peekJob(job.id);
    const scored = scoreJob(job);
    const cells = [
      job.title, job.authority, labelOrUnknown(job.authorityType), labelOrUnknown(job.district), job.role,
      (job.categories || []).join('; '), labelOrUnknown(job.population), labelOrUnknown(job.socioEconomic),
      labelOrUnknown(job.peripherality), scored.score == null ? '' : formatScore(scored.score),
      `${scored.rated}/${scored.total}`, user.status, user.favorite ? 'כן' : '', user.notes,
    ];
    state.criteria.forEach((criterion) => {
      const result = criterionValue(job, criterion);
      const note = user.criterionNotes[criterion.id] || '';
      if (criterion.type === 'text') cells.push(note);
      else {
        let value = '';
        if (criterion.type === 'yesno' && result.value === 5) value = 'כן';
        else if (criterion.type === 'yesno' && result.value === 1) value = 'לא';
        else if (result.value != null) value = String(result.value);
        cells.push(value, note);
      }
    });
    const minutes = travelMinutes(job);
    cells.push(minutes == null ? '' : String(minutes), airKm(job) == null ? '' : String(Math.round(airKm(job) * 10) / 10), job.url);
    lines.push(cells.map(csvCell).join(','));
  });
  download('bogrim-jobs.csv', `\ufeff${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  toast('קובץ ה-CSV ירד');
};

const exportJson = () => {
  const payload = { app: 'bogrim-jobs', version: 1, exportedAt: new Date().toISOString(), state };
  download('bogrim-jobs-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('קובץ ה-JSON ירד');
};

const validImport = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.jobs || typeof value.jobs !== 'object' || Array.isArray(value.jobs)) return false;
  if (!Array.isArray(value.criteria) || !value.criteria.every(validCriterion)) return false;
  return true;
};

const importText = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    toast('הקובץ אינו גיבוי תקין. הנתונים הקיימים נשמרו.');
    return;
  }
  const incoming = parsed && parsed.state ? parsed.state : parsed;
  if (!validImport(incoming)) {
    toast('הקובץ אינו גיבוי תקין. הנתונים הקיימים נשמרו.');
    return;
  }
  if (!window.confirm('ייבוא יחליף את הנתונים השמורים בדפדפן. להמשיך?')) return;
  state = sanitizeState(incoming);
  state.compareIds = state.compareIds.filter((id) => jobsById.has(id));
  saveNow();
  rebuildShells();
  toast('הנתונים יובאו');
};

const rebuildShells = () => {
  if (openJobId) closeJob();
  const list = document.getElementById('view-list');
  list.replaceChildren();
  delete list.dataset.ready;
  document.getElementById('view-settings').replaceChildren();
  document.getElementById('view-compare').replaceChildren();
  if (map) {
    map.remove();
    map = null;
    mapLayer = null;
  }
  renderListShell();
  updateCompareCount();
  showView('list');
};

const clearData = () => {
  if (!window.confirm('למחוק את כל הנתונים השמורים בדפדפן הזה?')) return;
  state = defaultState();
  saveNow();
  rebuildShells();
  toast('הנתונים נמחקו');
};

const renderCriteriaEditor = (host) => {
  host.replaceChildren();
  const weightSum = state.criteria.reduce((sum, criterion) => sum + (criterion.type === 'text' ? 0 : Number(criterion.weight) || 0), 0) || 1;
  state.criteria.forEach((criterion, index) => {
    const name = el('input', { type: 'text', value: criterion.name, 'data-crit-name': criterion.id, 'aria-label': `שם הקריטריון ${criterion.name}` });
    name.addEventListener('input', () => {
      criterion.name = name.value;
      save();
    });
    const type = el('select', { 'aria-label': `סוג הקריטריון ${criterion.name}` });
    CRIT_TYPES.forEach(([key, label]) => {
      const option = el('option', { value: key, text: label });
      if (key === criterion.type) option.selected = true;
      type.append(option);
    });
    type.addEventListener('change', () => {
      if (type.value === 'travel' && state.criteria.some((item) => item !== criterion && item.type === 'travel')) {
        toast('אפשר קריטריון נסיעה אחד');
        type.value = criterion.type;
        return;
      }
      criterion.type = type.value;
      save();
      renderCriteriaEditor(host);
      renderResults();
    });
    const weight = el('input', { type: 'number', min: '0', max: '100', value: String(criterion.weight), 'aria-label': `משקל ${criterion.name}` });
    const percent = el('span', { class: 'muted', text: criterion.type === 'text' ? 'ללא ציון' : `${Math.round((Number(criterion.weight) || 0) / weightSum * 100)}%` });
    weight.addEventListener('change', () => {
      criterion.weight = Math.max(0, Math.min(100, Number(weight.value) || 0));
      save();
      renderCriteriaEditor(host);
      renderResults();
    });
    const move = (direction) => {
      const target = index + direction;
      if (target < 0 || target >= state.criteria.length) return;
      const [item] = state.criteria.splice(index, 1);
      state.criteria.splice(target, 0, item);
      save();
      renderCriteriaEditor(host);
    };
    host.append(el('div', { class: 'criterion-editor' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'שם' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'סוג' }), type]),
      criterion.type === 'text' ? null : el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'משקל' }), weight, percent]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn', text: 'הזזה למעלה', disabled: index === 0, 'aria-label': `הזזה למעלה ${criterion.name}`, on: { click: () => move(-1) } }),
        el('button', { type: 'button', class: 'btn', text: 'הזזה למטה', disabled: index === state.criteria.length - 1, 'aria-label': `הזזה למטה ${criterion.name}`, on: { click: () => move(1) } }),
        el('button', {
          type: 'button',
          class: 'btn danger',
          text: 'מחיקה',
          'aria-label': `מחיקת קריטריון ${criterion.name}`,
          on: { click: () => {
            if (!window.confirm(`למחוק את הקריטריון ${criterion.name}?`)) return;
            state.criteria.splice(index, 1);
            save();
            renderCriteriaEditor(host);
            renderResults();
          }},
        }),
      ]),
    ]));
  });
};

const renderSettings = () => {
  const view = document.getElementById('view-settings');
  const homeInput = el('input', { id: 'home-address', type: 'text', autocomplete: 'street-address', value: state.home ? state.home.label : '' });
  const keyInput = el('input', { id: 'routing-key', type: 'password', autocomplete: 'off', value: state.routingKey });
  keyInput.addEventListener('change', () => {
    state.routingKey = keyInput.value.trim();
    save();
  });
  const editor = el('div', { id: 'criteria-editor' });
  view.replaceChildren(
    el('section', { class: 'panel' }, [
      el('h2', { text: 'כתובת הבית' }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'כתובת הבית' }), homeInput]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'geocode-home', text: 'אתר כתובת', on: { click: () => { onGeocode(); } } }),
        el('button', { type: 'button', class: 'btn', id: 'use-my-location', text: 'המיקום שלי', on: { click: () => onGps() } }),
      ]),
      el('p', { id: 'home-status', text: state.home ? `הבית הוגדר: ${state.home.label}` : 'עוד לא הוגדרה כתובת.' }),
      el('div', { id: 'home-results', class: 'row' }),
      el('p', { class: 'hint', text: 'אם היישוב לא ברשימה המקומית, הכתובת נשלחת ל-Nominatim (OpenStreetMap) רק אחרי הלחיצה.' }),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'נסיעה' }),
      el('p', { class: 'notice', id: 'route-notice', text: 'החישוב שולח את קואורדינטות הבית ומיקומי הרשויות לשירות חיצוני.' }),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'compute-routes', text: 'חשב זמני נסיעה', on: { click: () => { computeRoutes(); } } }),
      ]),
      el('p', { id: 'route-status', text: 'בלי חישוב מוצג קו אווירי (הערכה).' }),
      el('label', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'מפתח openrouteservice (לא חובה)' }),
        keyInput,
      ]),
      el('p', { class: 'hint', text: 'המפתח נשמר רק במכשיר. בלי מפתח משתמשים ב-OSRM הציבורי.' }),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'קריטריונים' }),
      el('p', { class: 'hint', text: 'קריטריון בלי דירוג לא נספר כאפס. הציון הוא ממוצע משוקלל של הקריטריונים שדורגו.' }),
      editor,
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'btn',
          id: 'add-criterion',
          text: 'הוספת קריטריון',
          on: { click: () => {
            state.criteria.push({ id: uid(), name: 'קריטריון חדש', type: 'rating', weight: 10 });
            save();
            renderCriteriaEditor(editor);
          }},
        }),
        el('button', {
          type: 'button',
          class: 'btn',
          id: 'reset-criteria',
          text: 'איפוס לברירת מחדל',
          on: { click: () => {
            if (!window.confirm('לאפס את הקריטריונים לברירת המחדל?')) return;
            state.criteria = defaultCriteria();
            save();
            renderCriteriaEditor(editor);
            renderResults();
          }},
        }),
      ]),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'שמירה' }),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'export-json', text: 'ייצוא JSON', on: { click: () => exportJson() } }),
        el('button', { type: 'button', class: 'btn', id: 'import-json', text: 'ייבוא JSON', on: { click: () => document.getElementById('import-file').click() } }),
        el('button', { type: 'button', class: 'btn', id: 'export-csv', text: 'ייצוא CSV', on: { click: () => exportCsv() } }),
        el('button', { type: 'button', class: 'btn danger', id: 'clear-data', text: 'נקה נתונים', on: { click: () => clearData() } }),
      ]),
      el('p', { class: 'hint', text: 'הקבצים נשמרים אצלכם. ייבוא מחליף את הנתונים בדפדפן רק אחרי אישור.' }),
    ]),
  );
  renderCriteriaEditor(editor);
};

const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = el('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' });
    document.head.append(css);
    const script = el('script', { src: 'vendor/leaflet/leaflet.js' });
    script.addEventListener('load', () => resolve(window.L));
    script.addEventListener('error', () => reject(new Error('leaflet')));
    document.body.append(script);
  });
  return leafletLoading;
};

const drawMarkers = (leaflet) => {
  if (!map) return;
  if (mapLayer) mapLayer.remove();
  mapLayer = leaflet.layerGroup().addTo(map);
  const groups = new Map();
  visibleJobs().forEach((job) => {
    if (job.lat == null || job.lon == null) return;
    if (!groups.has(job.authority)) groups.set(job.authority, []);
    groups.get(job.authority).push(job);
  });
  const bounds = [];
  groups.forEach((group) => {
    const best = group.map((job) => scoreJob(job).score).filter((score) => score != null).sort((a, b) => b - a)[0];
    const color = best == null ? '#57534e' : ({ 1: '#9f1239', 2: '#9a3412', 3: '#1e3a8a', 4: '#1d4e89', 5: '#166534' }[Math.max(1, Math.min(5, Math.round(best)))] || '#57534e');
    const marker = leaflet.circleMarker([group[0].lat, group[0].lon], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95,
    });
    marker.on('click', () => {
      if (group.length === 1) openJob(group[0].id, null);
    });
    if (group.length > 1) {
      const popup = el('div');
      popup.append(el('strong', { text: group[0].authority }));
      group.forEach((job) => {
        popup.append(el('button', {
          type: 'button',
          class: 'btn',
          text: job.role || job.title,
          on: { click: () => openJob(job.id, null) },
        }));
      });
      marker.bindPopup(popup);
    }
    marker.addTo(mapLayer);
    bounds.push([group[0].lat, group[0].lon]);
  });
  if (state.home) {
    const home = leaflet.marker([state.home.lat, state.home.lon], {
      title: 'הבית',
      icon: leaflet.divIcon({ className: 'home-pin', iconSize: [16, 16] }),
    });
    home.bindPopup(el('span', { text: state.home.label || 'הבית' }));
    home.addTo(mapLayer);
    bounds.push([state.home.lat, state.home.lon]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
};

const ensureMap = async () => {
  const host = document.getElementById('map');
  try {
    const leaflet = await loadLeaflet();
    if (!map) {
      map = leaflet.map(host, { zoomControl: true });
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      map.setView([31.4, 34.9], 8);
    }
    setTimeout(() => { if (map) map.invalidateSize(); }, 60);
    drawMarkers(leaflet);
  } catch (error) {
    host.replaceChildren(el('p', { class: 'empty', text: 'המפה לא נטענה. שאר האתר זמין בלי מפה.' }));
  }
};

const showView = (name) => {
  ['list', 'compare', 'map', 'settings', 'privacy', 'help'].forEach((view) => {
    const section = document.getElementById(`view-${view}`);
    if (section) section.hidden = view !== name;
    const tab = document.querySelector(`#nav [data-view="${view}"]`);
    if (!tab) return;
    tab.classList.toggle('is-active', view === name);
    if (view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (name === 'list') {
    renderListShell();
    renderResults();
  }
  if (name === 'compare') renderCompare();
  if (name === 'settings') renderSettings();
  if (name === 'map') ensureMap();
};

const jobIdFromHash = () => {
  const match = /^#job=([A-Za-z0-9-]+)$/.exec(location.hash);
  return match ? match[1] : '';
};

const boot = async () => {
  const response = await fetch(new URL('./data.json', import.meta.url));
  if (!response.ok) throw new Error('data');
  data = await response.json();
  jobs = data.jobs || [];
  jobsById = new Map(jobs.map((job) => [job.id, job]));
  authorityPoint = new Map();
  jobs.forEach((job) => {
    if (job.lat == null || job.lon == null || authorityPoint.has(job.authority)) return;
    authorityPoint.set(job.authority, job);
  });
  state = loadState();
  state.compareIds = state.compareIds.filter((id) => jobsById.has(id));
  const count = document.getElementById('job-count');
  if (count) count.textContent = `${data.meta && data.meta.count ? data.meta.count : jobs.length} משרות`;
  document.querySelectorAll('#nav [data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  document.getElementById('import-file').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importText(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (openJobId) {
        event.preventDefault();
        closeJob();
        return;
      }
      const filters = document.getElementById('filters');
      if (filters && filters.classList.contains('is-open')) {
        filters.classList.remove('is-open');
        const toggle = document.getElementById('filter-toggle');
        if (toggle) toggle.focus();
      }
    } else if (event.key === 'Tab' && openJobId) trapFocus(event);
  });
  window.addEventListener('hashchange', () => {
    const id = jobIdFromHash();
    if (id && jobsById.has(id)) openJob(id, document.activeElement);
    else if (!id && openJobId) closeJob();
  });
  window.addEventListener('pagehide', () => saveNow());
  renderListShell();
  renderResults();
  updateCompareCount();
  const hashed = jobIdFromHash();
  if (hashed && jobsById.has(hashed)) openJob(hashed, null);
  window.__app = {
    get state() { return state; },
    jobs,
    scoreJob,
    travelMinutes,
    airKm,
  };
};

boot().catch(() => {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = 'לא הצלחנו לטעון את רשימת המשרות.';
});
