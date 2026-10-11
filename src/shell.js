import { toast } from './dom.js';
import { pushView } from './history.js';
import { renderCompare } from './job-compare.js';
import { closeJob, refreshDrawer } from './job-drawer.js';
import { renderListShell, renderResults, updateCompareCount } from './job-list.js';
import { ensureMap } from './job-map.js';
import { renderSettings } from './settings-panel.js';
import { STORAGE_KEY, defaultState, store } from './store.js';

export const reloadOpenViews = () => {
  if (store.openJobId) closeJob();
  const list = document.getElementById('view-list');
  list.replaceChildren();
  delete list.dataset.ready;
  document.getElementById('view-settings').replaceChildren();
  document.getElementById('view-compare').replaceChildren();
  if (store.map) {
    store.map.remove();
    store.map = null;
    store.mapLayer = null;
  }
  renderListShell();
  updateCompareCount();
  renderResults();
  const settings = document.getElementById('view-settings');
  if (settings && !settings.hidden) renderSettings();
  const compare = document.getElementById('view-compare');
  if (compare && !compare.hidden) renderCompare();
  const map = document.getElementById('view-map');
  if (map && !map.hidden) ensureMap();
};
export const rebuildShells = () => {
  if (store.openJobId) closeJob();
  const list = document.getElementById('view-list');
  list.replaceChildren();
  delete list.dataset.ready;
  document.getElementById('view-settings').replaceChildren();
  document.getElementById('view-compare').replaceChildren();
  if (store.map) {
    store.map.remove();
    store.map = null;
    store.mapLayer = null;
  }
  renderListShell();
  updateCompareCount();
  showView('list');
};
export const clearData = () => {
  if (!window.confirm('למחוק את כל הנתונים השמורים בדפדפן הזה?')) return;
  clearTimeout(store.saveTimer);
  localStorage.removeItem(STORAGE_KEY);
  store.state = defaultState();
  store.lastSaved = '';
  rebuildShells();
  toast('הנתונים נמחקו');
};
export const refreshAfterStorage = () => {
  store.listDirty = false;
  updateCompareCount();
  renderListShell();
  renderResults();
  const compare = document.getElementById('view-compare');
  if (compare && !compare.hidden && compare.childElementCount) renderCompare();
  const settings = document.getElementById('view-settings');
  if (settings && !settings.hidden && settings.childElementCount) renderSettings();
  const map = document.getElementById('view-map');
  if (map && !map.hidden) ensureMap();
  if (store.openJobId) refreshDrawer();
};
export const showView = (name) => {
  const sheet = document.getElementById('filters');
  if (sheet && sheet.classList.contains('is-open') && !store.ignoreHistory) sheet.classList.remove('is-open');
  pushView(name);
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
