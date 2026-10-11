import { AIR_LABEL, UNKNOWN, el, externalLink, formatKm, labelOrUnknown, safeMail, safeTel } from './dom.js';
import { refreshDrawer } from './job-drawer.js';
import { renderResults } from './job-list.js';
import { airKm, routeFor } from './score.js';
import { ensureJob, peekJob, save, store } from './store.js';

export const travelSection = (job) => {
  const section = el('section', { class: 'block' }, [el('h3', { text: 'נסיעה' })]);
  if (!store.state.home) {
    section.append(el('p', { text: 'הגדירו כתובת בית בהגדרות כדי לראות מרחק ומסלול.' }));
    return section;
  }
  if (job.lat == null || job.lon == null) {
    section.append(el('p', { text: UNKNOWN }));
    return section;
  }
  const km = airKm(job);
  const modes = el('div', { class: 'modes' });
  [['car', 'רכב'], ['bike', 'אופניים'], ['walk', 'הליכה'], ['transit', 'תחבורה ציבורית']].forEach(([mode, label]) => {
    let detail = `${AIR_LABEL}: ${formatKm(km)}`;
    if (mode === 'transit') {
      const minutes = peekJob(job.id).transitMinutes;
      if (typeof minutes === 'number') detail = `${minutes} דק׳`;
    } else {
      const hit = routeFor(job, mode);
      if (hit) detail = `${hit.min} דק׳ · ${hit.km == null ? formatKm(km) : formatKm(hit.km)}`;
    }
    modes.append(el('button', {
      type: 'button',
      class: `mode${store.state.scoreMode === mode ? ' is-selected' : ''}`,
      'aria-pressed': store.state.scoreMode === mode ? 'true' : 'false',
      on: { click: () => {
        store.state.scoreMode = mode;
        save();
        const select = document.getElementById('score-mode');
        if (select) select.value = mode;
        refreshDrawer();
        renderResults();
      }},
    }, [el('strong', { text: label }), el('span', { text: detail })]));
  });
  section.append(modes);
  const origin = `${store.state.home.lat},${store.state.home.lon}`;
  const destination = `${job.lat},${job.lon}`;
  const google = (mode) => `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
  const fromLabel = (store.state.home.label || 'הבית').replace(/\s+/g, ' ').trim();
  const moovit = `https://moovit.com/?from=${encodeURIComponent(fromLabel)}&fll=${store.state.home.lat}_${store.state.home.lon}&to=${encodeURIComponent(job.authority)}&tll=${job.lat}_${job.lon}&lang=he`;
  const waze = `https://www.waze.com/ul?ll=${destination}&navigate=yes&from=${origin}`;
  section.append(el('div', { class: 'row' }, [
    externalLink(google('transit'), 'Google Maps'),
    externalLink(moovit, 'Moovit'),
    externalLink(waze, 'Waze'),
  ]));
  const savedMinutes = peekJob(job.id).transitMinutes;
  const transit = el('input', {
    id: 'transit-minutes',
    type: 'text',
    inputmode: 'numeric',
    value: savedMinutes == null ? '' : String(savedMinutes),
  });
  const error = el('p', { id: 'transit-error', class: 'alert', role: 'alert', hidden: true });
  transit.addEventListener('change', () => {
    const raw = transit.value.trim();
    const record = ensureJob(job.id);
    if (raw !== '') {
      const minutes = Number(raw);
      if (!Number.isFinite(minutes) || minutes < 0) {
        transit.value = record.transitMinutes == null ? '' : String(record.transitMinutes);
        error.hidden = false;
        error.textContent = 'הזינו מספר דקות שאינו שלילי';
        return;
      }
      record.transitMinutes = minutes;
    } else record.transitMinutes = null;
    error.hidden = true;
    save();
    refreshDrawer('transit-minutes');
    renderResults();
  });
  section.append(el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'זמן תחבורה ציבורית שמצאתי (דקות)' }),
    transit,
    error,
  ]));
  section.append(el('p', { class: 'hint', text: 'בלי מסלול מחושב מוצג קו אווירי (הערכה). חישוב המסלול נעשה רק בהגדרות, אחרי אישור.' }));
  return section;
};
export const factsSection = (job) => el('section', { class: 'block' }, [
  el('h3', { text: 'פרטי המשרה' }),
  el('dl', { class: 'facts' }, [
    el('dt', { text: 'תפקיד' }), el('dd', { text: job.role || UNKNOWN }),
    el('dt', { text: 'תחום' }), el('dd', { text: (job.categories || []).join(', ') || UNKNOWN }),
    el('dt', { text: 'אוכלוסייה' }), el('dd', { text: labelOrUnknown(job.population) }),
    el('dt', { text: 'אשכול חברתי-כלכלי' }), el('dd', { text: labelOrUnknown(job.socioEconomic) }),
    el('dt', { text: 'מדד פריפריאליות' }), el('dd', { text: labelOrUnknown(job.peripherality) }),
    el('dt', { text: 'תפקיד המנהל/ת' }), el('dd', { text: labelOrUnknown(job.managerTitle) }),
    job.locationPrecision && job.locationPrecision !== 'exact'
      ? [el('dt', { text: 'מיקום במפה' }), el('dd', { text: job.locationNote || 'מיקום מקורב' })]
      : null,
  ]),
]);
export const contactsSection = (job) => {
  const people = [
    ['מנהל/ת', job.managerName, job.managerTitle, job.managerEmail, job.managerPhone],
    ['איש קשר', job.contactName, '', job.contactEmail, job.contactPhone],
    ['מערך ליווי', job.liaisonName, '', job.liaisonEmail, job.liaisonPhone],
  ].filter((person) => person.slice(1).some(Boolean));
  if (!people.length) return el('section');
  const section = el('section', { class: 'block', id: 'contacts' }, [el('h3', { text: 'אנשי קשר' })]);
  people.forEach(([role, name, title, email, phone]) => {
    const tel = safeTel(phone);
    const mail = safeMail(email);
    section.append(el('article', { class: 'criterion' }, [
      el('p', { class: 'muted', text: role }),
      name ? el('p', { text: name }) : null,
      title ? el('p', { text: title }) : null,
      tel ? el('a', { href: tel, text: String(phone) }) : null,
      mail ? el('a', { href: mail, text: String(email) }) : null,
    ]));
  });
  return section;
};
