import { SCORE_MODES, STATUSES, UNKNOWN, el, labelOrUnknown, showLimit, statusClass } from './dom.js';
import { openJob, refreshDrawer } from './job-drawer.js';
import { scoreNode, travelSummary, visibleJobs } from './score.js';
import { defaultFilters, ensureJob, peekJob, save, store } from './store.js';

const sortDirectionText = (direction) => (direction === 'asc' ? 'עולה' : 'יורד');
const paintSortDirection = (button, direction) => {
  const label = sortDirectionText(direction);
  button.textContent = label;
  button.setAttribute('aria-label', `כיוון מיון: ${label}`);
};
export const updateCompareCount = () => {
  const badge = document.getElementById('compare-count');
  if (badge) badge.textContent = String(store.state.compareIds.length);
};
export const toggleCompare = (id, on) => {
  const has = store.state.compareIds.includes(id);
  if (on && !has) {
    if (store.state.compareIds.length >= 4) {
      showLimit('אפשר להשוות עד 4 משרות');
      return false;
    }
    store.state.compareIds.push(id);
  } else if (!on && has) {
    store.state.compareIds = store.state.compareIds.filter((item) => item !== id);
  }
  save();
  updateCompareCount();
  return true;
};
export const renderResults = () => {
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
    const favLabel = user.favorite ? '★ מועדף' : '☆ מועדף';
    const fav = el('button', {
      type: 'button',
      class: `btn fav${user.favorite ? ' is-on' : ''}`,
      'aria-pressed': user.favorite ? 'true' : 'false',
      'aria-label': `${favLabel}: ${job.role} – ${job.authority}`,
      text: favLabel,
      on: { click: () => {
        const record = ensureJob(job.id);
        record.favorite = !record.favorite;
        save();
        renderResults();
        if (store.openJobId === job.id) refreshDrawer();
      }},
    });
    const compare = el('input', {
      type: 'checkbox',
      'aria-label': `הוספה להשוואה: ${job.role} – ${job.authority}`,
    });
    compare.checked = store.state.compareIds.includes(job.id);
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
export const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
export const renderListShell = () => {
  const view = document.getElementById('view-list');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';
  view.replaceChildren();
  const filters = store.state.filters;
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
      clearTimeout(store.searchTimer);
      store.searchTimer = setTimeout(() => {
        store.state.filters.q = search.value.trim();
        save();
        renderResults();
      }, 300);
    }},
  });
  const favorite = el('input', { id: 'favorite-only', type: 'checkbox' });
  favorite.checked = Boolean(filters.favorite);
  favorite.addEventListener('change', () => {
    store.state.filters.favorite = favorite.checked;
    save();
    renderResults();
  });
  const sort = el('select', { id: 'sort-key' });
  [['score', 'ציון'], ['time', 'זמן נסיעה'], ['name', 'שם'], ['completeness', 'השלמה'], ['distance', 'מרחק']].forEach(([key, label]) => {
    const option = el('option', { value: key, text: label });
    if (key === store.state.sortKey) option.selected = true;
    sort.append(option);
  });
  sort.addEventListener('change', () => {
    store.state.sortKey = sort.value;
    if (store.state.sortKey === 'name' || store.state.sortKey === 'time' || store.state.sortKey === 'distance') store.state.sortDir = 'asc';
    else store.state.sortDir = 'desc';
    save();
    const dir = document.getElementById('sort-dir');
    if (dir) paintSortDirection(dir, store.state.sortDir);
    renderResults();
  });
  const dirButton = el('button', {
    type: 'button',
    class: 'btn',
    id: 'sort-dir',
    'aria-label': `כיוון מיון: ${sortDirectionText(store.state.sortDir)}`,
    text: sortDirectionText(store.state.sortDir),
    on: { click: () => {
      store.state.sortDir = store.state.sortDir === 'asc' ? 'desc' : 'asc';
      paintSortDirection(dirButton, store.state.sortDir);
      save();
      renderResults();
    }},
  });
  const mode = el('select', { id: 'score-mode' });
  SCORE_MODES.forEach(([key, label]) => {
    const option = el('option', { value: key, text: label });
    if (key === store.state.scoreMode) option.selected = true;
    mode.append(option);
  });
  mode.addEventListener('change', () => {
    store.state.scoreMode = mode.value;
    save();
    renderResults();
    if (store.openJobId) refreshDrawer();
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
    selectField('filter-district', 'מחוז', uniqueValues(store.jobs.map((job) => labelOrUnknown(job.district))), filters.district, (value) => { store.state.filters.district = value; }),
    selectField('filter-type', 'סוג רשות', uniqueValues(store.jobs.map((job) => labelOrUnknown(job.authorityType))), filters.authorityType, (value) => { store.state.filters.authorityType = value; }),
    selectField('filter-role', 'תפקיד', uniqueValues(store.jobs.map((job) => job.role)), filters.role, (value) => { store.state.filters.role = value; }),
    selectField('filter-domain', 'תחום', uniqueValues(store.jobs.flatMap((job) => job.categories || [])), filters.domain, (value) => { store.state.filters.domain = value; }),
    selectField('filter-authority', 'רשות', uniqueValues(store.jobs.map((job) => job.authority)), filters.authority, (value) => { store.state.filters.authority = value; }),
    selectField('filter-status', 'סטטוס', STATUSES, filters.status, (value) => { store.state.filters.status = value; }),
    numberField('filter-max-min', 'זמן נסיעה מקסימלי', filters.maxMinutes, (value) => { store.state.filters.maxMinutes = value; }),
    numberField('filter-max-km', 'מרחק מקסימלי', filters.maxKm, (value) => { store.state.filters.maxKm = value; }),
    numberField('filter-min-score', 'ציון מינימלי', filters.minScore, (value) => { store.state.filters.minScore = value; }),
    el('label', { class: 'check' }, [favorite, 'מועדפים בלבד']),
    el('button', {
      type: 'button',
      class: 'btn',
      id: 'clear-filters',
      text: 'נקה סינון',
      on: { click: () => {
        clearTimeout(store.searchTimer);
        store.state.filters = defaultFilters();
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
      el('p', { id: 'home-hint', class: 'hint', hidden: Boolean(store.state.home), text: 'כדי לראות מרחק, הגדירו כתובת בית בהגדרות.' }),
      el('p', { id: 'limit-alert', class: 'alert', role: 'alert', hidden: true }),
      el('div', { id: 'results', class: 'results' }),
    ]),
  ]);
  view.append(layout);
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = Boolean(store.state.home);
};
