# בוחר המשרות

כלי סטטי בעברית, מימין לשמאל, להשוואה ולדירוג של 211 משרות ההשמה מאתר [בוגרים לשלטון המקומי](https://www.bogrim-muni.com/jobs). זהו כלי אישי נפרד: בלי שרת שלנו, בלי הסמל ובלי העיצוב של אתר המקור. הדירוגים, ההערות, יומן השיחות, הכתובת והמסלולים נשמרים רק בדפדפן, במפתח `bogrim-jobs.v1`. קטלוג המשרות לא נשמר שם.

![רשימת המשרות](docs/screenshots/list-desktop.png)

## למה המבנה ככה

האתר הציבורי נבנה מחדש בכל הרצה ואינו נשמר ב-git. `python3 build.py` כותב `dist/` מהקבצים ב-`src/`. מי שמשכפל את המאגר בלי הסריקה הגולמית בונה מ-`data/jobs.json`, הקטלוג המסונן.

`data/jobs.json` הוא הקובץ היחיד מעל 400 שורות שנשמר כחריג: הוא קטלוג שנוצר בבנייה (שדה לכל שורה), לא קוד. `vendor/` מחזיק קבצים של ספריות כפי שהן במקור, והוא פטור מכלל 400 השורות. שאר קבצי המקור, כולל הבדיקות וקובצי ה-CSS של האפליקציה, נשמרים מתחת ל-400 שורות.

## מבנה

| נתיב | תפקיד |
| --- | --- |
| `src/app.js` | עלייה: טעינת הנתונים, ניווט, מקלדת |
| `src/job-list.js` | רשימה, חיפוש, סינון, מיון |
| `src/job-drawer.js` | מגירת המשרה |
| `src/drawer-sections.js` | נסיעה, עובדות, ואנשי קשר כשהדגל דלוק |
| `src/job-compare.js` | השוואה |
| `src/settings-panel.js` | בית, קריטריונים, ייצוא |
| `src/travel.js` | איתור כתובת וחישוב מסלול |
| `src/job-map.js` | מפה, נטענת רק בלשונית «מפה» |
| `src/score.js` | ציון וסינון לוגי |
| `src/store.js` | מצב ושמירה מקומית |
| `src/backup.js` | JSON ו-CSV |
| `src/dom.js` | בניית ממשק בטקסט, בלי HTML מוזרק |
| `data/jobs.json` | הקטלוג המסונן שנשמר במאגר. החריג היחיד לאורך |
| `data/raw/` | סריקה גולמית. לא במאגר |
| `dist/` | אתר בנוי. לא במאגר, נוצר בבנייה |
| `dist-contacts/` | בנייה מקומית עם אנשי קשר. לא במאגר |
| `geo/` | קואורדינטות הרשויות ורשימת היישובים. `loc.json` ו-`cities_il_gist.json` לא במאגר |
| `vendor/leaflet/` | Leaflet 1.9.4, בלי CDN. `vendor/` פטור מכלל 400 השורות |

## בנייה והרצה

```bash
python3 build.py
python3 -m http.server -d dist 8000
```

לפתוח `http://127.0.0.1:8000/`. צריך שרת מקומי: המודולים לא רצים מ-`file://`.

אם `data/raw/bogrim_jobs.json` קיים במחשב, הבנייה קוראת אותו. את `data/jobs.json` היא מעדכנת רק אם רשימת המשרות השתנתה. בנייה מהקטלוג עצמו לא כותבת אותו מחדש.

`python3 geo/geocode_authorities.py` בונה מחדש את קואורדינטות הרשויות. הוא לא רץ בלי שלושה קלטים מקומיים, וכולם ב-`.gitignore`: הסריקה הגולמית (`python3 scrape.py`), `geo/loc.json` (הקובץ `src/locations.json` מ-[israel-geolocation](https://github.com/akivaschiff/israel-geolocation)), ו-`geo/cities_il_gist.json` (הקובץ `CitiesIL.json` מ-[gist של יישובים](https://gist.github.com/idomongo/f53331860322b94a8ba8e8a92ce401ec)). אלה רשימות יישובים ציבוריות, בלי פרטים אישיים. הדוח `geo/geocode_report.txt` נכתב מקומית ואינו נשמר במאגר. הקואורדינטות המוכנות כן במאגר (`authority_coords.json`, `localities_clean.json`), ולכן בנייה רגילה לא צריכה את הקלטים האלה.

## פריסה

דחיפה ל-`main`, או הרצה ידנית מ-Actions, מפעילה את `.github/workflows/pages.yml`. הוא מריץ `python3 build.py` בלי `--include-contacts`, בודק שאין דוא״ל או טלפון ב-`dist/`, ומעלה רק את `dist/` ל-GitHub Pages. הפריסה משתמשת בקטלוג שכבר שמור במאגר, בלי סריקה מתוזמנת של אתר המקור. אין להוסיף `--include-contacts` ל-CI.

הכתובת הציבורית היא `https://menashsoffer.github.io/bogrim-jobs/`, כמו `PUBLIC_BASE_URL`. הקישורים לקבצים יחסיים, ולכן הם נטענים תחת `/bogrim-jobs/`.

בפעם הראשונה: בהגדרות המאגר, Pages, Source: GitHub Actions.

## בדיקות

```bash
bash scripts/test.sh
```

בפייתון שחוסם התקנה גלובלית (PEP 668): `python3 -m venv .venv && . .venv/bin/activate && bash scripts/test.sh`.

הפקודה מתקינה את Playwright `1.55.0`, בונה את `dist/`, מריצה את בדיקות הניקוי, ואז בדיקות דפדפן. סריקת הדוא״ל והטלפון רצה על הבנייה הציבורית.

## דגל אנשי קשר

```bash
python3 build.py --include-contacts
```

כברירת מחדל הדגל כבוי.

- שדות אישיים לא נכתבים ל-`dist/` ולא ל-`data/jobs.json`
- הרשימה המותרת חלה, והמגירה לא מציירת קישורי `tel:` או `mailto:`
- הממשק עצמו קיים ב-`drawer-sections.js` ורץ רק כש-`meta.includeContacts` דלוק

בהדלקה הבנייה קוראת את ה-JSON הגולמי המקומי וכותבת רק אל `dist-contacts/`. היא מסרבת לכתוב לתוך `dist/`. תיקון טלפון שהוקלד בשדה דוא״ל, ותיקון סיומת דומיין ידועה, חלים רק על הנתיב הזה.

כפתור המקור הוא «למודעה המקורית», כי כך קובעת רשימת הקבלה. הניסוח «לפרטי קשר באתר המקור» לא בשימוש.

## פרטיות

`robots.txt` חוסם את כל האתר, וב-HTML יש `noindex`. מדיניות התוכן היא:

`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://api.openrouteservice.org; object-src 'none'; base-uri 'self'; form-action 'none'`

בטעינה אין בקשה לצד שלישי. Nominatim רק אחרי «אתר כתובת», ואם היישוב ברשימה המקומית אין רשת. זמן נסיעה ברכב נשלח ל-OSRM רק אחרי «חשב זמני נסיעה» ואישור. אופניים, הליכה ודקות תחבורה ציבורית לא מחושבים. גיבוי ישן עם השדות האלה נטען בלי שגיאה: הם נזרקים, וזמני הרכב והדירוגים נשמרים. קישור Moovit נפתח ב-`moovitapp.com` עם `metroId=1`, כי `moovit.com/?…` מגיע לאתר השיווקי ולא למתכנן המסלול. אריחי OpenStreetMap רק אחרי «מפה». «נקה נתונים» מוחק את מה שנשמר בדפדפן.

## מצב מול רשימת הקבלה

הקוד מכסה את הסעיפים. «נותר» הוא מה שעוד לא אומת בהרצה האחרונה, או מה שהחלטת האבטחה משנה.

- [x] 211 משרות, כותרת «211 משרות», קישור «למודעה המקורית»
- [x] חמשת הקריטריונים, משקל, סדר, סוגים, ציון בלי אפס לקריטריון חסר, «חלקי», «איפוס לברירת מחדל»
- [x] הערות, «מועדף», ארבעת הסטטוסים, «יומן שיחות»
- [x] «כתובת הבית», זמן נסיעה ברכב, Google Maps, Moovit, Waze, «קו אווירי (הערכה)»
- [x] חיפוש, סינון AND, «נקה סינון», מיון, «מוצגות N משרות», «לא נמצאו משרות»
- [x] מגירה: סגירה, Esc, רקע, החזרת פוקוס, `#job=`
- [x] השוואה עד 4, וחסימה ב«אפשר להשוות עד 4 משרות»
- [x] מפה אופציונלית בלי לחסום את שאר האתר
- [x] `localStorage`, ייצוא JSON, ייבוא עם אימות, CSV עם BOM
- [x] `lang="he"`, `dir="rtl"`, מטרות מגע, תגיות שיתוף
- [ ] אנשי קשר `tel:` / `mailto:` במגירה הציבורית — בכוונה לא מוצגים. רשימת הקבלה ביקשה אותם; הם מאחורי `--include-contacts`
- [x] Lighthouse למובייל: נגישות 100, ביצועים 96, שיטות עבודה מומלצות 100. SEO 63 רק בגלל `noindex`
- [x] `og:url` ו-`og:image` נבנים מ-`PUBLIC_BASE_URL` ב-`build.py` (`https://menashsoffer.github.io/bogrim-jobs/`). הפריסה ב-`.github/workflows/pages.yml`

## אבטחה

- [x] הקובץ הגולמי לא במאגר. `data/raw/` ו-`dist-contacts/` ב-`.gitignore`
- [x] `dist/` לא במאגר כי הבנייה משחזרת אותו
- [x] רשימת שדות מותרת. ברירת המחדל בלי דוא״ל, טלפון, שם אדם או `_owner`
- [x] טקסט רגיל בלבד, בלי `innerHTML`
- [x] `noindex` ו-`Disallow: /`
- [x] Leaflet מקומי. אין `npm`. פריסת Pages רצה מ-Actions, בלי רענון מתוזמן
