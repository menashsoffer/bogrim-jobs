const SVG_NS = 'http://www.w3.org/2000/svg';

export const DOMAIN_ICON = {
  'תכנון אסטרטגי': 'compass',
  'פיתוח כלכלי': 'trending-up',
  'דיגיטציה וחדשנות': 'cpu',
  'פיתוח ארגוני': 'network',
  'שירות לתושב': 'handshake',
};
export const TYPE_ICON = {
  'עירייה': 'building-2',
  'מועצה מקומית': 'landmark',
  'מועצה אזורית': 'trees',
  'אשכול': 'combine',
};
export const STATUS_ICON = {
  'לא נבדק': 'circle-dashed',
  'דיברתי איתם': 'phone-call',
  'מעניין': 'thumbs-up',
  'פסול': 'circle-x',
};

export const icon = (name, size = 'md') => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const scale = size === 'lg' ? 'icon icon-lg' : size === 'sm' ? 'icon icon-sm' : 'icon';
  svg.setAttribute('class', scale);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `icons.svg#i-${name}`);
  svg.append(use);
  return svg;
};
