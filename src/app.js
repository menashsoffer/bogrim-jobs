import { importText } from './backup.js';
import { distanceStops, distanceText, scoreStops, scoreText, timeStops, timeText } from './filter-scale.js';
import { filtersFromHash, jobIdFromHash, viewFromHash } from './history.js';
import { closeJob, openJob, trapFocus } from './job-drawer.js';
import { cardDrift, centerCard, parkAndOpen, restoredAnchor, scrollRestoreDone, whenLayoutSettles } from './scroll-anchor.js';
import { closeFilterSheet, jobPlace, renderListShell, renderResults, updateCompareCount } from './job-list.js';
import { formatDuration, toast } from './dom.js';
import { moovitAppUrl, moovitWebUrl } from './moovit.js';
import { airKm, matches, scoreJob, travelMinutes, travelSummary } from './score.js';
import { refreshAfterStorage, showView } from './shell.js';
import { paintHomeChip } from './travel.js';
import { STORAGE_KEY, loadState, sanitizeState, saveNow, store, takeRemoteState } from './store.js';

let bootReady = false;
const syncFromLocation = () => {
  store.ignoreHistory = true;
  try {
    const job = jobIdFromHash();
    if (job && store.jobsById.has(job)) {
      if (store.openJobId !== job) openJob(job, document.activeElement);
    } else if (store.openJobId) closeJob();
    const sheet = document.getElementById('filters');
    if (sheet) sheet.classList.toggle('is-open', filtersFromHash());
    const named = viewFromHash();
    if (named) showView(named);
    else if (!job) showView('list');
  } finally {
    store.ignoreHistory = false;
  }
};
const applyLocation = () => {
  const named = viewFromHash();
  if (named) showView(named);
  if (filtersFromHash()) {
    const sheet = document.getElementById('filters');
    if (sheet) sheet.classList.add('is-open');
  }
  const hashed = jobIdFromHash();
  if (hashed && store.jobsById.has(hashed) && store.openJobId !== hashed) openJob(hashed, null);
};
export const boot = async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('popstate', () => {
    store.sawPop = true;
    if (store.ignoreHistory) {
      store.ignoreHistory = false;
      return;
    }
    if (bootReady) syncFromLocation();
  });
  window.addEventListener('hashchange', () => {
    if (!bootReady) return;
    if (store.sawPop) {
      store.sawPop = false;
      return;
    }
    syncFromLocation();
  });
  const response = await fetch(new URL('./data.json', import.meta.url));
  if (!response.ok) throw new Error('data');
  store.data = await response.json();
  store.jobs = store.data.jobs || [];
  store.jobsById = new Map(store.jobs.map((job) => [job.id, job]));
  store.authorityPoint = new Map();
  store.jobs.forEach((job) => {
    if (job.lat == null || job.lon == null || store.authorityPoint.has(job.authority)) return;
    store.authorityPoint.set(job.authority, job);
  });
  store.state = loadState();
  try { store.lastSaved = localStorage.getItem(STORAGE_KEY) || ''; } catch (error) { store.lastSaved = ''; }
  if (store.state.carOnlyNotice) {
    toast('המיקום מחושב עכשיו לפי נסיעה ברכב בלבד');
    saveNow();
  }
  store.state.compareIds = store.state.compareIds.filter((id) => store.jobsById.has(id));
  const count = document.getElementById('job-count');
  if (count) count.textContent = `${store.data.meta && store.data.meta.count ? store.data.meta.count : store.jobs.length} משרות`;
  document.querySelectorAll('#nav [data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  const homeChip = document.getElementById('home-chip');
  if (homeChip) homeChip.addEventListener('click', () => {
    const tab = document.querySelector('#nav [data-view="settings"]');
    if (tab) tab.click();
    const address = document.getElementById('home-address');
    if (address) address.focus();
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
      if (store.openJobId) {
        event.preventDefault();
        closeJob();
        return;
      }
      closeFilterSheet();
    } else if (event.key === 'Tab' && store.openJobId) trapFocus(event);
  });
  window.addEventListener('pagehide', () => saveNow());
  window.addEventListener('storage', (event) => {
    if (!bootReady || event.key !== STORAGE_KEY) return;
    if (!takeRemoteState()) return;
    store.state.compareIds = store.state.compareIds.filter((id) => store.jobsById.has(id));
    refreshAfterStorage();
  });
  renderListShell();
  paintHomeChip();
  bootReady = true;
  applyLocation();
  if (new URLSearchParams(location.search).get('test') === '1') {
    window.__app = {
      get state() { return store.state; },
      jobs: store.jobs,
      scoreJob,
      matches,
      travelMinutes,
      travelSummary,
      formatDuration,
      sanitizeState,
      moovitWebUrl,
      moovitAppUrl,
      airKm,
      timeStops,
      distanceStops,
      scoreStops,
      timeText,
      distanceText,
      scoreText,
      whenLayoutSettles,
      scrollRestoreDone,
      centerCard,
      cardDrift,
      parkAndOpen,
      restoredAnchor,
    };
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  renderResults();
  updateCompareCount();
  if (store.openJobId && store.returnIndex < 0) store.returnIndex = jobPlace(store.openJobId);
};

boot().catch(() => {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = 'לא הצלחנו לטעון את רשימת המשרות.';
});
