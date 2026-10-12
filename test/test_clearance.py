#!/usr/bin/env python3
"""The last job card and the drawer actions stay above the bottom nav."""
from playwright.sync_api import sync_playwright

from site_harness import DIST, chrome_path, serve


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def fully_above(page, selector, nav):
    page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
    box = page.locator(selector).last.bounding_box()
    bar = page.locator(nav).bounding_box()
    check(box is not None and bar is not None, f"missing box for {selector}")
    gap = bar["y"] - (box["y"] + box["height"])
    check(box["y"] >= 0 and gap >= 48, f"{selector} gap is {gap:.0f}px")
    page.locator(selector).last.click(trial=True)


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
            for width, height in ((390, 844), (360, 780)):
                page = browser.new_page(locale="he-IL", viewport={"width": width, "height": height})
                page.set_default_timeout(20000)
                page.goto(origin)
                page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
                page.locator("#welcome-start").click()
                fully_above(page, "article.card", ".nav-tabs")
                page.locator("article.card").last.locator("button.fav").click(trial=True)
                page.locator("button.card-open").first.click()
                page.locator("#drawer").wait_for()
                page.wait_for_function(
                    """(height) => ['#drawer-close', '#drawer-favorite', '#drawer-compare'].every((id) => {
                      const box = document.querySelector(id).getBoundingClientRect();
                      return box.height > 0 && box.y >= 0 && box.bottom <= height + 0.5;
                    })""",
                    arg=height,
                )
                for action in ("#drawer-close", "#drawer-favorite", "#drawer-compare"):
                    box = page.locator(action).bounding_box()
                    check(box["y"] >= 0 and box["y"] + box["height"] <= height, f"{action} outside the viewport at {width}")
                    page.locator(action).click(trial=True)
                page.close()
            browser.close()
    finally:
        server.shutdown()
    print("clearance checks passed")


if __name__ == "__main__":
    main()
