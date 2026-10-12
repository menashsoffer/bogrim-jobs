#!/usr/bin/env python3
"""Weight steps stay proportional, and a lone new criterion is 100."""
import json

from playwright.sync_api import sync_playwright

from site_harness import chrome_path, serve

TRIPLE = [
    {"id": "a", "name": "אלף", "type": "rating", "weight": 50, "locked": False},
    {"id": "b", "name": "בית", "type": "rating", "weight": 30, "locked": False},
    {"id": "c", "name": "גימל", "type": "rating", "weight": 20, "locked": False},
]
DEFAULTS = [
    {"id": "role", "name": "התפקיד והאנשים", "type": "rating", "weight": 35},
    {"id": "distance", "name": "מרחק מהבית", "type": "travel", "weight": 25},
    {"id": "conditions", "name": "תנאים", "type": "rating", "weight": 15},
    {"id": "recommendations", "name": "המלצות", "type": "rating", "weight": 15},
    {"id": "peers", "name": "בוגרים אחרים", "type": "rating", "weight": 10},
]


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def slider_values(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('#criteria-editor input.weight-range')].map((node) => Number(node.value))"""
    )


def show_settings(page, criteria):
    # pagehide writes the in-memory state back, so the next document
    # copies this payload into localStorage before the app boots.
    page.evaluate(
        """(criteria) => {
          sessionStorage.setItem('bogrim-step-seed', JSON.stringify({
            version: 1, welcomeSeen: true, criteria, jobs: {},
          }));
        }""",
        criteria,
    )
    page.reload()
    page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
    page.locator('#nav [data-view="settings"]').click()
    page.locator("#weight-sum-value").wait_for()


def drag(page, selector, values):
    page.evaluate(
        """({ selector, values }) => {
          const input = document.querySelector(selector);
          input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          values.forEach((value) => {
            input.value = String(value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        }""",
        {"selector": selector, "values": values},
    )


def main():
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = browser.new_context(locale="he-IL")
            context.add_init_script(
                """(() => {
                  const raw = sessionStorage.getItem('bogrim-step-seed');
                  if (!raw) return;
                  localStorage.setItem('bogrim-jobs.v1', raw);
                })();"""
            )
            page = context.new_page()
            page.on("dialog", lambda dialog: dialog.accept())
            page.goto(origin + "?test=1")
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")

            show_settings(page, TRIPLE)
            page.locator("#weight-a").focus()
            for _ in range(10):
                page.keyboard.press("ArrowLeft")
            check(slider_values(page) == [40, 36, 24], slider_values(page))

            show_settings(page, TRIPLE)
            drag(page, "#weight-a", list(range(48, -1, -2)))
            check(slider_values(page) == [0, 60, 40], slider_values(page))

            show_settings(page, TRIPLE)
            drag(page, "#weight-a", list(range(51, 101)) + list(range(99, 49, -1)))
            check(slider_values(page) == [50, 30, 20], slider_values(page))

            show_settings(page, [
                {"id": "a", "name": "אלף", "type": "rating", "weight": 100},
                {"id": "b", "name": "בית", "type": "rating", "weight": 0},
                {"id": "c", "name": "גימל", "type": "rating", "weight": 0},
            ])
            drag(page, "#weight-a", [90])
            check(slider_values(page) == [90, 5, 5], slider_values(page))
            show_settings(page, [
                {"id": "a", "name": "אלף", "type": "rating", "weight": 100},
                {"id": "b", "name": "בית", "type": "rating", "weight": 0},
                {"id": "c", "name": "גימל", "type": "rating", "weight": 0},
            ])
            drag(page, "#weight-a", [99])
            check(slider_values(page) == [99, 1, 0], slider_values(page))

            show_settings(page, DEFAULTS)
            check(page.locator("#weight-role").get_attribute("dir") == "ltr", "weight slider is not ltr")
            page.locator("#weight-role").focus()
            page.keyboard.press("ArrowRight")
            check(slider_values(page) == [36, 24, 15, 15, 10], slider_values(page))
            matched = page.evaluate(
                """() => [...document.querySelectorAll('.weight-range')].every((node) => (
                  node.getAttribute('aria-valuemin') === node.min
                  && node.getAttribute('aria-valuemax') === node.max
                ))"""
            )
            check(matched, "aria min/max diverged from min/max")

            while page.locator("[aria-label^='מחיקת קריטריון']").count():
                page.locator("[aria-label^='מחיקת קריטריון']").first.click()
            page.click("#add-criterion")
            page.wait_for_function("() => document.querySelectorAll('.weight-range').length === 1")
            check(slider_values(page) == [100], slider_values(page))
            check(page.locator("#weight-sum-value").inner_text() == "100%", "a new lone criterion stayed at 0")

            show_settings(page, [
                {"id": "a", "name": "אלף", "type": "rating", "weight": 40, "locked": False},
                {"id": "b", "name": "בית", "type": "rating", "weight": 30, "locked": True},
                {"id": "c", "name": "גימל", "type": "rating", "weight": 30, "locked": True},
            ])
            page.locator("[aria-label='מחיקת קריטריון אלף']").click()
            check("משקל נעול עודכן" in page.locator("#toast").inner_text(), "locked delete had no notice")
            check(slider_values(page) == [50, 50], slider_values(page))

            show_settings(page, [
                {"id": "wide", "name": "שקיעות", "type": "rating", "weight": 200},
                {"id": "mid", "name": "קפה", "type": "rating", "weight": 100},
                {"id": "low", "name": "נוף", "type": "yesno", "weight": 100},
            ])
            check(slider_values(page) == [50, 25, 25], slider_values(page))
            check(page.locator("[data-crit-name='wide']").input_value() == "שקיעות", "scaled names were replaced")

            show_settings(page, [
                {"id": "custom-a", "name": "שקיעות", "type": "rating", "weight": 40},
                {"id": "custom-b", "name": "קפה", "type": "rating", "weight": "לא"},
                {"id": "custom-c", "name": "נוף", "type": "yesno", "weight": 60},
            ])
            check(slider_values(page) == [40, 0, 60], slider_values(page))
            names = page.locator("[data-crit-name]").evaluate_all("nodes => nodes.map((node) => node.value)")
            check(names == ["שקיעות", "קפה", "נוף"], names)
            repaired = page.evaluate(
                """() => {
                  const state = window.__app.sanitizeState({
                    criteria: [
                      { id: 'custom-a', name: 'שקיעות', type: 'rating', weight: 40 },
                      { id: 'custom-b', name: 'קפה', type: 'rating', weight: 'לא' },
                      { id: 'custom-c', name: 'נוף', type: 'yesno', weight: 60 },
                    ],
                    jobs: { job1: { ratings: { 'custom-a': 4 }, notes: 'גיבוי' } },
                  });
                  return {
                    weights: state.criteria.map((item) => item.weight),
                    names: state.criteria.map((item) => item.name),
                    rating: state.jobs.job1.ratings['custom-a'],
                  };
                }"""
            )
            check(repaired["weights"] == [40, 0, 60] and repaired["names"][1] == "קפה", repaired)
            check(repaired["rating"] == 4, "backup rating was dropped")
            browser.close()
        print("weight step checks passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
