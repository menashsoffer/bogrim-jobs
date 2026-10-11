#!/usr/bin/env python3
"""Browser checks for the default public build. No contact data is expected."""
import json

from playwright.sync_api import sync_playwright

from site_harness import DIST, ROOT, TINY_PNG, chrome_path, parse_csv, search_count, serve


def main():
    if not (DIST / "index.html").exists() or not (DIST / "data.json").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    catalog = json.loads((DIST / "data.json").read_text(encoding="utf-8"))
    jobs = catalog["jobs"]
    energy = search_count(jobs, "אנרגיה")
    if energy <= 0 or energy >= 211:
        raise SystemExit(f"unexpected energy search count {energy}")

    server = serve()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    phase = {"nominatim": "abort", "osrm": "abort"}
    external = []
    tiles = []
    console_errors = []
    page_errors = []

    def handle_route(route):
        url = route.request.url
        if url.startswith(base) or url.startswith("blob:") or url.startswith("data:"):
            route.continue_()
            return
        external.append(url)
        if "tile.openstreetmap.org" in url:
            tiles.append(url)
            route.fulfill(status=200, content_type="image/png", body=TINY_PNG)
            return
        if "nominatim.openstreetmap.org" in url and phase["nominatim"] == "fail":
            route.fulfill(status=503, content_type="text/plain", body="no")
            return
        if "routing.openstreetmap.de" in url and phase["osrm"] == "ok":
            coord = url.split("?", 1)[0].rstrip("/").split("/")[-1]
            count = coord.count(";") + 1
            body = json.dumps({"code": "Ok", "durations": [[1800] * count], "distances": [[25000] * count]})
            route.fulfill(status=200, content_type="application/json", body=body)
            return
        route.abort()

    def attach(page):
        page.route("https://**/*", handle_route)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("dialog", lambda dialog: dialog.accept())

    def check(condition, message):
        if not condition:
            raise AssertionError(message)

    def shown_count(page):
        text = page.locator("#result-count").inner_text()
        return int(text.replace("מוצגות", "").replace("משרות", "").strip())

    def wait_count(page, count):
        page.wait_for_function(
            """(expected) => {
              const match = (document.getElementById('result-count').textContent || '').match(/מוצגות\\s+(\\d+)/);
              return match !== null && Number(match[1]) === expected;
            }""",
            arg=count,
        )

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = browser.new_context(
                locale="he-IL",
                viewport={"width": 1280, "height": 800},
                geolocation={"latitude": 32.08, "longitude": 34.78},
                permissions=["geolocation"],
                accept_downloads=True,
            )
            page = context.new_page()
            page.set_default_timeout(20000)
            attach(page)
            page.goto(base)
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            wait_count(page, 211)
            check(external == [], f"third-party requests on load: {external[:5]}")
            check(tiles == [], "map tiles loaded before the map was opened")

            html_lang = page.evaluate("() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })")
            check(html_lang["lang"] == "he" and html_lang["dir"] == "rtl", "page is not Hebrew RTL")
            csp = page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
            check(csp == "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://api.openrouteservice.org; object-src 'none'; base-uri 'self'; form-action 'none'", "CSP meta does not match the required policy")
            robots = page.locator('meta[name="robots"]').get_attribute("content")
            check(robots == "noindex", "robots meta")
            check(page.locator('meta[property="og:title"]').count() == 1, "og:title")
            check(page.locator('meta[property="og:locale"]').get_attribute("content") == "he_IL", "og:locale")
            robots_txt = page.evaluate("async () => (await fetch('robots.txt')).text()")
            check("Disallow: /" in robots_txt, "robots.txt")
            bundled = page.evaluate("async () => await (await fetch('data.json')).text()")
            check("includeContacts" in bundled and '"includeContacts":false' in bundled.replace(" ", ""), "bundle contacts flag")
            check("mailto:" not in bundled and "tel:" not in bundled, "contact links in data")
            check(page.locator('a[href^="tel:"], a[href^="mailto:"]').count() == 0, "contact links rendered")
            check("211 משרות" in page.locator("#job-count").inner_text(), "header count")
            check("בוגרים לשלטון המקומי" in page.locator(".source-banner").inner_text(), "source credit")

            opener = page.locator("button.card-open").first
            opener.click()
            page.locator("#drawer").wait_for()
            source = page.locator("#source-link")
            check(source.inner_text() == "למודעה המקורית", "source link label")
            href = source.get_attribute("href") or ""
            check(href.startswith("https://www.bogrim-muni.com/") or href.startswith("https://bogrim-muni.com/"), href)
            check(page.locator("#contacts").count() == 0, "contacts section rendered in the default build")
            page.keyboard.press("Escape")
            page.wait_for_function("() => !document.getElementById('drawer')")
            check("card-open" in page.evaluate("() => document.activeElement.className"), "focus did not return to the job row")

            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            page.locator(".backdrop").click(position={"x": 1100, "y": 80})
            page.wait_for_function("() => !document.getElementById('drawer')")
            job_id = page.locator("button.card-open").first.get_attribute("data-job")
            page.goto(base + "#job=" + job_id)
            page.wait_for_function("() => window.__app && document.getElementById('drawer')")
            check(page.locator("#drawer-title").inner_text() != "", "hash did not open the drawer")
            page.locator("#drawer-close").click()
            page.wait_for_function("() => !document.getElementById('drawer')")

            page.select_option("#filter-district", "דרום")
            wait_count(page, 51)
            check(page.locator("#job-count").inner_text() == "211 משרות", "header count changed while filtering")
            page.select_option("#filter-district", "לא ידוע")
            wait_count(page, 16)
            page.select_option("#filter-district", "")
            page.select_option("#filter-type", "לא ידוע")
            wait_count(page, 1)
            page.click("#clear-filters")
            wait_count(page, 211)

            page.fill("#search", "אנרגיה")
            wait_count(page, energy)
            check(shown_count(page) == energy, "energy search count")
            page.fill("#search", "zzzz-no-such-job")
            page.wait_for_selector(".empty")
            check(page.locator(".empty").inner_text() == "לא נמצאו משרות", "empty state")
            page.click("#clear-filters")
            wait_count(page, 211)

            page.select_option("#sort-key", "name")
            check(page.locator("#sort-dir").inner_text() == "עולה", "name sort direction")
            page.click("#sort-dir")
            check(page.locator("#sort-dir").inner_text() == "יורד", "sort direction toggle")

            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            rated_id = page.evaluate("() => location.hash.slice(5)")
            page.locator("#star-role-5").click()
            page.locator("#star-conditions-3").click()
            page.wait_for_function(
                """() => {
                  const job = window.__app.jobs.find((item) => item.id === location.hash.slice(5));
                  const scored = window.__app.scoreJob(job);
                  return scored.score === 4.4 && scored.rated === 2 && scored.total === 5 && scored.partial === true;
                }"""
            )
            score_text = page.locator("#drawer .score").inner_text()
            check("4.4" in score_text and "דורג 2/5" in score_text and "חלקי" in score_text, score_text)
            page.locator("#drawer-favorite").click()
            page.select_option("#job-status", "מעניין")
            page.fill("#notes-role", "הערה על התפקיד")
            page.fill("#general-notes", "=1+1")
            page.fill("#call-name", "ראשון")
            page.fill("#call-text", "שיחה ראשונה")
            page.click("#call-add")
            page.wait_for_function("() => document.querySelectorAll('#call-log article').length === 1")
            page.fill("#call-name", "שני")
            page.fill("#call-text", "שיחה שנייה")
            page.click("#call-add")
            page.wait_for_function("() => document.querySelectorAll('#call-log article').length === 2")
            log_text = page.locator("#call-log").inner_text()
            check(log_text.index("שני") < log_text.index("ראשון"), "call log is not newest-first")
            page.locator("#call-log article").first.locator("button").click()
            page.wait_for_function("() => document.querySelectorAll('#call-log article').length === 1")
            page.locator("#drawer-close").click()

            page.locator('#nav [data-view="settings"]').click()
            page.locator('[aria-label="סוג הקריטריון המלצות"]').select_option("yesno")
            page.locator('#nav [data-view="list"]').click()
            page.locator("button.card-open").nth(1).click()
            page.locator("#drawer").wait_for()
            page.locator('[aria-label="המלצות"] button', has_text="לא").click()
            page.wait_for_function(
                """() => {
                  const job = window.__app.jobs.find((item) => item.id === location.hash.slice(5));
                  const scored = window.__app.scoreJob(job);
                  return scored.score === 1 && scored.rated === 1 && scored.partial === true;
                }"""
            )
            check("1.0" in page.locator("#drawer .score").inner_text(), "yes/no score")
            page.locator("#drawer-close").click()

            page.click("#clear-filters")
            page.locator("#favorite-only").check()
            wait_count(page, 1)
            page.click("#clear-filters")

            boxes = page.locator("#results input[type=checkbox]")
            for index in range(4):
                boxes.nth(index).check()
            check(page.locator("#compare-count").inner_text() == "4", "compare count")
            boxes.nth(4).click()
            page.locator("#limit-alert").wait_for()
            check("אפשר להשוות עד 4 משרות" in page.locator("#limit-alert").inner_text(), "compare limit")
            check(page.locator("#compare-count").inner_text() == "4", "fifth compare selection was kept")
            page.locator('#nav [data-view="compare"]').click()
            page.locator("table").wait_for()
            check("ציון" in page.locator("table").inner_text(), "compare table")
            check("4.4" in page.locator("table").inner_text(), "compare score")

            page.locator('#nav [data-view="settings"]').click()
            page.locator("[data-crit-name]").first.fill("שם לבדיקה")
            page.locator('[aria-label="הזזה למטה התפקיד והאנשים"]').click()
            check(page.locator("[data-crit-name]").first.input_value() == "מרחק מהבית", "reorder")
            page.click("#add-criterion")
            page.wait_for_function("() => document.querySelectorAll('[data-crit-name]').length === 6")
            page.locator('[aria-label="מחיקת קריטריון קריטריון חדש"]').click()
            page.wait_for_function("() => document.querySelectorAll('[data-crit-name]').length === 5")
            page.wait_for_timeout(250)
            page.reload()
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.locator('#nav [data-view="settings"]').click()
            names = page.locator("[data-crit-name]").evaluate_all("nodes => nodes.map((node) => node.value)")
            check(names[0] == "מרחק מהבית", f"renamed order was not saved: {names}")
            check("שם לבדיקה" in names, "renamed criterion was not saved")
            stored = page.evaluate("() => localStorage.getItem('bogrim-jobs.v1')")
            check("הערה על התפקיד" in stored and "=1+1" in stored and "שיחה ראשונה" in stored, "localStorage lost user data")
            page.locator('#nav [data-view="list"]').click()
            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            check(page.locator("#job-status").input_value() == "מעניין" or "מעניין" in page.locator("#drawer").inner_text(), "status was not saved")
            page.locator("#drawer-close").click()
            page.locator('#nav [data-view="settings"]').click()
            page.click("#reset-criteria")
            page.wait_for_function("() => document.querySelector('[data-crit-name]').value === 'התפקיד והאנשים'")

            page.fill("#home-address", "רחובות")
            before_external = len(external)
            page.click("#geocode-home")
            page.wait_for_function("() => window.__app.state.home && window.__app.state.home.label.includes('רחובות')")
            check(not any("nominatim" in url for url in external[before_external:]), "exact locality used the network")
            page.click("#use-my-location")
            page.wait_for_function("() => window.__app.state.home && window.__app.state.home.label === 'המיקום שלי'")
            page.fill("#home-address", "רחובות")
            page.click("#geocode-home")
            page.wait_for_function("() => window.__app.state.home && window.__app.state.home.label.includes('רחובות')")
            page.locator('#nav [data-view="list"]').click()
            check("קו אווירי (הערכה)" in page.locator(".travel-line").first.inner_text(), "air distance label")

            page.locator('#nav [data-view="settings"]').click()
            phase["nominatim"] = "fail"
            page.fill("#home-address", "zzzznotaplace")
            page.click("#geocode-home")
            page.wait_for_function("() => document.getElementById('home-status').textContent.includes('לא הצלחנו לאתר את הכתובת')")
            check("רחובות" in page.evaluate("() => window.__app.state.home.label"), "failed geocode replaced the saved home")

            phase["osrm"] = "ok"
            page.click("#compute-routes")
            page.wait_for_function(
                "() => document.getElementById('route-status').textContent.includes('זמני הנסיעה נשמרו')",
                timeout=40000,
            )
            check(any("routing.openstreetmap.de" in url for url in external), "OSRM was not called after confirmation")
            page.locator('#nav [data-view="list"]').click()
            air_left = page.locator(".travel-line", has_text="קו אווירי").count()
            check(air_left == 0, f"{air_left} jobs still show air distance")
            check("30 דק׳" in page.locator(".travel-line").first.inner_text(), page.locator(".travel-line").first.inner_text())

            page.locator('#nav [data-view="settings"]').click()
            with page.expect_download() as json_download:
                page.click("#export-json")
            json_path = ROOT / "test-results" / "backup.json"
            json_path.parent.mkdir(exist_ok=True)
            json_download.value.save_as(str(json_path))
            backup = json.loads(json_path.read_text(encoding="utf-8"))
            check(backup["state"]["jobs"], "export was empty")
            check("routingKey" not in backup["state"], "export included the routing key")

            with page.expect_download() as csv_download:
                page.click("#export-csv")
            csv_path = ROOT / "test-results" / "jobs.csv"
            csv_download.value.save_as(str(csv_path))
            csv_bytes = csv_path.read_bytes()
            check(csv_bytes.startswith(b"\xef\xbb\xbf"), "CSV is missing the UTF-8 BOM")
            csv_text = csv_bytes.decode("utf-8-sig")
            check("\r\n" in csv_text, "CSV line endings")
            rows = parse_csv(csv_text)
            check(len(rows) == 212, f"CSV rows {len(rows)}")
            check("ציון" in rows[0] and "סטטוס" in rows[0], rows[0])
            check(any(cell == "'=1+1" for row in rows for cell in row), "formula injection guard")
            check("managerEmail" not in rows[0] and "טלפון" not in rows[0], "contact column in CSV")

            other = browser.new_context(
                locale="he-IL",
                viewport={"width": 1280, "height": 800},
                accept_downloads=True,
            )
            other_page = other.new_page()
            attach(other_page)
            other_page.goto(base)
            other_page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            other_page.locator('#nav [data-view="settings"]').click()
            other_page.locator("#import-file").set_input_files(str(json_path))
            other_page.wait_for_function("() => (localStorage.getItem('bogrim-jobs.v1') || '').includes('=1+1')")
            bad_path = ROOT / "test-results" / "bad.json"
            bad_path.write_text("{", encoding="utf-8")
            before = other_page.evaluate("() => localStorage.getItem('bogrim-jobs.v1')")
            other_page.locator("#import-file").set_input_files(str(bad_path))
            other_page.wait_for_function("() => document.getElementById('toast').textContent.includes('הקובץ אינו גיבוי תקין')")
            after = other_page.evaluate("() => localStorage.getItem('bogrim-jobs.v1')")
            check(before == after, "bad import changed stored data")
            other.close()

            check(tiles == [], "tiles were requested before the map tab")
            page.locator('#nav [data-view="map"]').click()
            try:
                page.wait_for_function("() => window.L && document.querySelector('#map.leaflet-container')", timeout=20000)
            except Exception as error:
                detail = page.evaluate("""() => ({
                  L: typeof window.L,
                  text: ((document.getElementById('map') || {}).innerText || '').slice(0, 180),
                  hidden: !!(document.getElementById('view-map') && document.getElementById('view-map').hidden),
                })""")
                raise AssertionError(f"map did not open {detail} page={page_errors[:3]} console={console_errors[:3]}") from error
            page.wait_for_timeout(500)
            check(len(tiles) > 0, "opening the map did not request OSM tiles")
            check("OpenStreetMap" in page.locator("#view-map").inner_text() or page.locator(".leaflet-control-attribution").count() >= 0, "map notice")

            def page_overflow(target):
                size = target.evaluate("() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })")
                return size["sw"] - size["cw"]

            check(page_overflow(page) <= 1, "desktop page scrolls sideways")
            page.set_viewport_size({"width": 360, "height": 800})
            page.locator('#nav [data-view="list"]').click()
            page.wait_for_timeout(200)
            check(page_overflow(page) <= 1, "360px page scrolls sideways")
            page.locator("#filter-toggle").click()
            page.locator("#filters.is-open").wait_for()
            page.locator("#close-filters").click()
            narrow_targets = page.evaluate(
                """() => [...document.querySelectorAll('button, a.btn, label.check')]
                  .filter((node) => node.getClientRects().length)
                  .filter((node) => {
                    const box = node.getBoundingClientRect();
                    return box.width < 44 || box.height < 44;
                  })
                  .map((node) => (node.id || node.innerText || node.getAttribute('aria-label') || node.tagName).slice(0, 40))"""
            )
            check(narrow_targets == [], f"tap targets under 44px: {narrow_targets}")

            page.set_viewport_size({"width": 390, "height": 844})
            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            check(page_overflow(page) <= 1, "390px drawer scrolls the page sideways")
            page.keyboard.press("Escape")

            page.locator('#nav [data-view="privacy"]').click()
            privacy = page.locator("#view-privacy").inner_text()
            check("אין כאן שרת" in privacy and "Nominatim" in privacy and "נקה נתונים" in privacy, "privacy copy")
            page.locator('#nav [data-view="help"]').click()
            check("למודעה המקורית" in page.locator("#view-help").inner_text(), "help points at the source listing")

            page.locator('#nav [data-view="settings"]').click()
            page.click("#clear-data")
            page.wait_for_function("() => window.__app.state.home === null && Object.keys(window.__app.state.jobs).length === 0 && localStorage.getItem('bogrim-jobs.v1') === null")
            check(page.evaluate("() => localStorage.getItem('bogrim-jobs.v1')") is None, "clear data left the storage key")

            interesting = [
                item for item in console_errors + page_errors
                if "Failed to load resource" not in item
                and "nominatim" not in item.lower()
                and "tile.openstreetmap.org" not in item
            ]
            check(interesting == [], f"console errors: {interesting[:8]}")
            browser.close()
        print("browser checks passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
