#!/usr/bin/env python3
"""Ratings survive a reload and a round-1 localStorage upgrade."""
import json

from playwright.sync_api import sync_playwright

from site_harness import chrome_path, serve

JOB = "1be2f98a-e5bb-4c50-9ac7-9fc025fb8dc7"
TRANSIT = "זמן תחבורה ציבורית שנשמר: 42 דק׳"
ROUND1 = {
    "version": 1,
    "scoreMode": "transit",
    "welcomeSeen": True,
    "criteria": [
        {"id": "role", "name": "התפקיד והאנשים", "type": "rating", "weight": 35},
        {"id": "distance", "name": "מרחק מהבית", "type": "travel", "weight": 25},
        {"id": "conditions", "name": "תנאים", "type": "rating", "weight": 15},
        {"id": "recommendations", "name": "המלצות", "type": "rating", "weight": 15},
        {"id": "peers", "name": "בוגרים אחרים", "type": "rating", "weight": 10},
    ],
    "jobs": {
        JOB: {
            "favorite": True,
            "status": "מעניין",
            "notes": "הערה ישנה",
            "ratings": {"role": 4, "conditions": 2},
            "criterionNotes": {},
            "callLog": [],
            "transitMinutes": 42,
        }
    },
}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def stored_job(page, job_id):
    return page.evaluate(
        """(id) => {
          const saved = JSON.parse(localStorage.getItem('bogrim-jobs.v1') || '{}');
          return saved.jobs && saved.jobs[id] ? saved.jobs[id] : null;
        }""",
        job_id,
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
            page = context.new_page()
            page.goto(origin + "?test=1")
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            job_id = page.evaluate("() => location.hash.slice(5)")
            page.locator("#star-role-5").click()
            page.locator("#star-conditions-3").click()
            page.reload()
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.goto(origin + "?test=1#job=" + job_id)
            page.locator("#drawer").wait_for()
            check(page.locator("#star-role-5").get_attribute("aria-checked") == "true", "role rating did not survive reload")
            check(page.locator("#star-conditions-3").get_attribute("aria-checked") == "true", "conditions rating did not survive reload")
            saved = stored_job(page, job_id)
            check(saved and saved["ratings"]["role"] == 5 and saved["ratings"]["conditions"] == 3, "localStorage lost the ratings")
            context.close()

            upgraded = browser.new_context(locale="he-IL")
            upgraded.add_init_script(
                """(() => {
                  if (sessionStorage.getItem('bogrim-test-seed')) return;
                  sessionStorage.setItem('bogrim-test-seed', '1');
                  localStorage.setItem('bogrim-jobs.v1', %s);
                })();""" % json.dumps(json.dumps(ROUND1, ensure_ascii=False))
            )
            page = upgraded.new_page()
            page.goto(origin + "?test=1#job=" + JOB)
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.locator("#drawer").wait_for()
            check(page.locator("#star-role-4").get_attribute("aria-checked") == "true", "round-1 role rating was dropped")
            check(page.locator("#star-conditions-2").get_attribute("aria-checked") == "true", "round-1 conditions rating was dropped")
            notes = page.evaluate("() => window.__app.state.jobs[%s].notes" % json.dumps(JOB))
            check("הערה ישנה" in notes and notes.count(TRANSIT) == 1, notes)
            page.reload()
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            page.goto(origin + "?test=1#job=" + JOB)
            page.locator("#drawer").wait_for()
            check(page.locator("#star-role-4").get_attribute("aria-checked") == "true", "round-1 rating lost on the second load")
            saved = stored_job(page, JOB)
            check(saved and saved["ratings"]["role"] == 4 and saved["ratings"]["conditions"] == 2, "round-1 ratings were not saved back")
            check(saved["notes"].count(TRANSIT) == 1, "transit note was duplicated")
            check("transitMinutes" not in saved, "transitMinutes was written back")
            upgraded.close()
            browser.close()
        print("rating persistence checks passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
