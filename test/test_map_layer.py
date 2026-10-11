#!/usr/bin/env python3
"""The map must stay under the drawer, the compare view, and the filter sheet."""
from playwright.sync_api import sync_playwright

from site_harness import DIST, TINY_PNG, chrome_path, serve

OVERLAY_HITS = """(selector) => {
  const root = document.querySelector(selector);
  if (!root) return { ok: false, reason: 'missing ' + selector };
  const leaflet = (node) => node && node.closest(
    '.leaflet-container, .leaflet-pane, .leaflet-control, .leaflet-popup, .leaflet-top, .leaflet-bottom'
  );
  const inside = (node) => node && (node === root || root.contains(node) || node.closest(selector));
  const boxes = [root, ...root.querySelectorAll('.drawer, .backdrop, .leaflet-control-zoom, .leaflet-control-attribution, #map, h2, .empty, .panel')];
  const seen = new Set();
  const hits = [];
  boxes.forEach((box) => {
    const rect = box.getBoundingClientRect();
    [[0.5, 0.5], [0.25, 0.35], [0.8, 0.7]].forEach(([fx, fy]) => {
      const x = Math.round(rect.left + rect.width * fx);
      const y = Math.round(rect.top + rect.height * fy);
      const key = x + ',' + y;
      if (rect.width < 2 || rect.height < 2 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || seen.has(key)) return;
      seen.add(key);
      const node = document.elementFromPoint(x, y);
      hits.push({
        x, y,
        leaflet: Boolean(leaflet(node)),
        inside: Boolean(inside(node)),
        label: node ? (node.id || node.className || node.tagName).toString().slice(0, 80) : '',
      });
    });
  });
  const bad = hits.filter((hit) => hit.leaflet || !hit.inside);
  return { ok: hits.length >= 3 && bad.length === 0, hits: bad.slice(0, 6), count: hits.length };
}"""


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def open_map(page):
    page.locator('#nav [data-view="map"]').click()
    page.wait_for_function("() => document.querySelector('#map.leaflet-container .leaflet-control-zoom')")


def open_drawer(page):
    page.evaluate(
        """() => {
          const job = window.__app.jobs.find((item) => item.lat != null && item.lon != null);
          location.hash = '#job=' + job.id;
        }"""
    )
    page.locator("#drawer").wait_for()


def assert_overlay(page, selector, label):
    result = page.evaluate(OVERLAY_HITS, selector)
    check(result["ok"], f"{label} is under the map: {result}")


def run_viewport(page, base, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.goto(base)
    page.wait_for_function("() => window.__app && window.__app.jobs.length === 211")
    open_map(page)
    check("מוצגות 211 משרות לפי הסינון" in page.locator("#map-count").inner_text(), "map count")
    check(page.locator(".map-legend .score-none").count() == 1 and page.locator(".map-legend .score-5").count() == 1, "map legend")
    page.evaluate(
        """() => {
          let opened = false;
          window.__map.eachLayer((layer) => {
            if (opened || !layer.getTooltip || !layer.getTooltip()) return;
            layer.openPopup();
            opened = true;
          });
        }"""
    )
    page.locator(".leaflet-popup").wait_for()
    check(page.locator("#drawer").count() == 0, "marker opened the drawer without a popup choice")
    map_on_top = page.evaluate(
        """() => {
          const zoom = document.querySelector('.leaflet-control-zoom');
          const rect = zoom.getBoundingClientRect();
          const node = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return Boolean(node && node.closest('.leaflet-control'));
        }"""
    )
    check(map_on_top, f"map controls were not hittable at {width}x{height}")
    open_drawer(page)
    check(page.locator("#drawer").get_attribute("aria-modal") == "true", "drawer is not a modal")
    covered = page.evaluate(
        """() => {
          const leaflet = (node) => node && node.closest(
            '.leaflet-container, .leaflet-pane, .leaflet-control, .leaflet-popup, .leaflet-top, .leaflet-bottom'
          );
          const overlay = (node) => node && node.closest('#drawer-root');
          const points = [];
          const add = (box, fx, fy) => {
            if (!box) return;
            const rect = box.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;
            points.push([Math.round(rect.left + rect.width * fx), Math.round(rect.top + rect.height * fy)]);
          };
          add(document.querySelector('.leaflet-control-zoom'), 0.5, 0.5);
          add(document.querySelector('.leaflet-control-attribution'), 0.5, 0.5);
          add(document.querySelector('#map'), 0.5, 0.45);
          add(document.querySelector('#map'), 0.2, 0.7);
          add(document.querySelector('.drawer'), 0.5, 0.35);
          add(document.querySelector('.backdrop'), 0.92, 0.5);
          const bad = [];
          const seen = new Set();
          points.forEach(([x, y]) => {
            const key = x + ',' + y;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || seen.has(key)) return;
            seen.add(key);
            const node = document.elementFromPoint(x, y);
            if (!overlay(node) || leaflet(node)) bad.push({ x, y, label: node ? String(node.className || node.id || node.tagName).slice(0, 80) : '' });
          });
          return { ok: seen.size >= 3 && bad.length === 0, bad, count: seen.size };
        }"""
    )
    check(covered["ok"], f"drawer at {width}x{height} is under the map: {covered}")
    assert_overlay(page, "#drawer-root", f"drawer at {width}x{height}")
    page.keyboard.press("Escape")
    page.wait_for_function("() => !document.getElementById('drawer')")
    page.locator('#nav [data-view="compare"]').click()
    page.locator("#view-compare").wait_for()
    assert_overlay(page, "#view-compare", f"compare at {width}x{height}")
    if width < 960:
        page.locator('#nav [data-view="list"]').click()
        page.locator("#filter-toggle").click()
        page.locator("#filters.is-open").wait_for()
        assert_overlay(page, "#filters", f"filter sheet at {width}x{height}")


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing; run python3 build.py first")
    server = serve()
    origin = f"http://127.0.0.1:{server.server_address[1]}/"
    base = origin + "?test=1"

    def handle_route(route):
        if "tile.openstreetmap.org" in route.request.url:
            route.fulfill(status=200, content_type="image/png", body=TINY_PNG)
            return
        if route.request.url.startswith(origin):
            route.continue_()
            return
        route.abort()

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chrome_path(),
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = browser.new_context(locale="he-IL", viewport={"width": 1280, "height": 800})
            page = context.new_page()
            page.set_default_timeout(20000)
            page.route("https://**/*", handle_route)
            for width, height in ((1280, 800), (390, 844)):
                run_viewport(page, base, width, height)
            browser.close()
    finally:
        server.shutdown()
    print("map layer checks passed")


if __name__ == "__main__":
    main()
