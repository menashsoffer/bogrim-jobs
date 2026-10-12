import { el, heCount } from './dom.js';
import { openJob } from './job-drawer.js';
import { scoreJob, visibleJobs } from './score.js';
import { peekJob, store } from './store.js';

export const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (store.leafletLoading) return store.leafletLoading;
  store.leafletLoading = new Promise((resolve, reject) => {
    document.head.append(el('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }));
    const script = el('script', { src: 'vendor/leaflet/leaflet.js' });
    script.addEventListener('load', () => resolve(window.L));
    script.addEventListener('error', () => reject(new Error('leaflet')));
    document.body.append(script);
  });
  return store.leafletLoading;
};
const markerPopup = (group) => {
  const popup = el('div');
  if (group.length === 1) {
    const job = group[0];
    popup.append(el('strong', { text: job.title || job.role }));
    popup.append(el('p', { text: job.authority }));
    popup.append(el('button', {
      type: 'button',
      class: 'btn',
      text: 'פרטים',
      on: { click: () => openJob(job.id, null) },
    }));
    return popup;
  }
  popup.append(el('strong', { text: group[0].authority }));
  group.forEach((job) => {
    popup.append(el('button', {
      type: 'button',
      class: 'btn',
      text: job.role || job.title,
      on: { click: () => openJob(job.id, null) },
    }));
  });
  return popup;
};
const hasManualRating = (job) => {
  const ratings = peekJob(job.id).ratings || {};
  return store.state.criteria.some((criterion) => {
    if (criterion.type !== 'rating' && criterion.type !== 'yesno') return false;
    const raw = ratings[criterion.id];
    if (criterion.type === 'yesno') return raw === true || raw === false;
    return typeof raw === 'number' && raw >= 1 && raw <= 5;
  });
};
const paintMapCount = () => {
  const count = document.getElementById('map-count');
  if (count) count.textContent = heCount(visibleJobs().length, 'מוצגת משרה אחת לפי הסינון', 'מוצגות # משרות לפי הסינון');
};
export const drawMarkers = (leaflet) => {
  paintMapCount();
  if (!store.map) return;
  if (store.mapLayer) store.mapLayer.remove();
  store.mapLayer = leaflet.layerGroup().addTo(store.map);
  const groups = new Map();
  visibleJobs().forEach((job) => {
    if (job.lat == null || job.lon == null) return;
    if (!groups.has(job.authority)) groups.set(job.authority, []);
    groups.get(job.authority).push(job);
  });
  const bounds = [];
  const theme = getComputedStyle(document.documentElement);
  const ink = theme.getPropertyValue('--bg').trim();
  const tone = (name) => theme.getPropertyValue(name).trim();
  const [high, mid, low, none] = ['--map-hi', '--map-mid', '--map-lo', '--map-none'].map(tone);
  groups.forEach((group) => {
    const best = group.map((job) => (hasManualRating(job) ? scoreJob(job).score : null)).filter((score) => score != null).sort((a, b) => b - a)[0];
    let options = { radius: 4.5, color: ink, weight: 1, fillColor: none, fillOpacity: 0.9 };
    if (best != null) {
      const fillColor = best >= 3.5 ? high : best >= 2.5 ? mid : low;
      options = { radius: 6, color: ink, weight: 1.5, fillColor, fillOpacity: 1 };
    }
    const marker = leaflet.circleMarker([group[0].lat, group[0].lon], options);
    marker.bindPopup(markerPopup(group));
    marker.bindTooltip(group.length === 1 ? (group[0].title || group[0].role) : group[0].authority);
    marker.addTo(store.mapLayer);
    bounds.push([group[0].lat, group[0].lon]);
  });
  if (store.state.home) {
    const home = leaflet.marker([store.state.home.lat, store.state.home.lon], {
      title: 'הבית',
      icon: leaflet.divIcon({ className: 'home-pin', iconSize: [16, 16] }),
    });
    home.bindPopup(el('span', { text: store.state.home.label || 'הבית' }));
    home.addTo(store.mapLayer);
    bounds.push([store.state.home.lat, store.state.home.lon]);
  }
  if (bounds.length) store.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
};
export const ensureMap = async () => {
  const host = document.getElementById('map');
  try {
    const leaflet = await loadLeaflet();
    const placeholder = document.querySelector('.map-ph');
    if (placeholder) placeholder.hidden = true;
    if (!store.map) {
      store.map = leaflet.map(host, { zoomControl: true });
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(store.map);
      store.map.setView([31.4, 34.9], 8);
    }
    drawMarkers(leaflet);
    setTimeout(() => {
      if (!store.map) return;
      store.map.invalidateSize();
      drawMarkers(leaflet);
    }, 60);
    if (new URLSearchParams(location.search).get('test') === '1') window.__map = store.map;
  } catch (error) {
    host.replaceChildren(el('p', { class: 'empty', text: 'המפה לא נטענה. שאר האתר זמין בלי מפה.' }));
  }
};
