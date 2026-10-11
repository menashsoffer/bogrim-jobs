"""Shared detectors for personal emails and Israeli phone numbers.

Used by the build (to refuse a public bundle that contains contacts) and by tests.
Patterns are intentionally strict enough to ignore the Web Mercator constant that
ships inside Leaflet (a decimal, not a phone).
"""
import re

EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.\-])"
)

# +972…, dashed landlines (0X-XXXXXXX), and 10-digit mobiles (05XXXXXXXX).
PHONE_RE = re.compile(
    r"(?<![\d.])(?:"
    r"\+972[\-\s]?\d{1,2}[\-\s]?\d{7}"
    r"|0\d{1,2}-\d{7}"
    r"|05\d-?\d{7}"
    r")(?!\d)"
)

TEXT_EXTENSIONS = {
    ".html", ".css", ".js", ".json", ".txt", ".md", ".py", ".svg", ".csv",
}


def find_personal_data(text):
    if not isinstance(text, str):
        return [], []
    return EMAIL_RE.findall(text), PHONE_RE.findall(text)
