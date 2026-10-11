import { el, toast } from './dom.js';
import { refreshDrawer } from './job-drawer.js';
import { renderResults } from './job-list.js';
import { ORS, OSRM, homeKey, normName, save, saveNow, sleep, store } from './store.js';

export const localityHits = (query, exactOnly) => {
  const needle = normName(query);
  if (!needle) return [];
  const hits = [];
  (store.data.localities || []).forEach((row) => {
    if (!Array.isArray(row) || row.length < 3) return;
    const name = String(row[0]);
    const normalized = normName(name);
    const exact = normalized === needle;
    if (exactOnly && !exact) return;
    if (!exact && !normalized.includes(needle)) return;
    hits.push({ label: name, lat: Number(row[1]), lon: Number(row[2]), exact });
  });
  hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label, 'he'));
  return hits.slice(0, 8);
};
export const setHomeStatus = (message) => {
  const node = document.getElementById('home-status');
  if (node) node.textContent = message;
};
export const setHome = (place) => {
  store.state.home = {
    label: String(place.label).split(',').slice(0, 3).join(', ').trim(),
    lat: Math.round(Number(place.lat) * 1e5) / 1e5,
    lon: Math.round(Number(place.lon) * 1e5) / 1e5,
  };
  saveNow();
  setHomeStatus(`הבית הוגדר: ${store.state.home.label}`);
  const results = document.getElementById('home-results');
  if (results) results.replaceChildren();
  const hint = document.getElementById('home-hint');
  if (hint) hint.hidden = true;
  toast('הבית הוגדר');
  if (!document.getElementById('view-list').hidden) renderResults();
};
export const showHomeChoices = (choices) => {
  const host = document.getElementById('home-results');
  if (!host) return;
  host.replaceChildren(...choices.map((choice) => el('button', {
    type: 'button',
    class: 'btn',
    text: choice.label,
    on: { click: () => setHome(choice) },
  })));
};
export const nominatimSearch = async (query) => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'il,ps');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'he');
  url.searchParams.set('viewbox', '34.2,33.4,35.95,29.45');
  url.searchParams.set('bounded', '0');
  const response = await fetch(url);
  if (!response.ok) throw new Error('nominatim');
  const rows = await response.json();
  return rows.map((row) => ({
    label: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  })).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon));
};
const clearHomeResults = () => {
  const host = document.getElementById('home-results');
  if (host) host.replaceChildren();
};
export const onGeocode = async () => {
  clearHomeResults();
  const input = document.getElementById('home-address');
  const query = input ? input.value.trim() : '';
  if (!query) {
    setHomeStatus('הקלידו כתובת.');
    return;
  }
  const exact = localityHits(query, true);
  if (exact.length) {
    setHome(exact[0]);
    return;
  }
  const cacheKey = normName(query);
  if (Array.isArray(store.state.geocodeCache[cacheKey]) && store.state.geocodeCache[cacheKey].length) {
    showHomeChoices(store.state.geocodeCache[cacheKey]);
    setHomeStatus('נמצאו תוצאות שמורות במכשיר. בחרו אחת:');
    return;
  }
  setHomeStatus('מאתר כתובת…');
  try {
    const found = await nominatimSearch(query);
    if (found.length) {
      const keys = Object.keys(store.state.geocodeCache);
      if (keys.length > 30) delete store.state.geocodeCache[keys[0]];
      store.state.geocodeCache[cacheKey] = found;
      save();
    }
    const local = localityHits(query, false);
    const choices = found.concat(local).slice(0, 8);
    if (!choices.length) {
      clearHomeResults();
      setHomeStatus('לא הצלחנו לאתר את הכתובת. נסו שם יישוב מהרשימה, או בדקו את החיבור לאינטרנט.');
      return;
    }
    setHomeStatus(found.length ? 'בחרו תוצאה:' : 'האיתור המקוון לא מצא כתובת. אפשר לבחור יישוב מהרשימה המקומית:');
    showHomeChoices(choices);
  } catch (error) {
    const local = localityHits(query, false);
    if (local.length) {
      setHomeStatus('האיתור המקוון נכשל. אפשר לבחור יישוב מהרשימה המקומית:');
      showHomeChoices(local);
      return;
    }
    clearHomeResults();
    setHomeStatus('לא הצלחנו לאתר את הכתובת. נסו שם יישוב מהרשימה, או בדקו את החיבור לאינטרנט.');
  }
};
export const onGps = () => {
  if (!navigator.geolocation) {
    setHomeStatus('הדפדפן לא מאפשר גישה למיקום.');
    return;
  }
  setHomeStatus('מבקש את מיקום המכשיר…');
  navigator.geolocation.getCurrentPosition(
    (position) => setHome({ label: 'המיקום שלי', lat: position.coords.latitude, lon: position.coords.longitude }),
    () => setHomeStatus('לא התקבל מיקום. אפשר להקליד כתובת במקום.'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
};
export const storeRoute = (authority, value) => {
  const key = homeKey(store.state.home);
  if (!store.state.routes[key]) store.state.routes[key] = { car: {} };
  if (!store.state.routes[key].car) store.state.routes[key].car = {};
  store.state.routes[key].car[authority] = value;
};
export const fetchOsrm = async (names) => {
  const coords = [`${store.state.home.lon},${store.state.home.lat}`].concat(names.map((name) => {
    const point = store.authorityPoint.get(name);
    return `${point.lon},${point.lat}`;
  })).join(';');
  const url = `https://routing.openstreetmap.de/${OSRM.host}/table/v1/${OSRM.profile}/${coords}?sources=0&annotations=duration,distance`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('osrm');
  const body = await response.json();
  if (body.code !== 'Ok' || !body.durations || !body.durations[0]) throw new Error('osrm');
  names.forEach((name, index) => {
    const duration = body.durations[0][index + 1];
    const distance = body.distances && body.distances[0] ? body.distances[0][index + 1] : null;
    if (duration == null) return;
    storeRoute(name, { min: Math.max(0, Math.round(duration / 60)), km: distance == null ? null : Math.round(distance / 100) / 10 });
  });
};
export const fetchOrs = async (names) => {
  const locations = [[store.state.home.lon, store.state.home.lat]].concat(names.map((name) => {
    const point = store.authorityPoint.get(name);
    return [point.lon, point.lat];
  }));
  const response = await fetch(`https://api.openrouteservice.org/v2/matrix/${ORS}`, {
    method: 'POST',
    headers: { Authorization: store.state.routingKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, sources: [0], metrics: ['duration', 'distance'], units: 'm' }),
  });
  if (!response.ok) throw new Error('ors');
  const body = await response.json();
  names.forEach((name, index) => {
    const duration = body.durations && body.durations[0] ? body.durations[0][index + 1] : null;
    const distance = body.distances && body.distances[0] ? body.distances[0][index + 1] : null;
    if (duration == null) return;
    storeRoute(name, { min: Math.max(0, Math.round(duration / 60)), km: distance == null ? null : Math.round(distance / 100) / 10 });
  });
};
export const computeRoutes = async () => {
  const status = document.getElementById('route-status');
  if (!store.state.home) {
    if (status) status.textContent = 'קודם מגדירים כתובת בית.';
    return;
  }
  const names = [...store.authorityPoint.keys()];
  const bucket = store.state.routes[homeKey(store.state.home)];
  const todo = names.filter((name) => !(bucket && bucket.car && bucket.car[name]));
  if (!todo.length) {
    if (status) status.textContent = 'זמני הנסיעה כבר שמורים במכשיר.';
    return;
  }
  const service = store.state.routingKey ? 'openrouteservice' : 'OSRM';
  const agreed = window.confirm(`חישוב זמן הנסיעה ברכב שולח את קואורדינטות הבית ומיקומי הרשויות לשירות חיצוני (${service}). להמשיך?`);
  if (!agreed) {
    if (status) status.textContent = 'החישוב בוטל. מוצג קו אווירי (הערכה).';
    return;
  }
  if (status) status.textContent = 'מחשב זמן נסיעה ברכב…';
  let failed = false;
  try {
    const chunks = [];
    for (let start = 0; start < todo.length; start += 80) chunks.push(todo.slice(start, start + 80));
    for (let index = 0; index < chunks.length; index += 1) {
      if (index > 0) await sleep(1200);
      if (store.state.routingKey) await fetchOrs(chunks[index]);
      else await fetchOsrm(chunks[index]);
    }
  } catch (error) {
    failed = true;
  }
  saveNow();
  if (status) status.textContent = failed
    ? 'חלק מהמסלולים לא התקבלו. איפה שאין מסלול מוצג קו אווירי (הערכה).'
    : 'זמני הנסיעה נשמרו במכשיר.';
  renderResults();
  if (store.openJobId) refreshDrawer();
};
