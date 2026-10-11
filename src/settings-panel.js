import { exportCsv, exportJson } from './backup.js';
import { CRIT_TYPES, el, toast } from './dom.js';
import { icon } from './icons.js';
import { renderResults } from './job-list.js';
import { clearData } from './shell.js';
import { defaultCriteria, save, store, uid } from './store.js';
import { computeRoutes, onGeocode, onGps } from './travel.js';

export const renderCriteriaEditor = (host) => {
  host.replaceChildren();
  const weightSum = store.state.criteria.reduce((sum, criterion) => sum + (criterion.type === 'text' ? 0 : Number(criterion.weight) || 0), 0) || 1;
  store.state.criteria.forEach((criterion, index) => {
    const name = el('input', { type: 'text', value: criterion.name, 'data-crit-name': criterion.id, 'aria-label': `שם הקריטריון ${criterion.name}` });
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
    const type = el('select', { 'aria-label': `סוג הקריטריון ${criterion.name}` });
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
      renderCriteriaEditor(host);
      renderResults();
    });
    const weight = el('input', { type: 'number', min: '0', max: '100', value: String(criterion.weight), 'aria-label': `משקל ${criterion.name}` });
    const percent = el('span', { class: 'muted', text: criterion.type === 'text' ? 'ללא ציון' : `${Math.round((Number(criterion.weight) || 0) / weightSum * 100)}%` });
    weight.addEventListener('change', () => {
      criterion.weight = Math.max(0, Math.min(100, Number(weight.value) || 0));
      save();
      renderCriteriaEditor(host);
      renderResults();
    });
    const move = (direction) => {
      const target = index + direction;
      if (target < 0 || target >= store.state.criteria.length) return;
      const [item] = store.state.criteria.splice(index, 1);
      store.state.criteria.splice(target, 0, item);
      save();
      renderCriteriaEditor(host);
    };
    host.append(el('div', { class: 'criterion-editor' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'שם' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'סוג' }), type]),
      criterion.type === 'text' ? null : el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'משקל' }), weight, percent]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn', text: 'הזזה למעלה', disabled: index === 0, 'aria-label': `הזזה למעלה ${criterion.name}`, on: { click: () => move(-1) } }),
        el('button', { type: 'button', class: 'btn', text: 'הזזה למטה', disabled: index === store.state.criteria.length - 1, 'aria-label': `הזזה למטה ${criterion.name}`, on: { click: () => move(1) } }),
        el('button', {
          type: 'button',
          class: 'btn danger',
          text: 'מחיקה',
          'aria-label': `מחיקת קריטריון ${criterion.name}`,
          on: { click: () => {
            if (!window.confirm(`למחוק את הקריטריון ${criterion.name}?`)) return;
            store.state.criteria.splice(index, 1);
            save();
            renderCriteriaEditor(host);
            renderResults();
          }},
        }),
      ]),
    ]));
  });
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
      el('p', { id: 'home-status', text: store.state.home ? `הבית הוגדר: ${store.state.home.label}` : 'עוד לא הוגדרה כתובת.' }),
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
};
