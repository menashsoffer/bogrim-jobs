import { exportCsv, exportJson } from './backup.js';
import { CRIT_TYPES, el, toast } from './dom.js';
import { icon } from './icons.js';
import { renderResults } from './job-list.js';
import { clearData } from './shell.js';
import { defaultCriteria, save, store, uid } from './store.js';
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
const weightTotal = () => store.state.criteria.reduce((sum, criterion) => sum + (criterion.type === 'text' ? 0 : Number(criterion.weight) || 0), 0) || 1;
const shareOf = (criterion, total) => (criterion.type === 'text' ? null : Math.round((Number(criterion.weight) || 0) / total * 100));
const paintShares = (host) => {
  const total = weightTotal();
  const stack = host.querySelector('.stack');
  const legend = host.querySelector('.stack-legend');
  if (stack) stack.replaceChildren();
  if (legend) legend.replaceChildren();
  store.state.criteria.forEach((criterion, index) => {
    const share = shareOf(criterion, total);
    const row = host.querySelector(`.ce[data-id="${criterion.id}"] .ce-share`);
    if (row) row.textContent = share == null ? 'ללא ציון' : `${share}%`;
    const range = host.querySelector(`.ce[data-id="${criterion.id}"] .weight-range`);
    if (range) range.style.setProperty('--fill', `${criterion.weight}%`);
    if (share == null || !stack || !legend) return;
    const tone = STACK[index % STACK.length];
    const piece = document.createElement('i');
    piece.className = tone;
    piece.style.setProperty('--share', `${share}%`);
    stack.append(piece);
    legend.append(el('span', {}, [el('i', { class: tone, 'aria-hidden': 'true' }), `${criterion.name} ${share}%`]));
  });
};
export const renderCriteriaEditor = (host, focusLabel) => {
  host.replaceChildren();
  host.append(el('div', { class: 'stack', 'aria-hidden': 'true' }));
  host.append(el('div', { class: 'stack-legend' }));
  store.state.criteria.forEach((criterion, index) => {
    const name = el('input', { type: 'text', value: criterion.name, 'data-crit-name': criterion.id, 'aria-label': `שם הקריטריון ${criterion.name}` });
    name.className = 'ce-name';
    name.addEventListener('input', () => {
      const next = name.value.trim();
      if (!next) return;
      criterion.name = next;
      save();
    });
    name.addEventListener('change', () => {
      if (name.value.trim()) return;
      name.value = criterion.name;
      toast('שם הקריטריון לא יכול להיות ריק');
    });
    const type = el('select', { class: 'ce-type', 'aria-label': `סוג הקריטריון ${criterion.name}` });
    CRIT_TYPES.forEach(([key, label]) => {
      const option = el('option', { value: key, text: label });
      if (key === criterion.type) option.selected = true;
      type.append(option);
    });
    type.addEventListener('change', () => {
      if (type.value === 'travel' && store.state.criteria.some((item) => item !== criterion && item.type === 'travel')) {
        toast('אפשר קריטריון נסיעה אחד');
        type.value = criterion.type;
        return;
      }
      criterion.type = type.value;
      save();
      renderCriteriaEditor(host, type.getAttribute('aria-label'));
      renderResults();
    });
    const weight = el('input', {
      type: 'range',
      class: 'weight-range',
      min: '0',
      max: '100',
      step: '5',
      value: String(criterion.weight),
      'aria-label': `משקל ${criterion.name}`,
    });
    weight.style.setProperty('--fill', `${criterion.weight}%`);
    weight.addEventListener('input', () => {
      criterion.weight = Math.max(0, Math.min(100, Number(weight.value) || 0));
      paintShares(host);
    });
    weight.addEventListener('change', () => {
      save();
      toast('המשקלים עודכנו · הציונים חושבו מחדש');
      renderResults();
    });
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
      el('span', { class: 'ce-grip', 'aria-hidden': 'true' }, [icon('grip-vertical', 'sm')]),
      name,
      el('span', { class: 'ce-share', text: '0%' }),
      type,
      criterion.type === 'text' ? null : weight,
      el('div', { class: 'ce-actions' }, [
        iconButton('chevron-up', `הזזה למעלה ${criterion.name}`, index === 0, () => move(-1)),
        iconButton('chevron-down', `הזזה למטה ${criterion.name}`, index === store.state.criteria.length - 1, () => move(1)),
        iconButton('trash-2', `מחיקת קריטריון ${criterion.name}`, false, () => {
          if (!window.confirm(`למחוק את הקריטריון ${criterion.name}?`)) return;
          store.state.criteria.splice(index, 1);
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
  view.replaceChildren(
    el('section', { class: 'panel' }, [
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
    el('section', { class: 'panel' }, [
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
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title' }, [icon('scale'), 'קריטריונים']),
      el('p', { class: 'hint', text: 'קריטריון בלי דירוג לא נספר כאפס. הציון הוא ממוצע משוקלל של הקריטריונים שדורגו.' }),
      el('p', { class: 'hint', id: 'weight-hint', text: 'המשקלים יחסיים, האחוז הוא החלק בציון' }),
      editor,
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'btn',
          id: 'add-criterion',
          text: 'הוספת קריטריון',
          on: { click: () => {
            store.state.criteria.push({ id: uid(), name: 'קריטריון חדש', type: 'rating', weight: 10 });
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
        }, [icon('undo-2', 'sm'), 'איפוס לברירת מחדל']),
      ]),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title' }, [icon('download'), 'שמירה']),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', id: 'export-json', on: { click: () => exportJson() } }, [icon('download', 'sm'), 'ייצוא JSON']),
        el('button', { type: 'button', class: 'btn', id: 'import-json', on: { click: () => document.getElementById('import-file').click() } }, [icon('upload', 'sm'), 'ייבוא JSON']),
        el('button', { type: 'button', class: 'btn', id: 'export-csv', on: { click: () => exportCsv() } }, [icon('download', 'sm'), 'ייצוא CSV']),
        el('button', { type: 'button', class: 'btn danger', id: 'clear-data', text: 'נקה נתונים', on: { click: () => clearData() } }),
      ]),
      el('p', { class: 'hint', text: 'הקבצים נשמרים אצלכם. ייבוא מחליף את הנתונים בדפדפן רק אחרי אישור.' }),
    ]),
  );
  renderCriteriaEditor(editor);
  paintHomeStatus(false);
};
