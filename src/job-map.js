import { el } from './dom.js';
import { openJob } from './job-drawer.js';
import { scoreJob, visibleJobs } from './score.js';
import { store } from './store.js';

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
const paintMapCount = () => {
  const count = document.getElementById('map-count');
  if (count) count.textContent = `מוצגות ${visibleJobs().length} משרות לפי הסינון`;
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
  groups.forEach((group) => {
    const best = group.map((job) => scoreJob(job).score).filter((score) => score != null).sort((a, b) => b - a)[0];
    const theme = getComputedStyle(document.documentElement);
    const band = best == null ? 'none' : String(Math.max(1, Math.min(5, Math.round(best))));
    const marker = leaflet.circleMarker([group[0].lat, group[0].lon], {
      radius: 8,
      color: theme.getPropertyValue('--surface').trim(),
      weight: 2,
      fillColor: theme.getPropertyValue(`--score-${band}`).trim(),
      fillOpacity: 0.95,
    });
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
    if (!store.map) {
      store.map = leaflet.map(host, { zoomControl: true });
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(store.map);
      store.map.setView([31.4, 34.9], 8);
    }
    setTimeout(() => { if (store.map) store.map.invalidateSize(); }, 60);
    drawMarkers(leaflet);
    if (new URLSearchParams(location.search).get('test') === '1') window.__map = store.map;
  } catch (error) {
    host.replaceChildren(el('p', { class: 'empty', text: 'המפה לא נטענה. שאר האתר זמין בלי מפה.' }));
  }
};
