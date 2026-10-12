#!/usr/bin/env python3
"""Shipped asset URLs carry a content hash, and the hash follows dependencies."""
import os
import re
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import build  # noqa: E402
from build_hash import stamp_assets  # noqa: E402

HASHED = re.compile(r"\.[0-9a-f]{8}\.(?:css|js|svg|png|webp|jpe?g|woff2|json)(?:$|[?#])")
LOCAL = re.compile(
    r"""(?:from\s+|import\s+|new URL\(\s*)["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)|(?:href|src|srcset|content)=["']([^"']+)["']"""
)
ASSET_EXT = (".css", ".js", ".svg", ".png", ".webp", ".jpg", ".jpeg", ".woff2", ".json")
SKIP_MISSING = {"images/layers.png", "images/layers-2x.png", "images/marker-icon.png"}


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def digest(name):
    match = re.search(r"\.([0-9a-f]{8})\.[^.]+$", name)
    if not match:
        raise AssertionError(f"missing content hash: {name}")
    return match.group(1)


def references(text):
    found = []
    for match in LOCAL.finditer(text):
        raw = next(group for group in match.groups() if group)
        if raw.startswith(("http://", "https://", "data:", "blob:", "mailto:", "tel:", "#")):
            if "menashsoffer.github.io/bogrim-jobs/" not in raw:
                continue
            raw = raw.split("bogrim-jobs/", 1)[1]
        path = raw.split("#", 1)[0].split("?", 1)[0]
        if path.startswith("./"):
            path = path[2:]
        if path.endswith(ASSET_EXT):
            found.append(path)
    return found


def assert_hashed_refs(dest):
    bare = []
    for dirpath, _dirnames, filenames in os.walk(dest):
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in {".html", ".css", ".js", ".svg"}:
                continue
            path = os.path.join(dirpath, name)
            text = open(path, encoding="utf-8").read()
            for ref in references(text):
                if ref in SKIP_MISSING or ref == "robots.txt":
                    continue
                if not HASHED.search(ref):
                    bare.append(f"{os.path.relpath(path, dest)} -> {ref}")
    if bare:
        raise AssertionError("unhashed asset reference:\n" + "\n".join(bare[:12]))


class CacheTests(unittest.TestCase):
    def test_fixture_hash_follows_the_changed_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = os.path.join(tmp, "first")
            second = os.path.join(tmp, "second")
            self._fixture(first, dom="export const n = 1;\n", css="body{color:black}")
            stamp_assets(first)
            app_before = digest(self._find(first, "app."))
            css_before = digest(self._find(first, "styles."))
            self._fixture(second, dom="export const n = 2;\n", css="body{color:black}")
            stamp_assets(second)
            self.assertNotEqual(digest(self._find(second, "app.")), app_before)
            self.assertEqual(digest(self._find(second, "styles.")), css_before)
            third = os.path.join(tmp, "third")
            self._fixture(third, dom="export const n = 1;\n", css="body{color:white}")
            stamp_assets(third)
            self.assertEqual(digest(self._find(third, "app.")), app_before)
            self.assertNotEqual(digest(self._find(third, "styles.")), css_before)
            page = open(os.path.join(first, "index.html"), encoding="utf-8").read()
            self.assertIn(self._find(first, "styles."), page)
            self.assertIn(self._find(first, "app."), page)
            assert_hashed_refs(first)

    def test_built_site_hashes_every_reference(self):
        raw = [{
            "_id": "job-1",
            "title": "תפקיד",
            "jobTitle": "תפקיד",
            "authority": "רשות",
            "mStatus5": "עירייה",
            "district": "מרכז",
            "url": "https://www.bogrim-muni.com/jobs/example",
        }]
        with tempfile.TemporaryDirectory() as tmp:
            raw_path = os.path.join(tmp, "raw.json")
            dest = os.path.join(tmp, "site")
            write(raw_path, __import__("json").dumps(raw))
            build.main(["--raw", raw_path, "--dest", dest])
            assert_hashed_refs(dest)
            self.assertFalse(os.path.exists(os.path.join(dest, "styles.css")))
            self.assertFalse(os.path.exists(os.path.join(dest, "app.js")))
            self.assertFalse(os.path.exists(os.path.join(dest, "data.json")))
            page = open(os.path.join(dest, "index.html"), encoding="utf-8").read()
            self.assertIn('class="mark" width="28" height="28"', page)
            self.assertIn('class="icon icon-lg" width="24" height="24"', page)
            self.assertRegex(page, r"img/og-image\.[0-9a-f]{8}\.jpg")
            again = os.path.join(tmp, "again")
            shutil.copytree(dest, again)
            # A second stamp must not rename an already hashed tree into a new hash.
            self.assertEqual(stamp_assets(again), {})

    def _fixture(self, dest, dom, css):
        write(os.path.join(dest, "index.html"), '<link rel="stylesheet" href="styles.css">\n<script type="module" src="app.js"></script>\n<img src="img/hero.webp">\n')
        write(os.path.join(dest, "styles.css"), css + '\n.a{background:url("img/hero.webp")}\n')
        write(os.path.join(dest, "app.js"), "import './dom.js';\nfetch(new URL('./data.json', import.meta.url));\n")
        write(os.path.join(dest, "dom.js"), dom)
        write(os.path.join(dest, "data.json"), '{"ok":true}\n')
        write(os.path.join(dest, "img", "hero.webp"), "image")

    def _find(self, dest, prefix):
        matches = [name for name in os.listdir(dest) if name.startswith(prefix)]
        self.assertEqual(len(matches), 1, matches)
        return matches[0]


if __name__ == "__main__":
    unittest.main()
