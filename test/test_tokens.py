#!/usr/bin/env python3
"""Color literals stay in the token file. Vendor and bitmap logos are exempt."""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
TOKENS = os.path.join(SRC, "styles-tokens.css")
EXEMPT = {
    os.path.normpath(TOKENS),
    os.path.normpath(os.path.join(SRC, "favicon.svg")),
    os.path.normpath(os.path.join(SRC, "og-image.png")),
}
COLOR = re.compile(r"#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(")
SKIP_DIRS = {"vendor", "fonts"}


def source_files():
    found = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
        for name in filenames:
            path = os.path.normpath(os.path.join(dirpath, name))
            if path in EXEMPT:
                continue
            if os.path.splitext(name)[1].lower() not in {".css", ".js", ".html", ".svg"}:
                continue
            found.append(path)
    return found


class TokenColorTests(unittest.TestCase):
    def test_tokens_file_exists(self):
        self.assertTrue(os.path.isfile(TOKENS))

    def test_no_color_literals_outside_tokens(self):
        hits = []
        for path in source_files():
            with open(path, encoding="utf-8") as handle:
                for number, line in enumerate(handle, start=1):
                    if COLOR.search(line):
                        hits.append(f"{os.path.relpath(path, ROOT)}:{number}")
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
