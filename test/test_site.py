#!/usr/bin/env python3
"""Browser checks for the default public build. No contact data is expected."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_hash import published_data  # noqa: E402
from site_harness import DIST, TINY_PNG, chrome_path, control_names_unique, search_count, serve, shown_count, stepped_scroll_stuck, wait_count
from site_late import check_home_export_and_layout


def main():
    data_file = Path(published_data(DIST))
    if not (DIST / "index.html").exists() or not data_file.is_file():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    catalog = json.loads(data_file.read_text(encoding="utf-8"))
    jobs = catalog["jobs"]
    energy = search_count(jobs, "אנרגיה")
    if energy <= 0 or energy >= 211:
        raise SystemExit(f"unexpected energy search count {energy}")

    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    base = origin + "?test=1"
    phase = {"nominatim": "abort", "osrm": "abort"}
    external = []
    tiles = []
    console_errors = []
    page_errors = []

    def handle_route(route):
        url = route.request.url
        if url.startswith(origin) or url.startswith("blob:") or url.startswith("data:"):
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
            for width, height in ((390, 844), (360, 780)):
                stuck = stepped_scroll_stuck(page, width, height)
                check(stuck is None, f"scroll snapped back at {width}x{height}: {stuck}")
            page.set_viewport_size({"width": 1280, "height": 800})
            page.evaluate("() => window.scrollTo(0, 0)")
            check(control_names_unique(page), "compare and favorite names are not unique")

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
            bundled = page.evaluate("(name) => fetch(name).then((response) => response.text())", data_file.name)
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
            for _ in range(3):
                page.goto(base + "#job=" + job_id)
                page.wait_for_function("() => window.__app && document.getElementById('drawer')")
                check(page.locator("#drawer-title").inner_text() != "", "hash did not open the drawer")
                page.locator("#drawer-close").click()
                page.wait_for_function("() => !document.getElementById('drawer')")

            page.select_option("#filter-district", "דרום")
            wait_count(page, 51)
            check(page.locator("#filter-toggle").inner_text() == "סינון (1)", "filter count")
            check(page.locator("#job-count").inner_text() == "211 משרות", "header count changed while filtering")
            page.select_option("#filter-district", "לא ידוע")
            wait_count(page, 16)
            page.select_option("#filter-district", "")
            page.select_option("#filter-type", "לא ידוע")
            wait_count(page, 1)
            check(page.locator("#result-count").inner_text() == "מוצגת משרה אחת", "singular result count")
            check(page.locator("#filters-done").inner_text() == "הצג משרה אחת", "singular apply label")
            page.click("#clear-filters")
            wait_count(page, 211)

            page.fill("#search", "אנרגיה")
            wait_count(page, energy)
            check(shown_count(page) == energy, "energy search count")
            page.fill("#search", "zzzz-no-such-job")
            page.wait_for_selector(".empty-title")
            check(page.locator(".empty-title").inner_text() == "לא נמצאו משרות", "empty state")
            check("אין משרה שעונה על כל המסננים יחד." in page.locator("#results").inner_text(), "empty hint")
            page.locator("#filter-min-score").evaluate(
                "node => { node.value = '1'; node.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            check("משרות ללא ציון מוסתרות" in page.locator("#results").inner_text(), "min score note")
            page.click("#empty-clear-filters")
            wait_count(page, 211)

            page.locator("#sort-open").click()
            page.evaluate("() => { const node = document.getElementById('sort-key'); node.value = 'name'; node.dispatchEvent(new Event('change', { bubbles: true })); }")
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
            check("4.4" in score_text and "2 מתוך 5 קריטריונים" in score_text and "חלקי" in score_text, score_text)
            check(page.locator("#drawer .score").get_attribute("aria-label") == "ממוצע משוקלל של הקריטריונים שדירגת, 1–5", "score label")
            check(page.locator("#drawer .score span", has_text="חלקי").get_attribute("title") == "חסרים דירוגים", "partial title")
            page.locator("#drawer-favorite").click()
            page.locator('#job-status [data-status="מעניין"]').click()
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

            boxes = page.locator("#results .cmp")
            for index in range(4):
                boxes.nth(index).click()
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
            check(page.locator('#job-status [aria-checked="true"]').inner_text() == "מעניין", "status was not saved")
            page.locator("#drawer-close").click()
            page.locator('#nav [data-view="settings"]').click()
            page.click("#reset-criteria")
            page.wait_for_function("() => document.querySelector('[data-crit-name]').value === 'התפקיד והאנשים'")

            check_home_export_and_layout(
                page, browser, base, phase, external, tiles, page_errors, console_errors, attach, check,
            )
            browser.close()
        print("browser checks passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
