export const STATUSES = ['לא נבדק', 'דיברתי איתם', 'מעניין', 'פסול'];
export const UNKNOWN = 'לא ידוע';
export const AIR_LABEL = 'קו אווירי (הערכה)';
export const CRIT_TYPES = [
  ['rating', 'דירוג 1–5'],
  ['yesno', 'כן/לא'],
  ['text', 'טקסט'],
  ['travel', 'נסיעה אוטומטית'],
];
export const el = (tag, attrs = {}, kids = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'value') node.value = String(value);
    else if (key === 'on') {
      Object.entries(value).forEach(([name, handler]) => node.addEventListener(name, handler));
    } else if (key === 'data') {
      Object.entries(value).forEach(([name, dataValue]) => { node.dataset[name] = String(dataValue); });
    } else if (key === 'checked' || key === 'disabled' || key === 'hidden') node[key] = true;
    else node.setAttribute(key, value === true ? '' : String(value));
  });
  const list = Array.isArray(kids) ? kids.flat() : [kids];
  list.forEach((kid) => {
    if (kid == null || kid === false) return;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  });
  return node;
};
export const labelOrUnknown = (value) => (value == null || value === '' ? UNKNOWN : String(value));
export const formatScore = (score) => (Math.round(score * 10) / 10).toFixed(1);
export const formatDuration = (minutes) => {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total < 0) return '';
  if (total < 60) return `${total} דק׳`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const hourLabel = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
  return rest > 0 ? `${hourLabel} ו-${rest} דק׳` : hourLabel;
};
export const formatKm = (km) => {
  if (km == null || Number.isNaN(km)) return UNKNOWN;
  const rounded = km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km));
  return `${rounded} ק"מ`;
};
export const formatStamp = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};
export const scoreBand = (score) => {
  if (score == null) return 'score-none';
  return `score-${Math.max(1, Math.min(5, Math.round(score)))}`;
};
export const statusClass = (status) => {
  if (status === 'דיברתי איתם') return 'status status-talk';
  if (status === 'מעניין') return 'status status-yes';
  if (status === 'פסול') return 'status status-no';
  return 'status';
};
const allowedHost = (hostname, names) => names.includes(hostname);
export const safeHttps = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (!allowedHost(parsed.hostname, ['www.bogrim-muni.com', 'bogrim-muni.com'])) return '';
    return parsed.href;
  } catch (error) {
    return '';
  }
};
export const safeTravelUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    const names = ['www.google.com', 'maps.google.com', 'www.waze.com', 'waze.com', 'moovit.com', 'www.moovit.com', 'moovitapp.com', 'www.moovitapp.com'];
    if (!allowedHost(parsed.hostname, names)) return '';
    return url;
  } catch (error) {
    return '';
  }
};
export const safeTel = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{8,15}$/.test(digits)) return '';
  return `tel:${digits}`;
};
export const safeMail = (email) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) return '';
  return `mailto:${email}`;
};
export const toast = (message, action) => {
  const node = document.getElementById('toast');
  if (!node) return;
  node.replaceChildren(document.createTextNode(message));
  if (action) {
    node.append(el('button', {
      type: 'button',
      class: 'btn',
      text: action.label,
      on: { click: () => {
        node.classList.remove('is-on');
        action.run();
      }},
    }));
  }
  node.classList.add('is-on');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('is-on'), action ? 5000 : 3200);
};
export const showLimit = (message) => {
  const alert = document.getElementById('limit-alert');
  if (alert) {
    alert.hidden = false;
    alert.textContent = message;
  }
  toast(message);
};
export const externalLink = (href, text) => el('a', {
  class: 'btn',
  href,
  target: '_blank',
  rel: 'noopener noreferrer',
  text,
});
