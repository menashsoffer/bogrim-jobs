import { exportCsv, exportJson } from './backup.js';
import { CRIT_TYPES, el, toast } from './dom.js';
import { icon } from './icons.js';
import { renderResults } from './job-list.js';
import { clearData, showView } from './shell.js';
import { defaultCriteria, save, store, uid } from './store.js';
import { redistribute, sliderBounds } from './weights.js';
import { computeRoutes, onGeocode, onGps, paintHomeStatus } from './travel.js';

const restoreCriteriaFocus = (host, label) => {
  if (!label) return;
  const nodes = [...host.querySelectorAll('[aria-label]')];
  const next = nodes.find((node) => node.getAttribute('aria-label') === label && !node.disabled);
  if (next) {
    next.focus();
    return;
  }
  const name = label.replace(/^הזזה ל(?:מעלה|מטה)\s+/, '');
  const other = label.includes('למעלה') ? `הזזה למטה ${name}` : `הזזה למעלה ${name}`;
  const fallback = nodes.find((node) => node.getAttribute('aria-label') === other && !node.disabled);
  if (fallback) fallback.focus();
};
const STACK = ['stack-a', 'stack-b', 'stack-c', 'stack-d', 'stack-e'];
const weightTotal = () => store.state.criteria.reduce((sum, criterion) => sum + (criterion.type === 'text' ? 0 : Number(criterion.weight) || 0), 0);
const paintShares = (host, announcement) => {
  const total = weightTotal();
  const stack = host.querySelector('.stack');
  const legend = host.querySelector('.stack-legend');
  if (stack) stack.replaceChildren();
  if (legend) legend.replaceChildren();
  store.state.criteria.forEach((criterion, index) => {
    const share = criterion.type === 'text' ? null : Number(criterion.weight) || 0;
    const row = host.querySelector(`.ce[data-id="${criterion.id}"]`);
    const shareNode = row && row.querySelector('.ce-share');
    if (shareNode) shareNode.textContent = share == null ? 'ללא ציון' : `${share}%`;
    const range = row && row.querySelector('.weight-range');
    if (range) {
      const bounds = sliderBounds(store.state.criteria, criterion.id);
      range.value = String(criterion.weight);
      range.disabled = bounds.disabled;
      range.setAttribute('aria-valuemin', String(bounds.min));
      range.setAttribute('aria-valuemax', String(bounds.max));
      range.setAttribute('aria-valuenow', String(criterion.weight));
      range.setAttribute('aria-valuetext', `${criterion.weight}%`);
      range.style.setProperty('--fill', `${criterion.weight}%`);
    }
    const lock = row && row.querySelector('.ce-lock');
    if (lock) {
      lock.setAttribute('aria-pressed', criterion.locked ? 'true' : 'false');
      lock.classList.toggle('is-on', criterion.locked === true);
    }
    if (share == null || !stack || !legend) return;
    const tone = STACK[index % STACK.length];
    const piece = document.createElement('i');
    piece.className = tone;
    piece.style.setProperty('--share', `${share}%`);
    stack.append(piece);
    legend.append(el('span', {}, [el('i', { class: tone, 'aria-hidden': 'true' }), `${criterion.name} ${share}%`]));
  });
  const shown = document.getElementById('weight-sum-value');
  const live = document.getElementById('weight-sum-live');
  if (shown) shown.textContent = `${total}%`;
  if (live) live.textContent = announcement || `הסכום ${total}%`;
};
export const renderCriteriaEditor = (host, focusLabel) => {
  host.replaceChildren();
  host.append(el('div', { class: 'stack', 'aria-hidden': 'true' }));
  host.append(el('div', { class: 'stack-legend' }));
  store.state.criteria.forEach((criterion, index) => {
    const name = el('input', { type: 'text', value: criterion.name, 'data-crit-name': criterion.id, 'aria-label': `שם הקריטריון ${criterion.name}` });
    name.className = 'ce-name';
    name.addEventListener('input', () => {
      const item = store.state.criteria.find((entry) => entry.id === criterion.id);
      const next = name.value.trim();
      if (!next || !item) return;
      item.name = next;
      save();
    });
    name.addEventListener('change', () => {
      const item = store.state.criteria.find((entry) => entry.id === criterion.id);
      if (name.value.trim() || !item) return;
      name.value = item.name;
      toast('שם הקריטריון לא יכול להיות ריק');
    });
    const type = el('select', { class: 'ce-type', 'aria-label': `סוג הקריטריון ${criterion.name}` });
    CRIT_TYPES.forEach(([key, label]) => {
      const option = el('option', { value: key, text: label });
      if (key === criterion.type) option.selected = true;
      type.append(option);
    });
    type.addEventListener('change', () => {
      const item = store.state.criteria.find((entry) => entry.id === criterion.id);
      if (!item) return;
      if (type.value === 'travel' && store.state.criteria.some((entry) => entry.id !== item.id && entry.type === 'travel')) {
        toast('אפשר קריטריון נסיעה אחד');
        type.value = item.type;
        return;
      }
      if (type.value === 'text') {
        store.state.criteria = redistribute(store.state.criteria, item.id, 0, { force: true }).map((entry) => (
          entry.id === item.id ? { ...entry, type: 'text', weight: 0, locked: false } : entry
        ));
      } else {
        item.type = type.value;
      }
      save();
      renderCriteriaEditor(host, type.getAttribute('aria-label'));
      renderResults();
    });
    const bounds = sliderBounds(store.state.criteria, criterion.id);
    const weightId = `weight-${criterion.id}`;
    const weight = el('input', {
      type: 'range',
      class: 'weight-range',
      id: weightId,
      min: '0',
      max: '100',
      step: '1',
      value: String(criterion.weight),
      disabled: bounds.disabled,
      'aria-label': `משקל ${criterion.name}`,
      'aria-valuemin': String(bounds.min),
      'aria-valuemax': String(bounds.max),
      'aria-valuenow': String(criterion.weight),
      'aria-valuetext': `${criterion.weight}%`,
    });
    weight.style.setProperty('--fill', `${criterion.weight}%`);
    weight.addEventListener('input', () => {
      const item = store.state.criteria.find((entry) => entry.id === criterion.id);
      store.state.criteria = redistribute(store.state.criteria, criterion.id, Number(weight.value));
      const updated = store.state.criteria.find((entry) => entry.id === criterion.id);
      paintShares(host, `${item ? item.name : criterion.name} ${updated.weight}%, הסכום ${weightTotal()}%`);
    });
    weight.addEventListener('change', () => {
      save();
      toast('המשקלים עודכנו · הציונים חושבו מחדש');
      renderResults();
    });
    const lock = el('button', {
      type: 'button',
      class: `icon-btn ce-act ce-lock${criterion.locked ? ' is-on' : ''}`,
      'aria-pressed': criterion.locked ? 'true' : 'false',
      'aria-label': `נעילת משקל ${criterion.name}`,
      on: { click: () => {
        const item = store.state.criteria.find((entry) => entry.id === criterion.id);
        if (!item) return;
        item.locked = item.locked !== true;
        save();
        renderCriteriaEditor(host, `נעילת משקל ${item.name}`);
      } },
    }, [icon(criterion.locked ? 'lock' : 'lock-open', 'sm')]);
    const move = (direction) => {
      const target = index + direction;
      if (target < 0 || target >= store.state.criteria.length) return;
      const [item] = store.state.criteria.splice(index, 1);
      store.state.criteria.splice(target, 0, item);
      save();
      const active = document.activeElement;
      renderCriteriaEditor(host, active ? active.getAttribute('aria-label') : '');
    };
    const iconButton = (glyph, label, disabled, run) => el('button', {
      type: 'button',
      class: 'icon-btn ce-act',
      disabled,
      'aria-label': label,
      on: { click: run },
    }, [icon(glyph, 'sm')]);
    host.append(el('div', { class: 'ce', 'data-id': criterion.id }, [
      el('div', { class: 'ce-top' }, [
        el('span', { class: 'ce-grip', 'aria-hidden': 'true' }, [icon('grip-vertical', 'sm')]),
        name,
        el('span', { class: 'ce-share', text: '0%' }),
        criterion.type === 'text' ? null : lock,
      ]),
      type,
      criterion.type === 'text' ? null : el('label', { class: 'ce-weight-label', for: weightId, text: `משקל ${criterion.name}` }),
      criterion.type === 'text' ? null : weight,
      el('div', { class: 'ce-actions' }, [
        iconButton('chevron-up', `הזזה למעלה ${criterion.name}`, index === 0, () => move(-1)),
        iconButton('chevron-down', `הזזה למטה ${criterion.name}`, index === store.state.criteria.length - 1, () => move(1)),
        iconButton('trash-2', `מחיקת קריטריון ${criterion.name}`, false, () => {
          if (!window.confirm(`למחוק את הקריטריון ${criterion.name}?`)) return;
          store.state.criteria = redistribute(store.state.criteria, criterion.id, 0, { force: true })
            .filter((entry) => entry.id !== criterion.id);
          save();
          renderCriteriaEditor(host);
          renderResults();
        }),
      ]),
    ]));
  });
  paintShares(host);
  restoreCriteriaFocus(host, focusLabel);
};
export const renderSettings = () => {
  const view = document.getElementById('view-settings');
  const homeInput = el('input', { id: 'home-address', type: 'text', autocomplete: 'street-address', value: store.state.home ? store.state.home.label : '' });
  const keyInput = el('input', { id: 'routing-key', type: 'password', autocomplete: 'off', value: store.state.routingKey });
  keyInput.addEventListener('change', () => {
    store.state.routingKey = keyInput.value.trim();
    save();
  });
  const editor = el('div', { id: 'criteria-editor' });
  view.replaceChildren(el('div', { class: 'settings-grid' }, [
    el('section', { class: 'panel settings-home' }, [
      el('h2', { class: 'panel-title' }, [icon('house'), 'כתובת הבית']),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'כתובת הבית' }), homeInput]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'geocode-home', text: 'אתר כתובת', on: { click: () => { onGeocode(); } } }),
        el('button', { type: 'button', class: 'btn', id: 'use-my-location', text: 'המיקום שלי', on: { click: () => onGps() } }),
      ]),
      el('p', {
        id: 'home-status',
        role: 'status',
        tabindex: '-1',
        text: store.state.home ? '' : 'עוד לא הוגדרה כתובת.',
      }),
      el('div', { id: 'home-results', class: 'row' }),
      el('p', { class: 'hint', text: 'אם היישוב לא ברשימה המקומית, הכתובת נשלחת ל-Nominatim (OpenStreetMap) רק אחרי הלחיצה.' }),
    ]),
    el('section', { class: 'panel settings-criteria' }, [
      el('h2', { class: 'panel-title' }, [icon('scale'), 'קריטריונים']),
      el('p', { class: 'hint', text: 'קריטריון בלי דירוג לא נספר כאפס. הציון הוא ממוצע משוקלל של הקריטריונים שדורגו.' }),
      el('p', { class: 'hint', id: 'weight-hint', text: 'כל שינוי מתחלק בין הקריטריונים שלא נעולים, והסכום נשאר 100%.' }),
      el('p', { class: 'weight-sum', id: 'weight-sum' }, [
        el('span', { id: 'weight-sum-value', text: '100%' }),
        el('span', { id: 'weight-sum-live', class: 'vh', 'aria-live': 'polite', 'aria-atomic': 'true', text: 'הסכום 100%' }),
      ]),
      editor,
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'btn',
          id: 'add-criterion',
          text: 'הוספת קריטריון',
          on: { click: () => {
            store.state.criteria.push({ id: uid(), name: 'קריטריון חדש', type: 'rating', weight: 0, locked: false });
            save();
            renderCriteriaEditor(editor);
          }},
        }),
        el('button', {
          type: 'button',
          class: 'btn',
          id: 'reset-criteria',
          on: { click: () => {
            if (!window.confirm('לאפס את הקריטריונים לברירת המחדל?')) return;
            store.state.criteria = defaultCriteria();
            save();
            renderCriteriaEditor(editor);
            renderResults();
          }},
        }, [icon('undo-2', 'sm'), 'איפוס']),
      ]),
    ]),
    el('section', { class: 'panel settings-travel' }, [
      el('h2', { class: 'panel-title' }, [icon('car'), 'נסיעה']),
      el('p', { class: 'notice', id: 'route-notice', text: 'החישוב מחשב זמן נסיעה ברכב ושולח את קואורדינטות הבית ומיקומי הרשויות לשירות חיצוני.' }),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'compute-routes', text: 'חשב זמני נסיעה', on: { click: () => { computeRoutes(); } } }),
      ]),
      el('p', { id: 'route-status', text: 'בלי חישוב מוצג קו אווירי (הערכה).' }),
      el('label', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'מפתח openrouteservice (לא חובה)' }),
        keyInput,
      ]),
      el('p', { class: 'hint', text: 'המפתח נשמר רק במכשיר. בלי מפתח משתמשים ב-OSRM הציבורי.' }),
    ]),
    el('section', { class: 'panel settings-data' }, [
      el('h2', { class: 'panel-title' }, [icon('download'), 'שמירה']),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'export-json', on: { click: () => exportJson() } }, [icon('download', 'sm'), 'ייצוא JSON']),
        el('button', { type: 'button', class: 'btn', id: 'import-json', on: { click: () => document.getElementById('import-file').click() } }, [icon('upload', 'sm'), 'ייבוא JSON']),
        el('button', { type: 'button', class: 'btn', id: 'export-csv', on: { click: () => exportCsv() } }, [icon('download', 'sm'), 'ייצוא CSV']),
        el('button', { type: 'button', class: 'btn danger', id: 'clear-data', text: 'נקה נתונים', on: { click: () => clearData() } }),
      ]),
      el('p', { class: 'hint', text: 'הקבצים נשמרים אצלכם. ייבוא מחליף את הנתונים בדפדפן רק אחרי אישור.' }),
    ]),
    el('nav', { class: 'settings-links', 'aria-label': 'עוד' }, [
      el('button', { type: 'button', class: 'text-btn', 'data-view': 'privacy', text: 'פרטיות', on: { click: () => showView('privacy') } }),
      el('button', { type: 'button', class: 'text-btn', 'data-view': 'help', text: 'עזרה', on: { click: () => showView('help') } }),
    ]),
  ]));
  renderCriteriaEditor(editor);
  paintHomeStatus(false);
};
