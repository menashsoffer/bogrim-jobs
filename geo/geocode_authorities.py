#!/usr/bin/env python3
"""Resolve every authority in data/raw/bogrim_jobs.json (gitignored; not committed) to lat/lon.

Sources (in order):
  1. MANUAL: authority -> HQ locality (regional councils / clusters / name variants) or explicit coords
  2. geo/loc.json: public Israeli localities (github.com/akivaschiff/israel-geolocation, src/locations.json). Not committed.
  3. geo/cities_il_gist.json: public CBS points (gist.github.com/idomongo/f53331860322b94a8ba8e8a92ce401ec, CitiesIL.json). Not committed.
  4. Nominatim (OpenStreetMap), cached in nominatim_cache.json, polite 1.2 s rate-limit.
Cross-check: exact-name matches are compared with Nominatim's place result; if they disagree by >8 km
the Nominatim coordinate wins (loc.json has a few bad rows) and it's reported.
Outputs: authority_coords.json, localities_clean.json, and geocode_report.txt (gitignored).
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'bogrim-jobs-helper/1.0 (personal job-comparison tool)'
P = lambda *a: os.path.join(HERE, *a)

# authority -> (HQ locality name in loc.json, precision, note)   precision: exact | hq | approx
MANUAL = {
  'אפרתה': ('אפרת', 'exact', ''),
  'באקה אל-גרבייה': ('באקה אל-גרביה', 'exact', ''),
  "בית ג'אן": ("בית ג'ן", 'exact', ''),
  'יקנעם': ('יקנעם עילית', 'exact', ''),
  'שפיר': ('שפיר', 'hq', 'מרכז שפירא – אזור משרדי המועצה'),
  'מודיעין עילית - חכ"ל': ('מודיעין עילית', 'exact', ''),
  # regional councils -> HQ / central locality
  'אל קסום': ('אום בטין', 'approx', 'מקורב – יישוב במועצה (משרדי המועצה בסביבת באר שבע)'),
  'אל-בטוף': ('עוזייר', 'approx', 'מקורב – יישוב מרכזי במועצה'),
  'אשכול': ('מגן', 'approx', 'מקורב – אזור המרכז האזורי של המועצה'),
  'בקעת הירדן': ('פצאל', 'approx', 'מקורב – מרכז הבקעה'),
  'גולן': ('קצרין', 'hq', 'משרדי המועצה בקצרין'),
  'גוש עציון': ('אלון שבות', 'approx', 'מקורב – אזור משרדי המועצה'),
  'הגלבוע': ('גן נר', 'approx', 'מקורב – אזור משרדי המועצה'),
  'הגליל העליון': ('כפר בלום', 'approx', 'מקורב – אזור המרכז האזורי ליד קריית שמונה'),
  'הר חברון': ('כרמל', 'approx', 'מקורב – יישוב במועצה'),
  'חבל אילות': ('אילות', 'approx', 'מקורב – אזור משרדי המועצה'),
  'חבל יבנה': ('קבוצת יבנה', 'approx', 'מקורב – אזור משרדי המועצה'),
  'חוף אשקלון': ('מבקיעים', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מבואות החרמון': ('כפר גלעדי', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מגילות ים המלח': ('קליה', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מטה אשר': ('רגבה', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מטה בנימין': ('פסגות', 'approx', 'מקורב – אזור משרדי המועצה (שער בנימין)'),
  'מעלה יוסף': ('מעונה', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מרום הגליל': ('מירון', 'approx', 'מקורב – אזור משרדי המועצה'),
  'מרחבים': ('גילת', 'approx', 'מקורב – אזור משרדי המועצה'),
  'נווה מדבר': ('אבו קרינאת (יישוב)', 'approx', 'מקורב – יישוב במועצה'),
  'נחל שורק': ('בני ראם', 'approx', 'מקורב – יישוב במועצה'),
  'עמק המעיינות': ('ניר דוד (תל עמל)', 'approx', 'מקורב – אזור משרדי המועצה'),
  'רמת נגב': ('משאבי שדה', 'approx', 'מקורב – אזור משרדי המועצה'),
  'שומרון': ('ברקן', 'approx', 'מקורב – אזור משרדי המועצה'),
  'שער הנגב': ('ניר עם', 'approx', 'מקורב – אזור משרדי המועצה (צומת שער הנגב)'),
  # clusters (אשכולות) -> office location
  'אשכול בית הכרם הגלילי': ('כרמיאל', 'hq', 'משרדי האשכול ברח׳ משגב, כרמיאל'),
  'אשכול גליל מערבי': ('כברי', 'hq', 'משרדי האשכול בקיבוץ כברי'),
  'אשכול נגב מערבי': ('נתיבות', 'hq', 'משרדי האשכול בנתיבות'),
  'אשכול הגליל והעמקים': ('נצרת', 'approx', 'מקורב – מיקום המשרדים לא אומת (אזור נצרת/העמקים)'),
  'אשכול הכנרת והעמקים': ('טבריה', 'approx', 'מקורב – מיקום המשרדים לא אומת (אזור הכנרת)'),
  'אשכול המפרץ': ('קרית ביאליק', 'approx', 'מקורב – מיקום המשרדים לא אומת (הקריות)'),
  'אשכול השרון': ('תל מונד', 'approx', 'מקורב – מיקום המשרדים לא אומת (מרכז השרון)'),
  'אשכול יהודה ושומרון': ('אריאל', 'approx', 'מקורב – מיקום המשרדים לא אומת'),
  'אשכול שורק דרומי': ('קרית מלאכי', 'approx', 'מקורב – מיקום המשרדים לא אומת'),
}
# explicit coordinate fixes (also applied to the home-picker localities list)
FIX = {
  'עמנואל': (32.1606, 35.1376),
  'קרית ארבע': (31.5325, 35.1197),
}
# council/cluster offices found in OpenStreetMap (townhall / government office / council-named bus stop)
HQ = {
  'אשכול': (31.3028, 34.4314, 'משרדי המועצה (OSM)'),
  'בקעת הירדן': (32.1007, 35.4935, 'משרדי המועצה (OSM)'),
  'גולן': (32.9934, 35.6915, 'משרדי המועצה בקצרין (OSM)'),
  'גוש עציון': (31.6455, 35.1317, 'צומת גוש עציון – אזור משרדי המועצה'),
  'הר חברון': (31.3748, 35.0061, 'משרדי המועצה (OSM)'),
  'חוף אשקלון': (31.6458, 34.5963, 'משרדי המועצה (OSM)'),
  'מבואות החרמון': (33.1182, 35.5695, 'משרדי המועצה (OSM)'),
  'מטה אשר': (32.9703, 35.0925, 'תחנת "מועצה אזורית מטה אשר" (OSM)'),
  'מטה בנימין': (31.9002, 35.2228, 'משרדי המועצה, פסגות (OSM)'),
  'מרום הגליל': (32.9973, 35.4406, 'תחנת "מועצה אזורית מרום הגליל" (OSM)'),
  'עמק המעיינות': (32.4941, 35.5192, 'משרדי המועצה (OSM)'),
  'רמת נגב': (31.0042, 34.7705, 'משרדי המועצה (OSM)'),
  'שער הנגב': (31.5139, 34.5969, 'תחנת "מועצה אזורית שער הנגב" (OSM)'),
}
PLACE_TYPES = {'city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'isolated_dwelling', 'locality'}

def norm(s): return re.sub(r'[\s\-–\'"״׳`()]', '', s or '')
def hav(a, b):
    R = 6371; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

cache_f = P('nominatim_cache.json')
cache = json.load(open(cache_f)) if os.path.exists(cache_f) else {}
def nominatim(q, online=True):
    if q in cache: return cache[q]
    if not online: return None
    u = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'jsonv2', 'countrycodes': 'il,ps', 'limit': 3, 'accept-language': 'he'})
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=30))
    except Exception as e:
        print('nominatim error', q, e); return None
    cache[q] = [{k: x.get(k) for k in ('lat', 'lon', 'display_name', 'type', 'category', 'addresstype')} for x in r]
    json.dump(cache, open(cache_f, 'w'), ensure_ascii=False, indent=1); time.sleep(1.2)
    return cache[q]

def build_localities(online):
    """Merge two public datasets. Coordinates priority: CBS point (cities_il_gist.json, by settlement code)
    > akivaschiff loc.json (unless its coordinate is a shared placeholder / outside Israel) > Nominatim."""
    import collections, html as H
    L = json.load(open(P('loc.json')))
    gist = json.load(open(P('cities_il_gist.json'))) if os.path.exists(P('cities_il_gist.json')) else []
    G = {}
    for x in gist:
        c = x['City']; pt = (c.get('Point') or {}).get('coordinates')
        if pt and c.get('name', '').strip(): G[str(c['code'])] = (H.unescape(c['name'].strip()), pt[1], pt[0])
    dup = collections.Counter((round(l['lat'], 3), round(l['lon'], 3)) for l in L if l['lat'])
    out, seen_codes = [], set()
    for l in L:
        name = (l['name'] or '').strip()
        if not name or name.startswith('מחנה '): continue
        code = str(l['id']); seen_codes.add(code)
        if name in FIX: lat, lon = FIX[name]
        elif code in G: _, lat, lon = G[code]
        elif l['lat'] and dup[(round(l['lat'], 3), round(l['lon'], 3))] == 1 and 29.3 < l['lat'] < 33.5 and 34.2 < l['lon'] < 35.95:
            lat, lon = l['lat'], l['lon']
        else:
            r = nominatim(name, online) or []
            pl = next((x for x in r if x.get('addresstype') in PLACE_TYPES or x.get('type') in PLACE_TYPES), None)
            if not pl: continue
            lat, lon = float(pl['lat']), float(pl['lon'])
        if 29.3 < lat < 33.5 and 34.2 < lon < 35.95:
            out.append(dict(name=name, lat=lat, lon=lon))
    names = {o['name'] for o in out}
    for code, (name, lat, lon) in G.items():
        if code not in seen_codes and name not in names and not name.startswith('מחנה ') and 29.3 < lat < 33.5 and 34.2 < lon < 35.95:
            out.append(dict(name=name, lat=lat, lon=lon)); names.add(name)
    return out

LOC_SOURCE = "https://github.com/akivaschiff/israel-geolocation"
CITIES_SOURCE = "https://gist.github.com/idomongo/f53331860322b94a8ba8e8a92ce401ec"

def require_inputs():
    missing = []
    raw = os.path.join(HERE, "..", "data", "raw", "bogrim_jobs.json")
    if not os.path.exists(raw):
        missing.append(f"missing {raw} — run python3 scrape.py (output stays gitignored)")
    if not os.path.exists(P("loc.json")):
        missing.append(f"missing geo/loc.json — save src/locations.json from {LOC_SOURCE} as geo/loc.json")
    if not os.path.exists(P("cities_il_gist.json")):
        missing.append(f"missing geo/cities_il_gist.json — save CitiesIL.json from {CITIES_SOURCE} as geo/cities_il_gist.json")
    if missing:
        raise SystemExit("geocode inputs are not in the repo:\n" + "\n".join(missing))

def main(online='--offline' not in sys.argv):
    require_inputs()
    jobs = json.load(open(os.path.join(HERE, '..', 'data', 'raw', 'bogrim_jobs.json')))
    L = build_localities(online)
    idx = {}
    for l in L:
        if l['name']: idx.setdefault(norm(l['name']), l)
    auths = sorted({j['authority'] for j in jobs if j.get('authority')})
    out, rep = {}, []
    for a in auths:
        rec = None
        if a in HQ:
            rec = dict(lat=HQ[a][0], lon=HQ[a][1], precision='hq', via='OSM', note=HQ[a][2])
        elif a in MANUAL:
            name, prec, note = MANUAL[a]
            l = idx.get(norm(name))
            if l: rec = dict(lat=l['lat'], lon=l['lon'], precision=prec, via=name, note=note)
        if not rec and a in FIX:
            rec = dict(lat=FIX[a][0], lon=FIX[a][1], precision='exact', via='manual fix', note='')
        if not rec:
            l = idx.get(norm(a))
            if l: rec = dict(lat=l['lat'], lon=l['lon'], precision='exact', via=l['name'], note='')
        # cross-check / fallback with Nominatim
        nr = nominatim(a, online)
        place = next((x for x in (nr or []) if x.get('addresstype') in PLACE_TYPES or x.get('type') in PLACE_TYPES), None)
        if rec and place and rec['precision'] == 'exact' and a not in FIX:
            d = hav((rec['lat'], rec['lon']), (float(place['lat']), float(place['lon'])))
            if d > 8:
                rep.append(f'FIXED  {a}: dataset ({rec["lat"]:.4f},{rec["lon"]:.4f}) differs {d:.0f} km from OSM -> using OSM ({place["display_name"][:60]})')
                rec.update(lat=float(place['lat']), lon=float(place['lon']), via='OpenStreetMap')
        if not rec and place:
            rec = dict(lat=float(place['lat']), lon=float(place['lon']), precision='approx', via='OpenStreetMap', note='מקורב – זוהה אוטומטית')
            rep.append(f'OSM    {a}: {place["display_name"][:80]}')
        if not rec:
            rec = dict(lat=None, lon=None, precision='none', via='', note='לא נמצא מיקום')
            rep.append(f'FAILED {a}')
        rec['lat'] = None if rec['lat'] is None else round(float(rec['lat']), 5)
        rec['lon'] = None if rec['lon'] is None else round(float(rec['lon']), 5)
        if rec['lat'] is not None and not (29.3 < rec['lat'] < 33.5 and 34.2 < rec['lon'] < 35.95):
            rep.append(f'WARN   {a}: outside Israel bbox {rec}')
        out[a] = rec
    json.dump(out, open(P('authority_coords.json'), 'w'), ensure_ascii=False, indent=1)
    locs = sorted(([l['name'], round(l['lat'], 4), round(l['lon'], 4)] for l in L), key=lambda x: x[0])
    json.dump(locs, open(P('localities_clean.json'), 'w'), ensure_ascii=False)
    from collections import Counter
    c = Counter(r['precision'] for r in out.values())
    summary = [f'authorities: {len(out)}  ' + ', '.join(f'{k}={v}' for k, v in c.items()), f'localities for home picker: {len(locs)}', '']
    summary += [f'{r["precision"]:6} {a} -> {r["via"]}  {r["note"]}' for a, r in out.items() if r['precision'] != 'exact']
    open(P('geocode_report.txt'), 'w').write('\n'.join(summary + [''] + rep) + '\n')
    print('\n'.join(summary + rep))

if __name__ == '__main__':
    main()
