import { store } from './store.js';

const VIEWS = new Set(['list', 'compare', 'map', 'settings', 'privacy', 'help']);

export const jobIdFromHash = () => {
  const match = /^#job=([A-Za-z0-9-]+)$/.exec(location.hash);
  return match ? match[1] : '';
};
export const viewFromHash = () => {
  const match = /^#view=([a-z]+)$/.exec(location.hash);
  return match && VIEWS.has(match[1]) ? match[1] : '';
};
export const filtersFromHash = () => location.hash === '#filters';
const here = () => `${location.pathname}${location.search}`;

export const pushJob = (id) => {
  if (store.ignoreHistory || location.hash === `#job=${id}`) return;
  history.pushState({ bogrim: 'job', id }, '', `#job=${id}`);
};
export const pushFilters = () => {
  if (store.ignoreHistory || filtersFromHash()) return;
  history.pushState({ bogrim: 'filters' }, '', '#filters');
};
export const pushView = (name) => {
  if (store.ignoreHistory) return;
  if (history.state && history.state.bogrim === 'filters') {
    const url = name === 'list' ? here() : `#view=${name}`;
    history.replaceState({ bogrim: name === 'list' ? 'list' : 'view', view: name }, '', url);
    return;
  }
  if (name === 'list') {
    if (history.state && history.state.bogrim === 'view') {
      store.ignoreHistory = true;
      history.back();
    } else if (location.hash.startsWith('#view=')) {
      history.replaceState({ bogrim: 'list' }, '', here());
    }
    return;
  }
  if (viewFromHash() === name) return;
  history.pushState({ bogrim: 'view', view: name }, '', `#view=${name}`);
};
export const backIf = (kind) => {
  if (store.ignoreHistory || !history.state || history.state.bogrim !== kind) return false;
  store.ignoreHistory = true;
  history.back();
  return true;
};
