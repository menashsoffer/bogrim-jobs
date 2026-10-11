#!/usr/bin/env python3
"""Behavior added for the round-2 UX list."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_harness import DIST, chrome_path, serve


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    base = origin + "?test=1"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            page = browser.new_page(locale="he-IL", viewport={"width": 390, "height": 844})
            page.set_default_timeout(20000)
            page.goto(base)
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            check(page.evaluate("() => location.hash.startsWith('#job=')"), "job hash was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('drawer')")
            check(page.url.startswith(origin), "back left the site from the drawer")

            page.locator('#nav [data-view="settings"]').click()
            page.locator("#home-address").wait_for()
            check("view=settings" in page.url, "settings view was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('view-list').hidden")
            check(page.url.startswith(origin), "back left the site from a tab")

            page.locator("#filter-toggle").click()
            page.locator("#filters.is-open").wait_for()
            check(page.evaluate("() => location.hash === '#filters'"), "filter sheet was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('filters').classList.contains('is-open')")
            check(page.url.startswith(origin), "back left the site from the filter sheet")
            browser.close()
    finally:
        server.shutdown()
    print("ux checks passed")


if __name__ == "__main__":
    main()
