#!/usr/bin/env python3
"""Color literals stay in the token file. Vendor and the colored favicon are exempt."""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
TOKENS = os.path.join(SRC, "styles-tokens.css")
EXEMPT = {
    os.path.normpath(TOKENS),
    os.path.normpath(os.path.join(SRC, "favicon.svg")),
}
NAMED = (
    "aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|"
    "brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|"
    "darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|"
    "darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|"
    "darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|"
    "forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|"
    "hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|"
    "lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|"
    "lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|"
    "limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|"
    "mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|"
    "mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|"
    "palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|"
    "purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|"
    "sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|"
    "tomato|transparent|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen"
)
COLOR = re.compile(rf"#[0-9A-Fa-f]{{3,8}}\b|rgba?\(|hsla?\(|(?<![\w-])(?:{NAMED})(?![\w-])", re.IGNORECASE)
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
