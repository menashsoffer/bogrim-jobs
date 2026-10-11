import { importText } from './backup.js';
import { closeJob, openJob, trapFocus } from './job-drawer.js';
import { renderListShell, renderResults, updateCompareCount } from './job-list.js';
import { airKm, scoreJob, travelMinutes } from './score.js';
import { showView } from './shell.js';
import { loadState, saveNow, store } from './store.js';

export const jobIdFromHash = () => {
  const match = /^#job=([A-Za-z0-9-]+)$/.exec(location.hash);
  return match ? match[1] : '';
};
export const boot = async () => {
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
  store.state.compareIds = store.state.compareIds.filter((id) => store.jobsById.has(id));
  const count = document.getElementById('job-count');
  if (count) count.textContent = `${store.data.meta && store.data.meta.count ? store.data.meta.count : store.jobs.length} משרות`;
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
      if (store.openJobId) {
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
    } else if (event.key === 'Tab' && store.openJobId) trapFocus(event);
  });
  window.addEventListener('hashchange', () => {
    const id = jobIdFromHash();
    if (id && store.jobsById.has(id)) openJob(id, document.activeElement);
    else if (!id && store.openJobId) closeJob();
  });
  window.addEventListener('pagehide', () => saveNow());
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (header) header.classList.toggle('is-compact', window.scrollY > 8);
  }, { passive: true });
  renderListShell();
  renderResults();
  updateCompareCount();
  const hashed = jobIdFromHash();
  if (hashed && store.jobsById.has(hashed)) openJob(hashed, null);
  if (new URLSearchParams(location.search).get('test') === '1') {
    window.__app = {
      get state() { return store.state; },
      jobs: store.jobs,
      scoreJob,
      travelMinutes,
      airKm,
    };
  }
};

boot().catch(() => {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = 'לא הצלחנו לטעון את רשימת המשרות.';
});
