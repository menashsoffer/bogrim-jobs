#!/usr/bin/env python3
"""Scrape all job listings from https://www.bogrim-muni.com/jobs (Wix site).

Data source: the site's public Wix Data collection "Jobs", queried the same way the
page's own dataset does it: an anonymous visitor token from /_api/v1/access-tokens,
then POST /_api/cloud-data/v2/items/query (paged). No login.
Cross-checked against the job sitemap.
Outputs (gitignored): data/raw/bogrim_jobs.json and data/raw/bogrim_jobs.csv. Do not commit them.
"""
import csv, json, os, re, sys, time, html, urllib.request, urllib.parse

BASE = "https://www.bogrim-muni.com"
GRID_APP_ID = "af2e8e39-8fc8-44e0-ab04-9b8ac5bc7964"   # site's Wix Data app id (from page HTML)
WIX_DATA_APP = "675bbcef-18d8-41f5-800e-131ec9e08762"
SITEMAP = BASE + "/dynamic-jobs_p_052c88dd_3c70_48a6_b7cc_6f1ca9ca81c0_0_5000-sitemap.xml"
UA = {"User-Agent": "bogrim-jobs-scraper/1.0 (local build; github.com/menashsoffer/bogrim-jobs)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw")

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()

def grid_app_id():
    try:
        m = re.search(rb'"gridAppId":"([0-9a-f-]{36})"', get(BASE + "/jobs"))
        return m.group(1).decode() if m else GRID_APP_ID
    except Exception:
        return GRID_APP_ID

def query_all():
    tok = json.loads(get(BASE + "/_api/v1/access-tokens"))
    inst = tok["apps"][WIX_DATA_APP]["instance"]
    gid = grid_app_id()
    items, offset, total = [], 0, None
    while True:
        body = {"dataCollectionId": "Jobs", "environment": "LIVE", "appId": gid,
                "returnTotalCount": True,
                "query": {"paging": {"limit": 100, "offset": offset},
                          "sort": [{"fieldName": "_createdDate", "order": "DESC"}]}}
        req = urllib.request.Request(BASE + "/_api/cloud-data/v2/items/query",
              data=json.dumps(body).encode(), headers={**UA, "Content-Type": "application/json",
              "Authorization": inst, "x-wix-grid-app-id": gid})
        r = json.loads(urllib.request.urlopen(req, timeout=60).read())
        batch = r.get("dataItems", [])
        total = r.get("pagingMetadata", {}).get("total", total)
        items += [d["data"] for d in batch]
        offset += len(batch)
        if not batch or (total is not None and offset >= total):
            break
        time.sleep(1.0)
    return items, total

def sitemap_urls():
    return [html.unescape(u) for u in re.findall(r"<loc>([^<]+)</loc>", get(SITEMAP).decode())]

def strip_html(s):
    if not isinstance(s, str): return s
    s = re.sub(r"<li[^>]*>", "• ", s); s = re.sub(r"</(p|li|h\d|div)>|<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s); s = html.unescape(s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()

def wixdate(v):
    return v.get("$date") if isinstance(v, dict) and "$date" in v else v

def main():
    items, total = query_all()
    print(f"API returned {len(items)} items (reported total {total})", file=sys.stderr)
    recs = []
    for it in items:
        r = {}
        for k, v in it.items():
            v = wixdate(v)
            if isinstance(v, (list, dict)): v = json.dumps(v, ensure_ascii=False)
            r[k] = v
        link = it.get("link-jobs-title")
        r["url"] = BASE + link if link else None
        r["url_decoded"] = urllib.parse.unquote(r["url"]) if r["url"] else None
        for f in ("jobDescriptionRich", "challengeRich", "solutionRich"):
            if it.get(f): r[f + "_text"] = strip_html(it[f])
        cats = []
        for c in sorted(it):
            if c.startswith("cat") and isinstance(it[c], str):
                for v in re.split(r"[\n;,]+", it[c]):
                    v = v.strip()
                    if v and v not in cats: cats.append(v)
        r["categories"] = "; ".join(cats)
        recs.append(r)
    # cross-check with sitemap
    try:
        sm = set(urllib.parse.unquote(u) for u in sitemap_urls())
        have = set(r["url_decoded"] for r in recs if r["url_decoded"])
        print(f"sitemap URLs: {len(sm)}; in API & sitemap: {len(sm & have)}; "
              f"sitemap-only: {len(sm - have)}; API-only: {len(have - sm)}", file=sys.stderr)
        for u in sorted(sm - have)[:20]: print("  sitemap-only:", u, file=sys.stderr)
    except Exception as e:
        print("sitemap check failed:", e, file=sys.stderr)
    preferred = ["_id", "serialNumber", "year", "course", "title", "jobTitle", "authority", "mStatus5",
                 "district", "eshkol", "population", "socio", "unit", "manager", "managerTitle",
                 "managerEmail", "managerPhone", "contact", "contactEmail", "contactPhone",
                 "challenge", "jobDescription", "solution", "categories", "url", "url_decoded",
                 "_createdDate", "_updatedDate"]
    keys = preferred + sorted({k for r in recs for k in r} - set(preferred))
    keys = [k for k in keys if any(k in r for r in recs)]
    recs = [{k: r.get(k) for k in keys} for r in recs]
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "bogrim_jobs.json"), "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "bogrim_jobs.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(recs)
    print(f"wrote {len(recs)} records, {len(keys)} columns", file=sys.stderr)

if __name__ == "__main__":
    main()
