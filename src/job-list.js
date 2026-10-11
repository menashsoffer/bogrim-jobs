import { STATUSES, UNKNOWN, el, labelOrUnknown, showLimit, statusClass, toast } from './dom.js';
import { distanceText, scoreText, timeText } from './filter-scale.js';
import { mountSteppedRange, refreshFilterScales } from './filter-controls.js';
import { backIf, filtersFromHash, pushFilters } from './history.js';
import { DOMAIN_ICON, STATUS_ICON, TYPE_ICON, icon } from './icons.js';
import { openJob, refreshDrawer } from './job-drawer.js';
import { scoreNode, travelSummary, visibleJobs } from './score.js';
import { defaultFilters, ensureJob, peekJob, save, store } from './store.js';

const sortDirectionText = (direction) => (direction === 'asc' ? 'עולה' : 'יורד');
const paintSortDirection = (button, direction) => {
  const label = sortDirectionText(direction);
  const text = button.querySelector('span');
  if (text) text.textContent = label;
  else button.textContent = label;
  button.setAttribute('aria-label', `כיוון מיון: ${label}`);
};
export const noteListDirty = () => {
  store.listDirty = true;
};
export const jobPlace = (id) => [...document.querySelectorAll('button.card-open')].findIndex((button) => button.dataset.job === id);
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
const activeFilterCount = () => {
  const current = store.state.filters;
  const defaults = defaultFilters();
  return Object.keys(defaults).filter((key) => {
    if (key === 'includeUnrated' && (current.minScore === '' || current.minScore == null)) return false;
    return String(current[key] ?? '') !== String(defaults[key] ?? '');
  }).length;
};
const paintFilterToggle = () => {
  const toggle = document.getElementById('filter-toggle');
  const label = toggle && toggle.querySelector('span');
  if (!label) return;
  const count = activeFilterCount();
  label.textContent = count ? `סינון (${count})` : 'סינון';
};
export const clearFilters = () => {
  clearTimeout(store.searchTimer);
  store.state.filters = defaultFilters();
  save();
  const view = document.getElementById('view-list');
  if (view) view.dataset.ready = '';
  renderListShell();
  renderResults();
};
export const renderResults = () => {
  const host = document.getElementById('results');
  const count = document.getElementById('result-count');
  if (!host) return;
  refreshFilterScales();
  const list = visibleJobs();
  if (count) count.textContent = `מוצגות ${list.length} משרות`;
  paintFilterToggle();
  const done = document.getElementById('filters-done');
  if (done) done.textContent = `הצג ${list.length} משרות`;
  host.replaceChildren();
  if (!list.length) {
    const minScore = store.state.filters.minScore;
    const hideUnrated = minScore !== '' && minScore != null && !store.state.filters.includeUnrated;
    host.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'art-slot', 'data-art': 'empty-results', 'aria-hidden': 'true' }),
      el('p', { class: 'empty', text: 'אין משרות שמתאימות לסינון' }),
      hideUnrated ? el('p', { class: 'hint', text: 'משרות ללא ציון מוסתרות' }) : null,
      el('button', {
        type: 'button',
        class: 'btn',
        id: 'empty-clear-filters',
        text: 'נקה סינון',
        on: { click: () => clearFilters() },
      }),
    ]));
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
      el('span', { class: 'card-meta' }, [
        icon(TYPE_ICON[job.authorityType] || 'map-pin', 'sm'),
        `${job.authority} · ${labelOrUnknown(job.district)} · ${labelOrUnknown(job.authorityType)}`,
      ]),
    ]);
    const favLabel = user.favorite ? '★ מועדף' : '☆ מועדף';
    const jobName = `${job.title || job.role} – ${job.authority}`;
    const fav = el('button', {
      type: 'button',
      class: `btn fav${user.favorite ? ' is-on' : ''}`,
      'aria-pressed': user.favorite ? 'true' : 'false',
      'aria-label': `${favLabel}: ${jobName}`,
      on: { click: () => {
        const record = ensureJob(job.id);
        record.favorite = !record.favorite;
        save();
        renderResults();
        if (store.openJobId === job.id) refreshDrawer();
      }},
    }, [icon(user.favorite ? 'heart-fill' : 'heart'), 'מועדף']);
    const compare = el('input', {
      type: 'checkbox',
      'aria-label': `הוספה להשוואה: ${jobName}`,
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
        el('span', { class: 'chip role' }, [icon('briefcase', 'sm'), job.role || UNKNOWN]),
        ...(job.categories || []).map((category) => el('span', { class: 'chip' }, [
          icon(DOMAIN_ICON[category] || 'briefcase', 'sm'),
          category,
        ])),
      ]),
      travel ? el('p', { class: 'travel-line' }, [icon('car', 'sm'), travel]) : null,
      el('div', { class: 'card-actions' }, [
        fav,
        el('span', { class: statusClass(user.status) }, [icon(STATUS_ICON[user.status] || 'circle-dashed', 'sm'), user.status]),
        el('label', { class: 'check' }, [compare, icon('columns-3', 'sm'), 'השוואה']),
      ]),
    ]);
    host.append(card);
  });
};
export const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
export const closeFilterSheet = () => {
  const filterBox = document.getElementById('filters');
  if (!filterBox || !filterBox.classList.contains('is-open')) return;
  filterBox.classList.remove('is-open');
  if (!backIf('filters') && filtersFromHash()) {
    history.replaceState({ bogrim: 'list' }, '', `${location.pathname}${location.search}`);
  }
  const toggle = document.getElementById('filter-toggle');
  if (toggle) toggle.focus();
};
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
    const dir = document.getElementById('sort-dir');
    if (dir) paintSortDirection(dir, store.state.sortDir);
    renderResults();
  });
  const dirButton = el('button', {
    type: 'button',
    class: 'btn',
    id: 'sort-dir',
    'aria-label': `כיוון מיון: ${sortDirectionText(store.state.sortDir)}`,
    on: { click: () => {
      store.state.sortDir = store.state.sortDir === 'asc' ? 'desc' : 'asc';
      paintSortDirection(dirButton, store.state.sortDir);
      save();
      renderResults();
    }},
  }, [icon('arrow-up-down', 'sm'), el('span', { text: sortDirectionText(store.state.sortDir) })]);
  const filterBox = el('div', { class: 'filters', id: 'filters' }, [
    el('div', { class: 'row' }, [
      el('h2', { id: 'filters-title', tabindex: '-1', text: 'סינון' }),
      el('button', {
        type: 'button',
        class: 'btn close-filters',
        id: 'close-filters',
        on: { click: () => closeFilterSheet() },
      }, [icon('x', 'sm'), 'סגירה']),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [icon('search', 'sm'), 'חיפוש']), search]),
    selectField('filter-district', 'מחוז', uniqueValues(store.jobs.map((job) => labelOrUnknown(job.district))), filters.district, (value) => { store.state.filters.district = value; }),
    selectField('filter-type', 'סוג רשות', uniqueValues(store.jobs.map((job) => labelOrUnknown(job.authorityType))), filters.authorityType, (value) => { store.state.filters.authorityType = value; }),
    selectField('filter-role', 'תפקיד', uniqueValues(store.jobs.map((job) => job.role)), filters.role, (value) => { store.state.filters.role = value; }),
    selectField('filter-domain', 'תחום', uniqueValues(store.jobs.flatMap((job) => job.categories || [])), filters.domain, (value) => { store.state.filters.domain = value; }),
    selectField('filter-authority', 'רשות', uniqueValues(store.jobs.map((job) => job.authority)), filters.authority, (value) => { store.state.filters.authority = value; }),
    selectField('filter-status', 'סטטוס', STATUSES, filters.status, (value) => { store.state.filters.status = value; }),
    mountSteppedRange('filter-max-min', 'זמן נסיעה מקסימלי ברכב', timeText, (value) => {
      store.state.filters.maxMinutes = value;
      save();
      renderResults();
    }),
    mountSteppedRange('filter-max-km', 'מרחק מקסימלי', distanceText, (value) => {
      store.state.filters.maxKm = value;
      save();
      renderResults();
    }),
    mountSteppedRange('filter-min-score', 'ציון מינימלי', scoreText, (value) => {
      store.state.filters.minScore = value;
      save();
      renderResults();
    }),
    el('label', { class: 'check' }, [
      el('input', {
        id: 'include-unrated',
        type: 'checkbox',
        on: { change: (event) => {
          store.state.filters.includeUnrated = event.target.checked;
          save();
          renderResults();
        }},
      }),
      'הצג גם משרות ללא ציון',
    ]),
    el('p', { class: 'hint', id: 'unrated-hint', hidden: true, text: 'בלי הסימון, משרות ללא ציון מוסתרות.' }),
    el('label', { class: 'check' }, [favorite, 'מועדפים בלבד']),
    el('button', {
      type: 'button',
      class: 'btn',
      id: 'clear-filters',
      text: 'נקה סינון',
      on: { click: () => clearFilters() },
    }),
    el('button', {
      type: 'button',
      class: 'btn primary filters-done',
      id: 'filters-done',
      text: 'הצג משרות',
      on: { click: () => closeFilterSheet() },
    }),
  ]);
  const welcome = store.state.welcomeSeen ? null : el('section', { class: 'panel welcome', id: 'welcome' }, [
    el('div', { class: 'art-slot', 'data-art': 'welcome', 'aria-hidden': 'true' }),
    el('h2', { text: 'בוחר המשרות' }),
    el('p', { text: 'כלי אישי להשוואה ולדירוג של משרות הצוערים. הדירוגים נשמרים רק בדפדפן.' }),
    el('ol', {}, [
      el('li', { text: 'הגדירו כתובת בית כדי לראות זמן נסיעה.' }),
      el('li', { text: 'דרגו את הקריטריונים שחשובים לכם.' }),
      el('li', { text: 'השוו עד 4 משרות זו לצד זו.' }),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        type: 'button',
        class: 'btn primary',
        id: 'welcome-start',
        text: 'להגדרת כתובת הבית',
        on: { click: () => {
          store.state.welcomeSeen = true;
          save();
          const node = document.getElementById('welcome');
          if (node) node.remove();
          const tab = document.querySelector('#nav [data-view="settings"]');
          if (tab) tab.click();
        }},
      }),
      el('button', {
        type: 'button',
        class: 'btn',
        id: 'welcome-dismiss',
        text: 'אחר כך',
        on: { click: () => {
          store.state.welcomeSeen = true;
          save();
          const node = document.getElementById('welcome');
          if (node) node.remove();
        }},
      }),
    ]),
  ]);
  const layout = el('div', { class: 'list-layout' }, [
    filterBox,
    el('div', {}, [
      el('div', { class: 'toolbar' }, [
        el('button', {
          type: 'button',
          class: 'btn filter-toggle',
          id: 'filter-toggle',
          on: { click: () => {
            filterBox.classList.add('is-open');
            pushFilters();
            const title = document.getElementById('filters-title');
            if (title) title.focus();
          }},
        }, [icon('sliders-horizontal', 'sm'), el('span', { text: 'סינון' })]),
        el('p', { id: 'result-count', class: 'grow', 'aria-live': 'polite', text: '' }),
        el('label', { class: 'field', style: null }, [el('span', { class: 'field-label', text: 'מיון' }), sort]),
        dirButton,
      ]),
      el('button', {
        type: 'button',
        id: 'home-hint',
        class: 'btn',
        hidden: Boolean(store.state.home),
        text: 'הגדרת כתובת בית',
        on: { click: () => {
          const tab = document.querySelector('#nav [data-view="settings"]');
          if (tab) tab.click();
          const address = document.getElementById('home-address');
          if (address) address.focus();
        }},
      }),
      el('p', { id: 'limit-alert', class: 'alert', role: 'alert', hidden: true }),
      el('div', { id: 'results', class: 'results' }),
    ]),
  ]);
  if (welcome) view.append(welcome);
  view.append(layout);
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = Boolean(store.state.home);
};
