#!/usr/bin/env python3
"""Stepped travel and score filters."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_harness import DIST, chrome_path, serve


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def shown(page):
    text = page.locator("#result-count").inner_text()
    number = ""
    for char in text:
        if char.isdigit():
            number += char
        elif number:
            break
    return int(number)


def edge(page, selector, at_end):
    box = page.locator(selector).bounding_box()
    x = box["width"] - 2 if at_end else 2
    page.locator(selector).click(position={"x": x, "y": box["height"] / 2})
    return page.locator(selector).get_attribute("aria-valuetext")


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
            stops = page.evaluate(
                """() => ({
                  time47: window.__app.timeStops(47),
                  time72: window.__app.timeStops(72),
                  time60: window.__app.timeStops(60),
                  km53: window.__app.distanceStops(53),
                  km50: window.__app.distanceStops(50),
                  score: window.__app.scoreStops(),
                  label: window.__app.timeText(75),
                })"""
            )
            check(stops["time47"][-2] == 60 and stops["time47"][-1] is None, stops["time47"])
            check(55 in stops["time47"] and 65 not in stops["time47"] and 75 not in stops["time47"], stops["time47"])
            check(stops["time72"][-2] == 75 and 70 not in stops["time72"], stops["time72"])
            check(60 in stops["time60"] and 75 not in stops["time60"], stops["time60"])
            check(stops["km53"][-2] == 60 and 55 not in stops["km53"] and 50 in stops["km53"], stops["km53"])
            check(50 in stops["km50"] and 60 not in stops["km50"], stops["km50"])
            check(stops["score"][0] is None and stops["score"][-1] == 5 and 3.5 in stops["score"], stops["score"])
            check(stops["label"] == "עד שעה ו-15 דק׳", stops["label"])

            check(page.locator("#filter-max-min").is_disabled(), "time slider enabled without a home")
            check(page.locator("#filter-max-km").is_disabled(), "distance slider enabled without a home")
            check(page.locator("#filter-max-min-hint").inner_text() == "הזינו כתובת בית כדי לסנן לפי זמן נסיעה", "time hint")
            check(page.locator("#filter-max-min").get_attribute("aria-valuetext") == "ללא הגבלה", "time default")
            check(page.locator("#filter-max-km").get_attribute("aria-valuetext") == "ללא הגבלה", "distance default")
            check(page.locator("#filter-min-score").get_attribute("aria-valuetext") == "הכול", "score default")
            check(page.evaluate("() => document.getElementById('filter-max-min').value === document.getElementById('filter-max-min').max"), "unlimited is not the max index")
            check(page.evaluate("() => document.getElementById('filter-min-score').value === document.getElementById('filter-min-score').min"), "הכול is not the min index")
            check(page.evaluate("() => getComputedStyle(document.getElementById('filter-max-min')).direction === 'ltr'"), "slider direction")

            page.evaluate(
                """() => {
                  window.__app.state.home = { label: 'בדיקה', lat: 32.08, lon: 34.78 };
                  window.__app.state.routes['32.08000,34.78000'] = { car: { sample: { min: 47, km: 53 } } };
                }"""
            )
            page.evaluate("() => { const node = document.getElementById('sort-key'); node.value = 'name'; node.dispatchEvent(new Event('change', { bubbles: true })); }")
            check(not page.locator("#filter-max-min").is_disabled(), "time slider stayed disabled")
            check(page.locator("#filter-max-min-hint").is_hidden(), "time hint stayed visible")
            check(page.evaluate(
                """() => Number(document.getElementById('filter-max-min').max) === window.__app.timeStops(47).length - 1
                  && Number(document.getElementById('filter-max-km').max) === window.__app.distanceStops(53).length - 1"""
            ), "dynamic max")

            for width, height in ((1280, 800), (390, 844)):
                page.set_viewport_size({"width": width, "height": height})
                if width < 960:
                    page.locator("#filter-toggle").click()
                    page.locator("#filters.is-open").wait_for()
                check(edge(page, "#filter-max-min", True) == "ללא הגבלה", f"right end at {width}")
                check(edge(page, "#filter-max-min", False) == "עד 5 דק׳", f"left end at {width}")
                page.locator("#filter-max-min").focus()
                page.keyboard.press("ArrowRight")
                check(page.locator("#filter-max-min").get_attribute("aria-valuetext") == "עד 10 דק׳", f"ArrowRight at {width}")
                page.keyboard.press("ArrowLeft")
                check(page.locator("#filter-max-min").get_attribute("aria-valuetext") == "עד 5 דק׳", f"ArrowLeft at {width}")
                check(edge(page, "#filter-min-score", False) == "הכול", f"score left at {width}")
                check(edge(page, "#filter-min-score", True) == "ציון מ-5.0 ומעלה", f"score right at {width}")
                if width < 960:
                    page.locator("#filters-done").click()

            page.set_viewport_size({"width": 1280, "height": 800})
            page.locator("#filter-max-min").evaluate(
                "node => { node.value = node.max; node.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            page.locator("#filter-max-km").evaluate(
                "node => { node.value = node.max; node.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            page.locator("#filter-min-score").evaluate(
                "node => { node.value = '1'; node.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            page.wait_for_function("() => document.getElementById('result-count').textContent.includes('0')")
            check(shown(page) == 0, "unrated jobs stayed visible")
            check("משרות ללא ציון מוסתרות" in page.locator("#results").inner_text(), "unrated hint")
            page.locator("#include-unrated").check()
            page.wait_for_function("() => document.getElementById('result-count').textContent.includes('211')")
            check(shown(page) == 211, "unrated toggle")

            migrated = browser.new_page(locale="he-IL", viewport={"width": 1280, "height": 800})
            migrated.add_init_script(
                """localStorage.setItem('bogrim-jobs.v1', %s)"""
                % json.dumps(json.dumps({
                    "version": 1,
                    "home": {"label": "בדיקה", "lat": 32.08, "lon": 34.78},
                    "filters": {"maxMinutes": "32", "maxKm": "48", "minScore": "4"},
                    "routes": {"32.08000,34.78000": {"car": {"sample": {"min": 47, "km": 53}}}},
                }))
            )
            migrated.goto(origin)
            migrated.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            check(migrated.evaluate("() => window.__app.state.filters.maxMinutes === 50"), "minutes migration")
            check(migrated.evaluate("() => window.__app.state.filters.maxKm === 50"), "distance migration")
            check(migrated.evaluate("() => window.__app.state.filters.minScore === 4"), "score migration")
            check(migrated.locator("#filter-max-min").get_attribute("aria-valuetext") == "עד 50 דק׳", "migrated time label")
            check(migrated.locator("#filter-min-score").get_attribute("aria-valuetext") == "ציון מ-4.0 ומעלה", "migrated score label")
            minutes = migrated.evaluate(
                """() => {
                  const snap = (filters, routes) => window.__app.sanitizeState({ filters, routes }).filters.maxMinutes;
                  const car = (mins) => ({ car: Object.fromEntries(mins.map((min, index) => ['a' + index, { min, km: 10 }])) });
                  return {
                    fits: snap({ maxMinutes: '32' }, { '1,1': car([20, 47]) }),
                    onlyFar: snap({ maxMinutes: '32' }, { '1,1': car([47]) }),
                    none: snap({ maxMinutes: '37' }, {}),
                    under: snap({ maxMinutes: '37' }, { '1,1': car([30]) }),
                    above: snap({ maxMinutes: '37' }, { '1,1': car([45]) }),
                  };
                }"""
            )
            check(minutes["fits"] == 35, f"a fitting route stayed {minutes['fits']}")
            check(minutes["onlyFar"] == 50, f"sparse route widened {minutes['onlyFar']}")
            check(minutes["none"] == "", f"no routes stayed capped {minutes['none']!r}")
            check(minutes["under"] == 40, f"shorter route stayed {minutes['under']}")
            check(minutes["above"] == 45, f"next stop was {minutes['above']}")
            browser.close()
    finally:
        server.shutdown()
    print("filter checks passed")


if __name__ == "__main__":
    main()
