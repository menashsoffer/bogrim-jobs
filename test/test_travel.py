#!/usr/bin/env python3
"""Old bike, walk, and transit fields load from storage and from a JSON backup."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from site_harness import DIST, ROOT, chrome_path, serve

JOB_ID = "1be2f98a-e5bb-4c50-9ac7-9fc025fb8dc7"
TRANSIT_LINE = "זמן תחבורה ציבורית שנשמר: 55 דק׳"
CAR_NOTICE = "המיקום מחושב עכשיו לפי נסיעה ברכב בלבד"
HOME = {"label": "רחובות", "lat": 31.89277, "lon": 34.81127}
ROUTE_KEY = "31.89277,34.81127"
CRITERIA = [
    {"id": "role", "name": "התפקיד והאנשים", "type": "rating", "weight": 35},
    {"id": "distance", "name": "מרחק מהבית", "type": "travel", "weight": 25},
    {"id": "conditions", "name": "תנאים", "type": "rating", "weight": 15},
    {"id": "recommendations", "name": "המלצות", "type": "rating", "weight": 15},
    {"id": "peers", "name": "בוגרים אחרים", "type": "rating", "weight": 10},
]


def with_transit_note(notes):
    return f"{notes}\n{TRANSIT_LINE}" if notes else TRANSIT_LINE


def old_state(notes, rating, car_minutes, score_mode="transit"):
    return {
        "version": 1,
        "criteria": CRITERIA,
        "jobs": {
            JOB_ID: {
                "favorite": True,
                "status": "מעניין",
                "notes": notes,
                "ratings": {"role": rating},
                "criterionNotes": {},
                "callLog": [],
                "transitMinutes": 55,
            }
        },
        "home": HOME,
        "scoreMode": score_mode,
        "routes": {
            ROUTE_KEY: {
                "car": {"אבו גוש": {"min": car_minutes, "km": 42}},
                "bike": {"אבו גוש": {"min": 90, "km": 42}},
                "walk": {"אבו גוש": {"min": 400, "km": 40}},
            }
        },
        "compareIds": [],
    }


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def snapshot(page):
    return page.evaluate(
        """(id) => {
          const state = window.__app.state;
          const job = state.jobs[id] || {};
          const bucket = state.routes[Object.keys(state.routes)[0]] || {};
          const live = window.__app.jobs.find((item) => item.id === id);
          return {
            rating: job.ratings && job.ratings.role,
            notes: job.notes || '',
            favorite: Boolean(job.favorite),
            hasTransit: Object.prototype.hasOwnProperty.call(job, 'transitMinutes'),
            hasScoreMode: Object.prototype.hasOwnProperty.call(state, 'scoreMode'),
            modes: Object.keys(bucket),
            car: bucket.car && bucket.car['אבו גוש'] ? bucket.car['אבו גוש'].min : null,
            minutes: window.__app.travelMinutes(live),
          };
        }""",
        JOB_ID,
    )


def assert_migrated(page, notes, rating, car_minutes, label):
    got = snapshot(page)
    check(got["rating"] == rating and got["notes"] == with_transit_note(notes) and got["favorite"] is True, f"{label} dropped ratings: {got}")
    check(got["notes"].count(TRANSIT_LINE) == 1, f"{label} duplicated the transit note: {got['notes']}")
    check(got["hasTransit"] is False and got["hasScoreMode"] is False, f"{label} kept old fields: {got}")
    check(got["modes"] == ["car"] and got["car"] == car_minutes and got["minutes"] == car_minutes, f"{label} car time: {got}")


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    base = origin + "?test=1"
    backup_path = ROOT / "test-results" / "old-travel-backup.json"
    backup_path.parent.mkdir(exist_ok=True)
    backup_path.write_text(json.dumps({"app": "bogrim-jobs", "version": 1, "state": old_state("יובא", 2, 18)}), encoding="utf-8")
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = browser.new_context(locale="he-IL")
            stored = json.dumps(old_state("נשמר", 4, 30))
            context.add_init_script(f"localStorage.setItem('bogrim-jobs.v1', {json.dumps(stored)});")
            page = context.new_page()
            page.set_default_timeout(20000)
            page.on("dialog", lambda dialog: dialog.accept())
            page.goto(base)
            page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            assert_migrated(page, "נשמר", 4, 30, "localStorage")
            check(CAR_NOTICE in page.locator("#toast").inner_text(), "localStorage notice")
            idempotent = page.evaluate(
                """([raw, id, line]) => {
                  const count = (text) => String(text).split(line).length - 1;
                  const parsed = JSON.parse(raw);
                  const first = window.__app.sanitizeState(parsed);
                  const second = window.__app.sanitizeState(first);
                  const already = JSON.parse(raw);
                  already.jobs[id].notes = already.jobs[id].notes + '\\n' + line;
                  const kept = window.__app.sanitizeState(already);
                  const modeOnly = JSON.parse(raw);
                  delete modeOnly.jobs[id].transitMinutes;
                  modeOnly.scoreMode = 'transit';
                  const mode = window.__app.sanitizeState(modeOnly);
                  const storedRaw = localStorage.getItem('bogrim-jobs.v1') || '';
                  const stored = JSON.parse(storedRaw);
                  const replay = window.__app.sanitizeState(stored);
                  return {
                    once: count(first.jobs[id].notes),
                    same: second.jobs[id].notes === first.jobs[id].notes,
                    firstNotice: first.carOnlyNotice === true,
                    secondNotice: second.carOnlyNotice === true,
                    keptOnce: count(kept.jobs[id].notes),
                    modeNotes: mode.jobs[id].notes,
                    modeNotice: mode.carOnlyNotice === true,
                    storedHasTransit: Object.prototype.hasOwnProperty.call(stored.jobs[id], 'transitMinutes'),
                    storedMode: Object.prototype.hasOwnProperty.call(stored, 'scoreMode'),
                    storedNotice: storedRaw.includes('carOnlyNotice'),
                    replayOnce: count(replay.jobs[id].notes),
                    replayNotice: replay.carOnlyNotice === true,
                  };
                }""",
                [stored, JOB_ID, TRANSIT_LINE],
            )
            check(idempotent["once"] == 1 and idempotent["same"] is True, f"sanitize was not idempotent: {idempotent}")
            check(idempotent["firstNotice"] is True and idempotent["secondNotice"] is False, f"notice repeated: {idempotent}")
            check(idempotent["keptOnce"] == 1, f"existing transit note was duplicated: {idempotent}")
            check(idempotent["modeNotes"] == "נשמר" and idempotent["modeNotice"] is True, f"transit score mode: {idempotent}")
            check(idempotent["storedHasTransit"] is False and idempotent["storedMode"] is False, f"old fields were stored: {idempotent}")
            check(idempotent["storedNotice"] is False and idempotent["replayOnce"] == 1 and idempotent["replayNotice"] is False, f"saved state migrated again: {idempotent}")
            page.locator('#nav [data-view="settings"]').click()
            page.locator("#import-file").set_input_files(str(backup_path))
            page.wait_for_function(
                """() => (window.__app.state.jobs['1be2f98a-e5bb-4c50-9ac7-9fc025fb8dc7'].notes || '').includes('זמן תחבורה ציבורית שנשמר: 55 דק׳')"""
            )
            assert_migrated(page, "יובא", 2, 18, "import")
            imported = page.locator("#toast").inner_text()
            check("יובאו" in imported and CAR_NOTICE in imported, imported)
            page.locator("#import-file").set_input_files(str(backup_path))
            page.wait_for_function(
                """() => window.__app.state.jobs['1be2f98a-e5bb-4c50-9ac7-9fc025fb8dc7'].notes.split('זמן תחבורה ציבורית שנשמר: 55 דק׳').length === 2"""
            )
            assert_migrated(page, "יובא", 2, 18, "second import")
            browser.close()
    finally:
        server.shutdown()
        backup_path.unlink(missing_ok=True)
    print("travel migration checks passed")


if __name__ == "__main__":
    main()
