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
const horizon = () => {
  const picture = el('picture', { class: 'hero-art' });
  picture.append(el('source', { media: '(min-width: 760px)', srcset: 'img/hero-relief.webp', width: '2400', height: '1100' }));
  picture.append(el('img', {
    src: 'img/hero-relief-m.webp',
    alt: '',
    width: '900',
    height: '900',
    fetchpriority: 'high',
  }));
  return picture;
};
export const mountHero = () => {
  if (store.state.welcomeSeen) {
    document.getElementById('welcome')?.remove();
    document.getElementById('hero-stats')?.remove();
    return [];
  }
  if (document.getElementById('welcome')) {
    bindHero();
    return [];
  }
  const jobs = store.jobs || [];
  const authorities = new Set(jobs.map((job) => job.authority).filter(Boolean)).size;
  const districts = new Set(jobs.map((job) => job.district).filter(Boolean)).size;
  return [
    el('section', { class: 'hero', id: 'welcome', 'aria-labelledby': 'hero-t' }, [
      el('div', { class: 'hero-copy' }, [
        el('p', { class: 'eyebrow rise r1' }, [
          el('span', { class: 'eyebrow-dot', 'aria-hidden': 'true' }),
          'בוגרים לשלטון המקומי',
        ]),
        el('h2', { class: 'hero-title rise r2', id: 'hero-t' }, [
          `${jobs.length} משרות.`,
          el('br'),
          el('span', { text: 'בחירה אחת ברורה.' }),
        ]),
        el('p', {
          class: 'hero-sub rise r3',
          text: 'דרגו כל משרה לפי מה שחשוב לכם — התפקיד, המרחק מהבית, התנאים — וראו בבהירות מה באמת מתאים.',
        }),
        el('div', { class: 'hero-cta rise r4' }, [
          el('button', { type: 'button', class: 'btn primary', id: 'welcome-start', text: 'להתחיל לדרג', on: { click: dismissHero } }),
          el('button', { type: 'button', class: 'btn-link', id: 'welcome-dismiss', text: 'איך זה עובד', on: { click: openHelp } }),
        ]),
      ]),
      horizon(),
    ]),
    el('section', { class: 'stats-wrap', id: 'hero-stats', 'aria-label': 'במספרים' }, [
      el('dl', { class: 'stats rise r5' }, [
        el('div', {}, [el('dt', { text: 'משרות פתוחות' }), el('dd', { id: 'stat-jobs', text: String(jobs.length) })]),
        el('div', {}, [el('dt', { text: 'רשויות' }), el('dd', { id: 'stat-authorities', text: String(authorities) })]),
        el('div', {}, [el('dt', { text: 'מחוזות' }), el('dd', { id: 'stat-districts', text: String(districts) })]),
      ]),
    ]),
  ];
};
