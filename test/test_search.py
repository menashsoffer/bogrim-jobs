#!/usr/bin/env python3
"""The search box ignores quotes and word order, and matches a word as it is typed."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_harness import DIST, chrome_path, serve


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def count_for(page, query):
    page.locator("#search").fill(query)
    page.wait_for_function(
        "(q) => window.__app.state.filters.q === q.trim()", arg=query
    )
    return int(page.evaluate("() => window.__app.jobs.filter((job) => window.__app.matches(job)).length"))


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/?test=1"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            page = browser.new_page(locale="he-IL", viewport={"width": 1280, "height": 800})
            page.set_default_timeout(20000)
            page.goto(origin)
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")

            quoted = count_for(page, 'מנכ"ל')
            check(quoted > 0, "no job mentions מנכ\"ל")
            check(count_for(page, "מנכל") == quoted, "מנכל differs from מנכ\"ל")
            check(count_for(page, "מנכ״ל") == quoted, "gershayim differ from a plain quote")

            ordered = count_for(page, "פרויקטים הנדסיים")
            check(ordered > 0, "no job has פרויקטים הנדסיים")
            check(count_for(page, "הנדסיים פרויקטים") == ordered, "word order changes the result")
            check(count_for(page, "פרויקט הנדס") >= ordered, "half-typed words lose jobs")

            check(count_for(page, "קקקקק") == 0, "nonsense matched a job")
            page.locator("#result-count").wait_for()
            check(count_for(page, " - ") == 211, "a query with no letters hid jobs")
            check(count_for(page, "") == 211, "clearing the box did not restore the list")
            browser.close()
    finally:
        server.shutdown()
    print("search checks passed")


if __name__ == "__main__":
    main()
