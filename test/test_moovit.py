#!/usr/bin/env python3
"""Moovit web and app links, with and without a home address."""
from playwright.sync_api import sync_playwright

from site_harness import DIST, chrome_path, serve

HOME = {"label": "רחובות", "lat": 31.89, "lon": 34.81}
DEST = {"name": "אבו גוש", "lat": 31.80606, "lon": 35.11025}
WEB = (
    "https://moovitapp.com/?from=%D7%A8%D7%97%D7%95%D7%91%D7%95%D7%AA&fll=31.89_34.81"
    "&to=%D7%90%D7%91%D7%95%20%D7%92%D7%95%D7%A9&tll=31.80606_35.11025&lang=he&metroId=1"
)
BARE = "https://moovitapp.com/?to=%D7%90%D7%91%D7%95%20%D7%92%D7%95%D7%A9&tll=31.80606_35.11025&lang=he&metroId=1"
APP = (
    "moovit://directions?orig_lat=31.89&orig_lon=34.81&orig_name=%D7%A8%D7%97%D7%95%D7%91%D7%95%D7%AA"
    "&dest_lat=31.80606&dest_lon=35.11025&dest_name=%D7%90%D7%91%D7%95%20%D7%92%D7%95%D7%A9&auto_run=true"
)
APP_BARE = "moovit://directions?dest_lat=31.80606&dest_lon=35.11025&dest_name=%D7%90%D7%91%D7%95%20%D7%92%D7%95%D7%A9&auto_run=true"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            page = browser.new_page(locale="he-IL")
            page.goto(origin + "?test=1")
            page.wait_for_function("() => window.__app && window.__app.moovitWebUrl")
            got = page.evaluate(
                """([home, destination]) => ({
                  web: window.__app.moovitWebUrl(home, destination),
                  bare: window.__app.moovitWebUrl(null, destination),
                  app: window.__app.moovitAppUrl(home, destination),
                  appBare: window.__app.moovitAppUrl(null, destination),
                })""",
                [HOME, DEST],
            )
            check(got["web"] == WEB, got["web"])
            check(got["bare"] == BARE and "from=" not in got["bare"] and "fll=" not in got["bare"], got["bare"])
            check(got["app"] == APP, got["app"])
            check(got["appBare"] == APP_BARE and "orig_" not in got["appBare"], got["appBare"])
            page.evaluate(
                """([home]) => {
                  window.__app.state.home = home;
                  location.hash = '#job=1be2f98a-e5bb-4c50-9ac7-9fc025fb8dc7';
                }""",
                [HOME],
            )
            page.locator("#drawer").wait_for()
            link = page.locator("#travel-links a", has_text="Moovit")
            href = link.get_attribute("href")
            rel = link.get_attribute("rel") or ""
            check(href and href.startswith("https://moovitapp.com/?") and "fll=" in href and "lang=he" in href, href)
            check(link.get_attribute("target") == "_blank" and "noopener" in rel, rel)
            browser.close()
    finally:
        server.shutdown()
    print("moovit link checks passed")


if __name__ == "__main__":
    main()
