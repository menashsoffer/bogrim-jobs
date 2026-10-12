import { el, externalLink, safeTravelUrl } from './dom.js';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const enc = (value) => encodeURIComponent(clean(value));
const hasPoint = (place) => place && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon));

// moovit.com/?… now opens the marketing site. The planner lives on moovitapp.com,
// and metroId=1 keeps the search in Israel instead of the visitor's default city.
export const moovitWebUrl = (home, destination) => {
  const parts = [];
  if (hasPoint(home)) {
    parts.push(`from=${enc(home.label || 'הבית')}`);
    parts.push(`fll=${Number(home.lat)}_${Number(home.lon)}`);
  }
  parts.push(`to=${enc(destination.name || '')}`);
  parts.push(`tll=${Number(destination.lat)}_${Number(destination.lon)}`);
  parts.push('lang=he');
  parts.push('metroId=1');
  return `https://moovitapp.com/?${parts.join('&')}`;
};
export const moovitAppUrl = (home, destination) => {
  const parts = [];
  if (hasPoint(home)) {
    parts.push(`orig_lat=${Number(home.lat)}`);
    parts.push(`orig_lon=${Number(home.lon)}`);
    parts.push(`orig_name=${enc(home.label || 'הבית')}`);
  }
  parts.push(`dest_lat=${Number(destination.lat)}`);
  parts.push(`dest_lon=${Number(destination.lon)}`);
  parts.push(`dest_name=${enc(destination.name || '')}`);
  parts.push('auto_run=true');
  return `moovit://directions?${parts.join('&')}`;
};
// The visible action is always the web planner. Custom-scheme detection is not
// reliable in browsers, so the app link is a second, optional control.
export const moovitLink = (home, destination) => externalLink(safeTravelUrl(moovitWebUrl(home, destination)), 'Moovit');
export const moovitAppLink = (home, destination) => el('a', {
  class: 'btn',
  href: moovitAppUrl(home, destination),
  text: 'באפליקציה',
});
