#!/usr/bin/env python3
"""Hebrew travel-time labels. Sorting and filtering stay on numeric minutes."""
from playwright.sync_api import sync_playwright

from site_harness import DIST, chrome_path, serve

EXPECTED = {
    "0": "0 דק׳",
    "59": "59 דק׳",
    "59.6": "שעה",
    "60": "שעה",
    "61": "שעה ו-1 דק׳",
    "89": "שעה ו-29 דק׳",
    "120": "שעתיים",
    "121": "שעתיים ו-1 דק׳",
    "180": "3 שעות",
    "245": "4 שעות ו-5 דק׳",
}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            page = browser.new_page()
            page.goto(origin + "?test=1")
            page.wait_for_function("() => window.__app && window.__app.formatDuration")
            got = page.evaluate(
                """() => {
                  const format = window.__app.formatDuration;
                  const samples = {};
                  [0, 59, 59.6, 60, 61, 89, 120, 121, 180, 245].forEach((minutes) => {
                    samples[String(minutes)] = format(minutes);
                  });
                  const state = window.__app.state;
                  state.home = { label: 'רחובות', lat: 31.89, lon: 34.81 };
                  const jobs = window.__app.jobs.filter((job) => job.lat != null);
                  const first = jobs[0];
                  const second = jobs.find((job) => job.authority !== first.authority);
                  const key = `${state.home.lat.toFixed(5)},${state.home.lon.toFixed(5)}`;
                  state.routes = { [key]: { car: {} } };
                  state.routes[key].car[first.authority] = { min: 121, km: 10 };
                  state.routes[key].car[second.authority] = { min: 59, km: 8 };
                  const ordered = [first, second]
                    .slice()
                    .sort((left, right) => window.__app.travelMinutes(left) - window.__app.travelMinutes(right));
                  return {
                    samples,
                    minutes: ordered.map((job) => window.__app.travelMinutes(job)),
                    labels: ordered.map((job) => window.__app.travelSummary(job)),
                  };
                }"""
            )
            check(got["samples"] == EXPECTED, got["samples"])
            empty = page.evaluate("() => [null, '', NaN, undefined].map((value) => window.__app.formatDuration(value))")
            check(empty == ["", "", "", ""], empty)
            check(got["minutes"] == [59, 121], got["minutes"])
            check("59 דק׳" in got["labels"][0] and "שעתיים ו-1 דק׳" in got["labels"][1], got["labels"])
            browser.close()
    finally:
        server.shutdown()
    print("duration checks passed")


if __name__ == "__main__":
    main()
