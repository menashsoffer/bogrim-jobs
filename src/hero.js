import { el } from './dom.js';
import { renderResults } from './job-list.js';
import { save, store } from './store.js';

const dismissHero = () => {
  store.state.welcomeSeen = true;
  save();
  const node = document.getElementById('welcome');
  if (node) node.remove();
  const stats = document.getElementById('hero-stats');
  if (stats) stats.remove();
  const list = document.getElementById('jobs');
  renderResults();
  if (list) list.focus();
};
const openHelp = () => {
  const tab = document.querySelector('#nav [data-view="help"]');
  if (tab) tab.click();
};
const paintStats = () => {
  const jobs = store.jobs || [];
  const authorities = new Set(jobs.map((job) => job.authority).filter(Boolean)).size;
  const districts = new Set(jobs.map((job) => job.district).filter(Boolean)).size;
  const values = { 'stat-jobs': jobs.length, 'stat-authorities': authorities, 'stat-districts': districts };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  });
  const title = document.getElementById('hero-t');
  if (title && jobs.length) {
    title.replaceChildren(`${jobs.length} משרות.`, el('br'), el('span', { text: 'בחירה אחת ברורה.' }));
  }
};
const bindHero = () => {
  const start = document.getElementById('welcome-start');
  const help = document.getElementById('welcome-dismiss');
  if (start && !start.dataset.bound) {
    start.dataset.bound = '1';
    start.addEventListener('click', dismissHero);
  }
  if (help && !help.dataset.bound) {
    help.dataset.bound = '1';
    help.addEventListener('click', openHelp);
  }
  paintStats();
};
export const mountHero = () => {
  if (store.state.welcomeSeen) {
    document.getElementById('welcome')?.remove();
    document.getElementById('hero-stats')?.remove();
    return [];
  }
  bindHero();
  return [];
};
