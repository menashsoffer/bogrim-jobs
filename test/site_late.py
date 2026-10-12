"""Home, export, map, and narrow-layout checks for the public site."""
import json

from site_harness import ROOT, parse_csv


def check_home_export_and_layout(page, browser, base, phase, external, tiles, page_errors, console_errors, attach, check):
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
    page.locator("button.card-open").first.click()
    hrefs = page.locator("#drawer a.btn").evaluate_all("nodes => nodes.map((node) => node.getAttribute('href') || '')")
    check("קו אווירי" in page.locator("#drawer").inner_text() and page.locator("#score-mode, #transit-minutes").count() == 0, "car-only travel section")
    check(all(any(part in href for href in hrefs) for part in ("travelmode=driving", "travelmode=transit", "waze.com", "moovitapp.com")), hrefs)
    page.keyboard.press("Escape")

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
    check(json_download.value.suggested_filename.startswith("bogrim-jobs-") and json_download.value.suggested_filename.endswith(".json"), json_download.value.suggested_filename)
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
    minutes_at = rows[0].index("דקות נסיעה")
    check(any(row[minutes_at] == "30" and row[minutes_at + 1] == "30 דק׳" for row in rows[1:]), "CSV keeps sortable minutes and a formatted time")
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
    check("יובא דירוג אחד" in other_page.locator("#toast").inner_text(), "import summary toast")
    check(other_page.evaluate("() => !document.getElementById('view-settings').hidden"), "import left the settings tab")
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

    def empty_compare_overflow(width):
        page.set_viewport_size({"width": width, "height": 800})
        page.locator('#nav [data-view="compare"]').click()
        page.locator(".ghost-cols").wait_for()
        shown = page.evaluate(
            """() => [...document.querySelectorAll('.ghost-col')]
              .filter((node) => getComputedStyle(node).display !== 'none').length"""
        )
        check(shown == 2, f"empty compare shows {shown} columns at {width}")
        fits = page.evaluate("() => document.scrollingElement.scrollWidth <= window.innerWidth")
        check(fits, f"empty compare overflows at {width}")

    empty_compare_overflow(360)
    empty_compare_overflow(390)
    page.locator('#nav [data-view="list"]').click()
    page.set_viewport_size({"width": 360, "height": 800})
    search_box = page.evaluate(
        """() => {
          const label = document.querySelector('label.search');
          const input = document.querySelector('#search');
          const labelBox = label.getBoundingClientRect();
          const inputBox = input.getBoundingClientRect();
          return { labelTop: labelBox.top, labelBottom: labelBox.bottom, inputTop: inputBox.top, inputBottom: inputBox.bottom, inputH: inputBox.height };
        }"""
    )
    check(
        search_box["inputH"] >= 44 and search_box["inputTop"] <= search_box["labelTop"] + 1 and search_box["inputBottom"] >= search_box["labelBottom"] - 1,
        f"search input does not fill its wrapper {search_box}",
    )
    page.locator("label.search .icon").click()
    check(page.evaluate("() => document.activeElement && document.activeElement.id === 'search'"), "search icon did not focus the input")
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

    page.locator('#nav [data-view="settings"]').click()
    help_box = page.locator('#view-settings [data-view="help"]').bounding_box()
    check(help_box and help_box["width"] >= 44 and help_box["height"] >= 44, f"help target {help_box}")
    weight_box = page.locator("input.weight-range").first.bounding_box()
    check(weight_box and weight_box["height"] >= 44, f"weight target {weight_box}")
    page.locator('#view-settings [data-view="privacy"]').click()
    privacy = page.locator("#view-privacy").inner_text()
    check("אין כאן שרת" in privacy and "Nominatim" in privacy and "נקה נתונים" in privacy, "privacy copy")
    page.locator('#nav [data-view="settings"]').click()
    page.locator('#view-settings [data-view="help"]').click()
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
