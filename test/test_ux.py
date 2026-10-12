#!/usr/bin/env python3
"""Behavior added for the round-2 UX list."""
import json
import os
import re
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
    html = (DIST / "index.html").read_text(encoding="utf-8")
    check(re.search(r'rel="preload" href="fonts/heebo-hebrew-wght-normal\.[0-9a-f]{8}\.woff2" as="font"', html), "hebrew font is not preloaded")
    check(re.search(r'rel="preload" href="img/hero-relief-m\.[0-9a-f]{8}\.webp" as="image"', html), "hero image is not preloaded")
    check('rel="preload" href="data.json"' not in html, "data.json preload competes with the hero")
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
            if os.environ.get("UX_CPU"):
                page.context.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": float(os.environ["UX_CPU"])})
            page.goto(base)
            page.wait_for_function("() => window.__app && document.querySelectorAll('button.card-open').length === 211")
            back_top = page.evaluate("() => window.__app.centerCard(8)")
            page.evaluate("() => document.querySelectorAll('button.card-open')[8].click()")
            page.locator("#drawer").wait_for()
            check(page.evaluate("() => document.body.classList.contains('drawer-open')"), "page scroll was not locked")
            check(page.evaluate("() => getComputedStyle(document.querySelector('.drawer-body')).overscrollBehavior === 'contain'"), "drawer overscroll")
            check(page.evaluate("() => location.hash.startsWith('#job=')"), "job hash was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('drawer')")
            back_drift = page.evaluate("(top) => window.__app.cardDrift(8, top)", back_top)
            check(back_drift <= 1, f"back moved the list by {back_drift}px")
            check(page.url.startswith(origin), "back left the site from the drawer")

            page.locator('#nav [data-view="settings"]').click()
            page.locator("#home-address").wait_for()
            check("view=settings" in page.url, "settings view was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('view-list').hidden")
            check(page.url.startswith(origin), "back left the site from a tab")

            page.locator("#filter-toggle").click()
            page.locator("#filters.is-open").wait_for()
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'filters-title'"), "filter sheet focused the search")
            check(page.locator("#filters-done").inner_text() == "הצג 211 משרות", "filter apply count")
            check(page.evaluate("() => location.hash === '#filters'"), "filter sheet was not pushed")
            page.go_back()
            page.wait_for_function("() => !document.getElementById('filters').classList.contains('is-open')")
            check(page.url.startswith(origin), "back left the site from the filter sheet")
            page.evaluate("() => { const node = document.getElementById('sort-key'); node.value = 'distance'; node.dispatchEvent(new Event('change', { bubbles: true })); }")
            page.locator("#toast.is-on").wait_for()
            check("כדי למיין לפי מרחק צריך כתובת בית" in page.locator("#toast").inner_text(), "distance sort toast")
            check(page.evaluate("() => document.getElementById('sort-key').value") == "score", "distance sort changed without a home")
            page.evaluate("() => { const node = document.getElementById('sort-key'); node.value = 'time'; node.dispatchEvent(new Event('change', { bubbles: true })); }")
            check("כדי למיין לפי זמן נסיעה צריך כתובת בית" in page.locator("#toast").inner_text(), "time sort toast")
            page.locator("#toast .btn").click()
            page.locator("#home-address").wait_for()
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'home-address'"), "sort toast did not open the home address")
            page.locator('#nav [data-view="list"]').click()

            parked = page.evaluate("() => document.querySelectorAll('button.card-open')[12].dataset.job")
            for index in range(10):
                before = page.evaluate("(id) => window.__app.parkAndOpen(id)", parked)
                page.locator("#drawer").wait_for()
                if index == 0:
                    page.locator("#star-role-5").click()
                page.locator("#drawer-close").click()
                page.wait_for_function("() => !document.getElementById('drawer')")
                if index == 0:
                    check("הצגה" in page.locator("#toast").inner_text(), "place toast has no show action")
                after = page.evaluate(
                    "(before) => window.__app.restoredAnchor(before.id, before.index)",
                    {"id": parked, "index": before["index"]},
                )
                # Stable layout should land within 1px. 2px is the review ceiling.
                check(
                    after["anchorTop"] is not None and abs(after["anchorTop"] - before["top"]) <= 1,
                    f"anchor top {before['top']} became {after['anchorTop']} on pass {index}",
                )
                if index == 0:
                    check(after["cardIndex"] == 0, f"rated job stayed at {after['cardIndex']}")
                    jumped = abs(after["scrollY"] - before["scrollY"])
                    check(jumped < 800, f"close jumped {jumped}px to follow the resorted card")
                    page.locator("#toast .btn", has_text="הצגה").click()
                    focused = page.evaluate(
                        "(id) => document.activeElement && document.activeElement.dataset.job === id",
                        parked,
                    )
                    check(focused, "show action left focus on the page")

            prod = browser.new_page(locale="he-IL", viewport={"width": 390, "height": 844})
            prod.add_init_script(
                """(() => {
                  localStorage.setItem('bogrim-jobs.v1', JSON.stringify({ welcomeSeen: true, jobs: {}, criteria: [] }));
                  window.__chunks = [];
                  const watch = () => {
                    const host = document.getElementById('results');
                    if (!host) { requestAnimationFrame(watch); return; }
                    const note = () => window.__chunks.push(host.querySelectorAll('button.card-open').length);
                    new MutationObserver(note).observe(host, { childList: true });
                  };
                  watch();
                })();"""
            )
            prod.goto(origin)
            prod.wait_for_function("() => window.__chunks && window.__chunks.includes(211)")
            chunks = prod.evaluate("() => window.__chunks")
            check(any(0 < count < 211 for count in chunks), f"production list was not batched: {chunks[:6]}")
            early = prod.evaluate("() => { window.scrollTo(0, 900); const cards = [...document.querySelectorAll('button.card-open')]; const card = cards.find((node) => { const top = node.getBoundingClientRect().top; return top > 80 && top < 500; }); const index = cards.indexOf(card); const top = card.getBoundingClientRect().top; card.click(); return { top, index }; }")
            prod.locator("#drawer-close").click()
            prod.wait_for_function("() => !document.getElementById('drawer')")
            prod.wait_for_timeout(700)
            landed = prod.evaluate("(snap) => Math.abs(document.querySelectorAll('button.card-open')[snap.index].getBoundingClientRect().top - snap.top)", early)
            check(landed <= 1, f"a tap during the first scroll landed {landed}px off")
            prod.close()

            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            page.evaluate("() => { const input = document.getElementById('search'); input.value = 'zzzz-no-such-job'; input.dispatchEvent(new Event('input', { bubbles: true })); }")
            page.wait_for_timeout(500)
            page.locator("#drawer-close").click()
            page.wait_for_function("() => !document.getElementById('drawer')")
            page.evaluate("() => window.__app.scrollRestoreDone()")
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'list-t'"), "filtered card left focus on the body")
            page.locator("#search").fill("")
            page.wait_for_function("() => document.querySelectorAll('button.card-open').length === 211")

            page.locator("button.card-open").first.click()
            page.locator("#drawer").wait_for()
            check("הגדירו כתובת בית לציון אוטומטי" in page.locator("#drawer").inner_text(), "travel criterion lacks a home step")
            page.locator("#drawer-close").click()
            page.wait_for_function("() => !document.getElementById('drawer')")
            page.locator("#home-hint").click()
            page.locator("#home-address").wait_for()
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'home-address'"), "home address was not focused")
            page.evaluate(
                """() => {
                  const host = document.getElementById('home-results');
                  const button = document.createElement('button');
                  button.id = 'stale-geocode';
                  button.textContent = 'תוצאה ישנה';
                  host.append(button);
                }"""
            )
            page.route("**/nominatim.openstreetmap.org/**", lambda route: route.abort())
            page.fill("#home-address", "zzzz-not-a-place")
            page.click("#geocode-home")
            page.wait_for_function("() => !document.getElementById('stale-geocode')")
            page.unroute("**/nominatim.openstreetmap.org/**")
            page.locator('#nav [data-view="list"]').click()
            page.locator("button.card-open").first.click()
            page.locator("#drawer-compare").click()
            check(page.locator("#drawer-compare").get_attribute("aria-pressed") == "true", "drawer compare")
            check(page.locator("#compare-count").inner_text() == "1", "compare count from the drawer")
            page.locator("#drawer-close").click()
            page.locator('#nav [data-view="compare"]').click()
            page.locator("#compare-back").click()
            page.wait_for_function("() => !document.getElementById('view-list').hidden")
            page.locator('#nav [data-view="settings"]').click()
            page.locator("#weight-hint").wait_for()
            check("המשקלים יחסיים, האחוז הוא החלק בציון" in page.locator("#weight-hint").inner_text(), "weight hint")
            weight = page.locator("#criteria-editor input[type='range']").first
            weight.fill("50")
            weight.press("Enter")
            check(
                page.evaluate("() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'משקל התפקיד והאנשים'"),
                "weight editor lost focus",
            )
            page.locator('#nav [data-view="list"]').click()
            page.locator("button.card-open").first.click()
            page.locator("#star-role-5").click()
            page.locator("#drawer button[aria-label='ניקוי דירוג התפקיד והאנשים']").click()
            page.locator("#toast.is-on").wait_for()
            check("הדירוג נוקה" in page.locator("#toast").inner_text(), "rating undo toast")
            page.evaluate(
                """() => {
                  const drawer = document.getElementById('drawer');
                  const nodes = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
                    .filter((node) => node.getClientRects().length);
                  nodes[nodes.length - 1].focus();
                }"""
            )
            page.keyboard.press("Tab")
            check(page.evaluate("() => !!(document.activeElement && document.activeElement.closest('#toast'))"), "undo toast was outside the tab order")
            page.locator("#toast .btn", has_text="ביטול").focus()
            page.keyboard.press("Enter")
            check(page.locator("#star-role-5").get_attribute("aria-checked") == "true", "rating was not restored")
            check(page.evaluate("() => document.activeElement && document.activeElement.id === 'star-role-5'"), "undo left focus on the body")
            page.fill("#call-name", "בדיקה")
            page.fill("#call-text", "שיחה")
            page.click("#call-add")
            page.locator("#call-log button").click()
            page.locator("#toast .btn", has_text="ביטול").click()
            check(page.locator("#call-log article").count() == 1, "call log was not restored")
            page.locator("#drawer button[aria-label='ניקוי דירוג התפקיד והאנשים']").click()
            page.locator("#toast .btn", has_text="ביטול").wait_for()
            page.wait_for_function("() => !document.querySelector('#toast button')", timeout=8000)
            check(
                page.evaluate("() => { const node = document.getElementById('toast'); return node.inert && !node.querySelector('button'); }"),
                "expired undo stayed activatable",
            )

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

            held = browser.new_context(locale="he-IL", viewport={"width": 390, "height": 844})
            tab_a = held.new_page()
            tab_b = held.new_page()
            tab_b.add_init_script(
                """() => {
                  const real = EventTarget.prototype.addEventListener;
                  EventTarget.prototype.addEventListener = function (type, listener, options) {
                    if (type !== 'storage') return real.call(this, type, listener, options);
                    const wrapped = (event) => {
                      if (!window.__holdStorage) listener.call(this, event);
                    };
                    return real.call(this, type, wrapped, options);
                  };
                  window.__holdStorage = true;
                }"""
            )
            tab_a.set_default_timeout(20000)
            tab_b.set_default_timeout(20000)
            tab_a.goto(base)
            tab_b.goto(base)
            tab_a.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            tab_b.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            same_id = tab_a.evaluate("() => window.__app.jobs[0].id")
            tab_a.locator(f"button.card-open[data-job='{same_id}']").click()
            tab_a.locator("#star-role-4").click()
            tab_a.wait_for_function(
                """(id) => {
                  const raw = localStorage.getItem('bogrim-jobs.v1');
                  const job = raw && JSON.parse(raw).jobs[id];
                  return job && job.ratings && job.ratings.role === 4;
                }""",
                arg=same_id,
            )
            tab_b.locator(f"button.card-open[data-job='{same_id}']").click()
            tab_b.locator("#general-notes").fill("הערה משותפת")
            tab_b.wait_for_function(
                """(id) => {
                  const raw = localStorage.getItem('bogrim-jobs.v1');
                  const job = raw && JSON.parse(raw).jobs[id];
                  return job && job.notes === 'הערה משותפת' && job.ratings && job.ratings.role === 4;
                }""",
                arg=same_id,
            )
            tab_a.locator("#star-conditions-2").click()
            tab_a.wait_for_function(
                """(id) => {
                  const raw = localStorage.getItem('bogrim-jobs.v1');
                  const job = raw && JSON.parse(raw).jobs[id];
                  return job && job.ratings && job.ratings.role === 4 && job.ratings.conditions === 2
                    && job.notes === 'הערה משותפת';
                }""",
                arg=same_id,
            )
            held.close()
            fresh = browser.new_page(locale="he-IL", viewport={"width": 390, "height": 844})
            fresh.set_default_timeout(20000)
            fresh.goto(base + "#view=settings")
            fresh.locator("#home-address").wait_for()
            check(fresh.evaluate("() => !document.getElementById('view-settings').hidden"), "settings view was not restored")
            fresh.goto(base + "#view=map")
            fresh.locator("#view-map").wait_for()
            check(fresh.evaluate("() => !document.getElementById('view-map').hidden"), "map view was not restored")
            blank = Path(__file__).resolve().parent / "test-results" / "blank-criterion.json"
            blank.parent.mkdir(exist_ok=True)
            blank.write_text(json.dumps({
                "app": "bogrim-jobs",
                "exportedAt": "2026-10-11T00:00:00.000Z",
                "state": {
                    "criteria": [{"id": "blank", "name": "  ", "type": "rating", "weight": 10}],
                    "jobs": {},
                },
            }), encoding="utf-8")
            fresh.on("dialog", lambda dialog: dialog.accept())
            fresh.locator("#import-file").set_input_files(str(blank))
            fresh.wait_for_function("() => window.__app.state.criteria.some((item) => item.name === 'קריטריון ללא שם')")
            fresh.locator('#nav [data-view="settings"]').click()
            fresh.locator("#home-address").wait_for()

            def geocode_choices(route):
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps([
                        {"display_name": "אחר, מקום, ארץ, עוד", "lat": "31.5", "lon": "34.8"},
                        {"display_name": "  כתובתמיוחדת  ,  עיר  ,  מדינה  , יבשת", "lat": "32.1", "lon": "34.8"},
                    ]),
                )

            fresh.route("**/nominatim.openstreetmap.org/**", geocode_choices)
            fresh.fill("#home-address", "כתובתמיוחדת")
            fresh.click("#geocode-home")
            fresh.locator("#home-results button").first.wait_for()
            check(fresh.locator("#home-results button").first.inner_text() == "כתובתמיוחדת, עיר, מדינה", "address label was not shortened")
            fresh.locator("#home-results button").first.click()
            check(fresh.locator("#home-status").inner_text() == "הבית: כתובתמיוחדת, עיר, מדינה · שינוי", "home status")
            fresh.locator("#home-status button").click()
            check(fresh.evaluate("() => document.activeElement && document.activeElement.id === 'home-address'"), "change home did not focus the address")
            fresh.unroute("**/nominatim.openstreetmap.org/**")
            fresh.close()
            limit = browser.new_page(locale="he-IL", viewport={"width": 390, "height": 844})
            limit.set_default_timeout(20000)
            limit.goto(base)
            limit.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
            for index in range(4):
                limit.locator("#results .cmp").nth(index).click()
            limit.locator("#results .cmp").nth(4).click()
            limit.locator("#toast.is-on").wait_for()
            check("אפשר להשוות עד 4 משרות" in limit.locator("#toast").inner_text(), "compare limit toast")
            check(limit.evaluate("() => !document.getElementById('limit-alert').hidden"), "compare limit alert")
            limit.close()
            browser.close()
    finally:
        server.shutdown()
    print("ux checks passed")


if __name__ == "__main__":
    main()
