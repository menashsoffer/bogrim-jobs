"""Server, browser path, and CSV parsing shared by the site checks."""
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def chrome_path():
    for path in ("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        if os.path.exists(path):
            return path
    raise SystemExit("system Chrome was not found")


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def log_message(self, format, *args):
        return


def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def parse_csv(text):
    rows = []
    current = []
    cell = []
    quoted = False
    index = 0
    while index < len(text):
        char = text[index]
        if quoted:
            if char == '"':
                if index + 1 < len(text) and text[index + 1] == '"':
                    cell.append('"')
                    index += 2
                    continue
                quoted = False
                index += 1
                continue
            cell.append(char)
            index += 1
            continue
        if char == '"':
            quoted = True
            index += 1
            continue
        if char == ",":
            current.append("".join(cell))
            cell = []
            index += 1
            continue
        if char == "\r" and index + 1 < len(text) and text[index + 1] == "\n":
            current.append("".join(cell))
            rows.append(current)
            current = []
            cell = []
            index += 2
            continue
        cell.append(char)
        index += 1
    if cell or current:
        current.append("".join(cell))
        rows.append(current)
    return rows


def shown_count(page):
    text = page.locator("#result-count").inner_text()
    return int(text.replace("מוצגות", "").replace("משרות", "").strip())


def wait_count(page, count):
    page.wait_for_function(
        """(expected) => {
          const match = (document.getElementById('result-count').textContent || '').match(/מוצגות\\s+(\\d+)/);
          return match !== null && Number(match[1]) === expected;
        }""",
        arg=count,
    )


def search_count(jobs, query):
    needle = query.lower()
    found = 0
    for job in jobs:
        hay = "\n".join([
            job.get("title") or "",
            job.get("authority") or "",
            job.get("description") or "",
            job.get("role") or "",
            job.get("challenge") or "",
            job.get("solution") or "",
            " ".join(job.get("categories") or []),
            job.get("district") or "לא ידוע",
            job.get("authorityType") or "לא ידוע",
        ]).lower()
        if needle in hay:
            found += 1
    return found
