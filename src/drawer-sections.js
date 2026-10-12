import { UNKNOWN, el, labelOrUnknown, safeMail, safeTel, safeTravelUrl } from './dom.js';
import { icon } from './icons.js';
import { moovitAppLink, moovitLink } from './moovit.js';
import { travelSummary } from './score.js';
import { store } from './store.js';

const travelLink = (href, text, name) => {
  const safe = safeTravelUrl(href);
  if (!safe) return null;
  return el('a', {
    class: 'btn btn-quiet',
    href: safe,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, [icon(name, 'sm'), text]);
};
const travelLinks = (job) => {
  const destination = `${job.lat},${job.lon}`;
  const origin = store.state.home ? `${store.state.home.lat},${store.state.home.lon}` : '';
  const google = (mode) => {
    const base = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=${mode}`;
    return origin ? `${base}&origin=${origin}` : base;
  };
  const waze = origin
    ? `https://www.waze.com/ul?ll=${destination}&navigate=yes&from=${origin}`
    : `https://www.waze.com/ul?ll=${destination}&navigate=yes`;
  const place = { name: job.authority || '', lat: job.lat, lon: job.lon };
  const moovit = moovitLink(store.state.home, place);
  const moovitApp = moovitAppLink(store.state.home, place);
  if (moovit) {
    moovit.classList.add('btn-quiet');
    moovit.prepend(icon('bus', 'sm'));
  }
  if (moovitApp) moovitApp.classList.add('btn-quiet');
  return [
    travelLink(google('driving'), 'Google Maps · רכב', 'car'),
    travelLink(waze, 'Waze', 'car'),
    travelLink(google('transit'), 'Google Maps · תחבורה ציבורית', 'bus'),
    moovit,
    moovitApp,
  ].filter(Boolean);
};
export const travelSection = (job) => {
  const section = el('section', { class: 'block' }, [el('h3', { text: 'נסיעה' })]);
  if (job.lat == null || job.lon == null) {
    section.append(el('p', { text: UNKNOWN }));
    return section;
  }
  if (!store.state.home) section.append(el('p', { text: 'הגדירו כתובת בית בהגדרות כדי לראות מרחק ומסלול.' }));
  else {
    section.append(el('p', { id: 'travel-summary', text: travelSummary(job) }));
    section.append(el('p', { class: 'hint', text: 'בלי מסלול מחושב מוצג קו אווירי (הערכה). חישוב זמן הרכב נעשה רק בהגדרות, אחרי אישור.' }));
  }
  section.append(el('div', { class: 'row', id: 'travel-links' }, travelLinks(job)));
  return section;
};
export const factsSection = (job) => el('section', { class: 'block' }, [
  el('h3', { text: 'פרטי המשרה' }),
  el('dl', { class: 'facts' }, [
    el('dt', { text: 'תפקיד' }), el('dd', { text: job.role || UNKNOWN }),
    el('dt', { text: 'תחום' }), el('dd', { text: (job.categories || []).join(', ') || UNKNOWN }),
    el('dt', {}, [icon('users-round', 'sm'), 'אוכלוסייה']), el('dd', { text: labelOrUnknown(job.population) }),
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
