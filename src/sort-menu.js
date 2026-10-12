import { el, toast } from './dom.js';
import { icon } from './icons.js';
import { renderResults } from './job-list.js';
import { save, store } from './store.js';

const KEYS = [['score', 'ציון'], ['time', 'זמן נסיעה'], ['name', 'שם'], ['completeness', 'השלמה'], ['distance', 'מרחק']];
const sortDirectionText = (direction) => (direction === 'asc' ? 'עולה' : 'יורד');
const sortLabel = (key) => (KEYS.find(([id]) => id === key) || KEYS[0])[1];
const paintSortDirection = (button, direction) => {
  const label = sortDirectionText(direction);
  const text = button.querySelector('span');
  if (text) text.textContent = label;
  button.setAttribute('aria-label', `כיוון מיון: ${label}`);
};
export const mountSort = () => {
  const sort = el('select', { id: 'sort-key', 'aria-label': 'מיון', hidden: true });
  KEYS.forEach(([key, label]) => {
    const option = el('option', { value: key, text: label });
    if (key === store.state.sortKey) option.selected = true;
    sort.append(option);
  });
  const button = el('button', {
    type: 'button',
    class: 'ghost-btn',
    id: 'sort-open',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-controls': 'sort-menu',
  }, [icon('arrow-up-down', 'sm'), el('span', { text: `מיון: ${sortLabel(store.state.sortKey)}` })]);
  const menu = el('div', { class: 'sort-menu', id: 'sort-menu', role: 'menu', hidden: true });
  const dirButton = el('button', {
    type: 'button',
    class: 'btn',
    id: 'sort-dir',
    role: 'menuitem',
    'aria-label': `כיוון מיון: ${sortDirectionText(store.state.sortDir)}`,
    on: { click: () => {
      store.state.sortDir = store.state.sortDir === 'asc' ? 'desc' : 'asc';
      paintSortDirection(dirButton, store.state.sortDir);
      save();
      renderResults();
    }},
  }, [icon('arrow-up-down', 'sm'), el('span', { text: sortDirectionText(store.state.sortDir) })]);
  const paint = () => {
    const label = button.querySelector('span');
    if (label) label.textContent = `מיון: ${sortLabel(store.state.sortKey)}`;
    menu.querySelectorAll('[data-sort]').forEach((item) => {
      item.setAttribute('aria-checked', item.dataset.sort === store.state.sortKey ? 'true' : 'false');
    });
    paintSortDirection(dirButton, store.state.sortDir);
  };
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  KEYS.forEach(([key, label]) => {
    menu.append(el('button', {
      type: 'button',
      role: 'menuitemradio',
      'data-sort': key,
      'aria-checked': key === store.state.sortKey ? 'true' : 'false',
      text: label,
      on: { click: () => {
        sort.value = key;
        sort.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
      }},
    }));
  });
  menu.append(dirButton);
  sort.addEventListener('change', () => {
    if ((sort.value === 'time' || sort.value === 'distance') && !store.state.home) {
      const subject = sort.value === 'time' ? 'זמן נסיעה' : 'מרחק';
      toast(`כדי למיין לפי ${subject} צריך כתובת בית`, {
        label: 'הגדרות',
        run: () => {
          const tab = document.querySelector('#nav [data-view="settings"]');
          if (tab) tab.click();
          const address = document.getElementById('home-address');
          if (address) address.focus();
        },
      });
      sort.value = store.state.sortKey;
      return;
    }
    store.state.sortKey = sort.value;
    if (store.state.sortKey === 'name' || store.state.sortKey === 'time' || store.state.sortKey === 'distance') store.state.sortDir = 'asc';
    else store.state.sortDir = 'desc';
    save();
    paint();
    renderResults();
  });
  button.addEventListener('click', () => setOpen(menu.hidden));
  return el('div', { class: 'sort-wrap' }, [sort, button, menu]);
};
