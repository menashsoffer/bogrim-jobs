import { STATUSES, el, labelOrUnknown, showLimit, toast } from './dom.js';
import { distanceText, scoreText, timeText } from './filter-scale.js';
import { mountSteppedRange, refreshFilterScales } from './filter-controls.js';
import { mountHero } from './hero.js';
import { paintHomeChip } from './travel.js';
import { backIf, filtersFromHash, pushFilters } from './history.js';
import { icon } from './icons.js';
import { jobCard } from './job-card.js';
import { visibleJobs } from './score.js';
import { defaultFilters, save, store } from './store.js';

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
  if (!badge) return;
  const count = store.state.compareIds.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
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
const paintDomainChips = () => {
  const current = store.state.filters.domain || '';
  document.querySelectorAll('#domain-chips .chip').forEach((chip) => {
    const on = (chip.dataset.domain || '') === current;
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
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
  paintDomainChips();
  if (!list.length) {
    const minScore = store.state.filters.minScore;
    const hideUnrated = minScore !== '' && minScore != null && !store.state.filters.includeUnrated;
    const filters = store.state.filters;
    const otherFilter = Boolean(filters.q || filters.district || filters.authorityType || filters.role || filters.domain || filters.authority || filters.status || filters.maxMinutes || filters.maxKm || (minScore !== '' && minScore != null));
    const favoritesOnly = Boolean(filters.favorite) && !otherFilter;
    host.append(el('div', { class: 'empty-state' }, favoritesOnly ? [
      icon('heart'),
      el('p', { class: 'empty', text: 'אין מועדפים' }),
      el('p', { class: 'hint', text: 'סמנו לב במשרות שתרצו לחזור אליהן.' }),
      el('button', {
        type: 'button',
        class: 'btn',
        id: 'empty-clear-filters',
        text: 'לכל המשרות',
        on: { click: () => clearFilters() },
      }),
    ] : [
      el('img', { class: 'eclipse', src: 'img/eclipse.webp', alt: '', width: '200', height: '200', loading: 'lazy', decoding: 'async' }),
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
  const paintAll = () => list.forEach((job) => host.append(jobCard(job)));
  const testing = new URLSearchParams(location.search).get('test') === '1';
  if (testing) {
    paintAll();
    return;
  }
  const paintChunked = () => {
    let generation = (host.dataset.generation || '0');
    generation = String(Number(generation) + 1);
    host.dataset.generation = generation;
    const step = (start) => {
      if (host.dataset.generation !== generation) return;
      const end = Math.min(start + 8, list.length);
      for (let index = start; index < end; index += 1) host.append(jobCard(list[index]));
      if (end < list.length) requestAnimationFrame(() => step(end));
    };
    step(0);
  };
  if (!document.getElementById('welcome')) {
    paintChunked();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    paintChunked();
  });
  observer.observe(host);
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
    placeholder: 'חיפוש רשות או תפקיד',
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
  const sort = el('select', { id: 'sort-key', 'aria-label': 'מיון' });
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
    }, ['קרוב', 'ללא הגבלה']),
    mountSteppedRange('filter-max-km', 'מרחק מקסימלי', distanceText, (value) => {
      store.state.filters.maxKm = value;
      save();
      renderResults();
    }, ['קרוב', 'ללא הגבלה']),
    mountSteppedRange('filter-min-score', 'ציון מינימלי', scoreText, (value) => {
      store.state.filters.minScore = value;
      save();
      renderResults();
    }, ['הכול', '5']),
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
    el('div', { class: 'filters-foot' }, [
      el('button', {
        type: 'button',
        class: 'btn primary filters-done',
        id: 'filters-done',
        text: 'הצג משרות',
        on: { click: () => closeFilterSheet() },
      }),
      el('button', {
        type: 'button',
        class: 'btn',
        id: 'clear-filters',
        text: 'נקה סינון',
        on: { click: () => clearFilters() },
      }),
    ]),
  ]);
  const domains = uniqueValues(store.jobs.flatMap((job) => job.categories || []));
  const chipButton = (domain, label) => el('button', {
    type: 'button',
    class: 'chip',
    'data-domain': domain,
    text: label,
    on: { click: () => {
      store.state.filters.domain = domain;
      const select = document.getElementById('filter-domain');
      if (select) select.value = domain;
      save();
      renderResults();
    }},
  });
  const layout = el('div', { class: 'list-layout', id: 'jobs', tabindex: '-1' }, [
    filterBox,
    el('div', {}, [
      el('div', { class: 'list-head' }, [
        el('div', {}, [
          el('h2', { class: 'list-title', id: 'list-t', text: 'המשרות' }),
          el('p', { id: 'result-count', class: 'list-count', 'aria-live': 'polite', text: '' }),
        ]),
        el('div', { class: 'sort-pair ghost-btn' }, [sort, dirButton]),
      ]),
      el('div', { class: 'toolbar' }, [
        el('label', { class: 'search' }, [
          icon('search', 'sm'),
          el('span', { class: 'vh', text: 'חיפוש' }),
          search,
        ]),
        el('button', {
          type: 'button',
          class: 'ghost-btn filter-toggle',
          id: 'filter-toggle',
          on: { click: () => {
            filterBox.classList.add('is-open');
            pushFilters();
            const title = document.getElementById('filters-title');
            if (title) title.focus();
          }},
        }, [icon('sliders-horizontal', 'sm'), el('span', { text: 'סינון' })]),
      ]),
      el('div', { class: 'chips', id: 'domain-chips', role: 'group', 'aria-label': 'תחום' }, [
        chipButton('', 'הכל'),
        ...domains.map((domain) => chipButton(domain, domain)),
      ]),
      el('button', {
        type: 'button',
        id: 'home-hint',
        class: 'btn-link',
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
  mountHero().forEach((node) => view.append(node));
  view.append(layout);
  paintHomeChip();
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = Boolean(store.state.home);
};
