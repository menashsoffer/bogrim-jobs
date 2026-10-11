import { toast } from './dom.js';
import { renderCompare } from './job-compare.js';
import { closeJob } from './job-drawer.js';
import { renderListShell, renderResults, updateCompareCount } from './job-list.js';
import { ensureMap } from './job-map.js';
import { renderSettings } from './settings-panel.js';
import { STORAGE_KEY, defaultState, store } from './store.js';

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
  rebuildShells();
  toast('הנתונים נמחקו');
};
export const showView = (name) => {
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
