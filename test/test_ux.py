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

            page.evaluate("() => document.querySelectorAll('button.card-open')[12].scrollIntoView({ block: 'center' })")
            page.locator("button.card-open").nth(12).click()
            page.locator("#drawer").wait_for()
            before = page.evaluate("() => window.scrollY")
            page.locator("#star-role-5").click()
            page.locator("#drawer-close").click()
            page.wait_for_function("() => !document.getElementById('drawer')")
            kept = page.evaluate("() => window.scrollY")
            check(before > 400 and abs(kept - before) < 48, f"scroll {before} became {kept}")

            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            check("הגדירו כתובת בית לציון אוטומטי" in page.locator("#drawer").inner_text(), "travel criterion lacks a home step")
            page.locator("#drawer-close").click()
            page.wait_for_function("() => !document.getElementById('drawer')")
            page.locator("#home-hint").click()
            page.locator("#home-address").wait_for()
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'home-address'"), "home address was not focused")

            context = browser.new_context(locale="he-IL", viewport={"width": 390, "height": 844})
            first = context.new_page()
            second = context.new_page()
            first.set_default_timeout(20000)
            second.set_default_timeout(20000)
            first.goto(base)
            second.goto(base)
            first.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            second.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            remote_id = second.evaluate(
                """() => {
                  const id = window.__app.jobs[0].id;
                  const state = JSON.parse(JSON.stringify(window.__app.state));
                  state.jobs[id] = {
                    favorite: false, status: 'לא נבדק', notes: '',
                    ratings: { role: 5 }, criterionNotes: {}, callLog: [],
                  };
                  localStorage.setItem('bogrim-jobs.v1', JSON.stringify(state));
                  return id;
                }"""
            )
            first.wait_for_function(
                "(id) => window.__app.state.jobs[id] && window.__app.state.jobs[id].ratings.role === 5",
                arg=remote_id,
            )
            other_id = first.evaluate("() => window.__app.jobs[1].id")
            first.evaluate(
                """(id) => {
                  const state = JSON.parse(localStorage.getItem('bogrim-jobs.v1'));
                  state.jobs[id] = {
                    favorite: false, status: 'לא נבדק', notes: '',
                    ratings: { conditions: 3 }, criterionNotes: {}, callLog: [],
                  };
                  localStorage.setItem('bogrim-jobs.v1', JSON.stringify(state));
                }""",
                other_id,
            )
            first.locator("button.card-open").nth(2).click()
            first.locator("#star-role-5").click()
            first.wait_for_function(
                """(ids) => {
                  const raw = localStorage.getItem('bogrim-jobs.v1');
                  if (!raw) return false;
                  const jobs = JSON.parse(raw).jobs;
                  const third = Object.entries(jobs).some(([id, job]) => (
                    id !== ids.remote && id !== ids.other && job.ratings && job.ratings.role === 5
                  ));
                  return third
                    && jobs[ids.remote] && jobs[ids.remote].ratings.role === 5
                    && jobs[ids.other] && jobs[ids.other].ratings.conditions === 3;
                }""",
                arg={"remote": remote_id, "other": other_id},
            )
            context.close()
            browser.close()
    finally:
        server.shutdown()
    print("ux checks passed")


if __name__ == "__main__":
    main()
