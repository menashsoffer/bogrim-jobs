#!/usr/bin/env python3
"""Importance weights stay at 100, lock, persist, and feed the score."""
import json
import os

from playwright.sync_api import sync_playwright

from site_harness import chrome_path, serve

SHOTS = "/opt/cursor/artifacts/screenshots"
SEEDED = {
    "version": 1,
    "welcomeSeen": True,
    "criteria": [
        {"id": "a", "name": "אלף", "type": "rating", "weight": 50, "locked": False},
        {"id": "b", "name": "בית", "type": "rating", "weight": 30, "locked": False},
        {"id": "c", "name": "גימל", "type": "rating", "weight": 20, "locked": False},
    ],
    "jobs": {},
}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def slider_values(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('#criteria-editor input.weight-range')].map((node) => Number(node.value))"""
    )


def open_settings(page):
    page.locator('#nav [data-view="settings"]').click()
    page.locator("#weight-sum-value").wait_for()


def scroll_weights(page):
    page.evaluate(
        """() => {
          const node = document.querySelector('.settings-criteria');
          const bar = document.querySelector('.topbar');
          const offset = bar ? bar.getBoundingClientRect().height + 8 : 0;
          const top = node.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo(0, Math.max(0, top));
        }"""
    )


def main():
    os.makedirs(SHOTS, exist_ok=True)
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = browser.new_context(locale="he-IL", viewport={"width": 412, "height": 915})
            context.add_init_script(
                """(() => {
                  if (sessionStorage.getItem('bogrim-test-seed')) return;
                  sessionStorage.setItem('bogrim-test-seed', '1');
                  localStorage.setItem('bogrim-jobs.v1', %s);
                })();""" % json.dumps(json.dumps(SEEDED, ensure_ascii=False))
            )
            page = context.new_page()
            page.on("dialog", lambda dialog: dialog.accept())
            page.goto(origin + "?test=1")
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            open_settings(page)
            check(page.locator("#weight-sum-value").inner_text() == "100%", "sum is not 100%")
            check(page.locator("#weight-sum-live").get_attribute("aria-live") == "polite", "sum is not announced")
            check(page.locator("label[for='weight-a']").inner_text() == "משקל אלף", "slider label")
            check(page.locator("#weight-a").get_attribute("aria-valuetext") == "50%", "valuetext")
            page.locator("#weight-a").fill("40")
            check(slider_values(page) == [40, 36, 24], slider_values(page))
            check("100%" in page.locator("#weight-sum-live").inner_text(), "live sum")
            check(page.locator("#weight-b").get_attribute("aria-valuetext") == "36%", "redistributed valuetext")

            page.locator('#nav [data-view="list"]').click()
            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            page.locator("#star-a-5").click()
            page.locator("#star-b-1").click()
            page.wait_for_function("() => (document.querySelector('#drawer .score') || {}).textContent.includes('3.1')")
            check("3.1" in page.locator("#drawer .score").inner_text(), "score ignored the weights")
            page.locator("#drawer-close").click()
            open_settings(page)

            page.locator('[aria-label="נעילת משקל בית"]').click()
            check(page.locator('[aria-label="נעילת משקל בית"]').get_attribute("aria-pressed") == "true", "lock did not press")
            page.locator("#weight-a").fill("30")
            check(slider_values(page) == [30, 36, 34], slider_values(page))
            page.reload()
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            open_settings(page)
            check(slider_values(page) == [30, 36, 34], "weights did not persist")
            check(page.locator('[aria-label="נעילת משקל בית"]').get_attribute("aria-pressed") == "true", "lock did not persist")
            stored = page.evaluate("() => localStorage.getItem('bogrim-jobs.v1')")
            check('"locked":true' in stored, "lock was not stored")

            page.locator('[aria-label="נעילת משקל גימל"]').click()
            check(page.locator("#weight-a").is_disabled(), "slider stayed enabled when every other weight is locked")
            page.locator("#reset-criteria").click()
            page.wait_for_function("() => document.querySelector('[data-crit-name]').value === 'התפקיד והאנשים'")
            check(slider_values(page) == [35, 25, 15, 15, 10], slider_values(page))
            check(page.locator("#weight-sum-value").inner_text() == "100%", "reset sum")
            check(page.locator(".ce-lock[aria-pressed='true']").count() == 0, "reset left a lock on")

            page.locator("#weight-role").focus()
            before = slider_values(page)[0]
            page.keyboard.press("ArrowUp")
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'weight-role'"), "slider lost focus")
            check(slider_values(page)[0] != before and sum(slider_values(page)) == 100, slider_values(page))
            page.keyboard.press("Shift+Tab")
            page.keyboard.press("Shift+Tab")
            check(
                page.evaluate("() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'נעילת משקל התפקיד והאנשים'"),
                "keyboard did not reach the lock",
            )
            shadow = page.evaluate("() => getComputedStyle(document.activeElement).boxShadow")
            check(shadow and shadow != "none", shadow)
            page.keyboard.press("Enter")
            check(page.locator('[aria-label="נעילת משקל התפקיד והאנשים"]').get_attribute("aria-pressed") == "true", "Enter did not lock")
            page.set_viewport_size({"width": 412, "height": 915})
            open_settings(page)
            lock_box = page.locator(".ce-lock").first.bounding_box()
            slider_box = page.locator("#weight-role").bounding_box()
            check(lock_box and lock_box["width"] >= 44 and lock_box["height"] >= 44, lock_box)
            check(slider_box and slider_box["height"] >= 44, slider_box)
            overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(overflow <= 1, f"weights overflow {overflow}px")

            page.locator('[aria-label="נעילת משקל מרחק מהבית"]').click()
            page.evaluate("() => document.getElementById('toast').classList.remove('is-on')")
            scroll_weights(page)
            page.screenshot(path=os.path.join(SHOTS, "weights-412x915.png"))
            page.set_viewport_size({"width": 1280, "height": 900})
            scroll_weights(page)
            page.screenshot(path=os.path.join(SHOTS, "weights-1280.png"))
            browser.close()
        print("weight ui checks passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
