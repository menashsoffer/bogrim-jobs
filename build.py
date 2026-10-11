#!/usr/bin/env python3
"""Build the static site in dist/.

  python3 build.py
      Public build. Personal contact fields are dropped. Writes dist/ and, when
      the gitignored raw file is present, refreshes data/jobs.json.

  python3 build.py --include-contacts
      Local only. Reads data/raw/bogrim_jobs.json and writes dist-contacts/
      (gitignored). Does not touch dist/ or data/jobs.json.

  python3 build.py --raw PATH --dest DIR [--include-contacts]
      Same pipeline, explicit paths (used by tests).
"""
import argparse
import datetime
import json
import os
import re
import shutil
import sys

from privacy_scan import find_personal_data

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
GEO = os.path.join(ROOT, "geo")
VENDOR = os.path.join(ROOT, "vendor", "leaflet")

PUBLIC_KEYS = (
    "id",
    "title",
    "role",
    "authority",
    "authorityType",
    "district",
    "population",
    "socioEconomic",
    "peripherality",
    "categories",
    "challenge",
    "description",
    "solution",
    "managerTitle",
    "url",
    "lat",
    "lon",
    "locationPrecision",
    "locationNote",
)

CONTACT_KEYS = (
    "managerName",
    "managerEmail",
    "managerPhone",
    "contactName",
    "contactEmail",
    "contactPhone",
    "liaisonName",
    "liaisonEmail",
    "liaisonPhone",
)

# Never copied into the public bundle, even if a future field is added upstream.
DROPPED_RAW_KEYS = {
    "manager",
    "managerEmail",
    "managerPhone",
    "contact",
    "contactEmail",
    "contactPhone",
    "lotemEmail",
    "lotemPhone",
    "maarach_livui",
    "_owner",
}

CATEGORY_FIELDS = (
    "categories",
    "category_eshkolot",
    "catAstrategi2",
    "catDigit",
    "catErguni",
    "catKalkali",
    "catSherut",
)

SOURCE_URL = "https://www.bogrim-muni.com/jobs"


def clean_text(value):
    if value is None:
        return ""
    text = str(value).replace("\r", "")
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def blank_none(value):
    text = clean_text(value)
    return text or None


def as_int(value):
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def as_number(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number.is_integer():
        return int(number)
    return number


def clean_categories(raw):
    parts = []
    for field in CATEGORY_FIELDS:
        value = raw.get(field) or ""
        if not isinstance(value, str):
            continue
        for piece in re.split(r"[;\n]+", value):
            piece = piece.strip().replace("פתוח ארגוני", "פיתוח ארגוני")
            if piece and piece not in parts:
                parts.append(piece)
    return parts


def split_email_field(value):
    """Return (email, phone_found_in_email_field).

    A phone typed into an email column has no '@' and is returned as a phone.
    The known two-label domain typo 'orgli' (org.il with the dot dropped) is repaired.
    """
    text = clean_text(value)
    if not text:
        return "", ""
    if "@" not in text:
        return "", text
    local, domain = text.split("@", 1)
    local = local.strip()
    domain = domain.strip()
    if domain.lower().endswith("orgli"):
        domain = domain[:-5] + "org.il"
    if not local or not domain or "." not in domain:
        return "", ""
    return f"{local}@{domain}", ""


def resolve_email_phone(email_raw, phone_raw):
    email, phone_from_email = split_email_field(email_raw)
    phone = clean_text(phone_raw)
    if phone_from_email and not phone:
        phone = phone_from_email
    return email or None, phone or None


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def is_raw_record(record):
    return isinstance(record, dict) and ("_id" in record or "jobTitle" in record)


def public_job(raw, coords, include_contacts):
    authority = clean_text(raw.get("authority"))
    point = coords.get(authority) or {}
    job = {
        "id": clean_text(raw.get("_id") or raw.get("id")),
        "title": clean_text(raw.get("title")),
        "role": clean_text(raw.get("jobTitle") or raw.get("role")),
        "authority": authority,
        "authorityType": blank_none(raw.get("mStatus5") if "mStatus5" in raw or is_raw_record(raw) else raw.get("authorityType")),
        "district": blank_none(raw.get("district")),
        "population": as_int(raw.get("population")),
        "socioEconomic": as_number(raw.get("socio") if is_raw_record(raw) else raw.get("socioEconomic")),
        "peripherality": as_number(raw.get("peri") if is_raw_record(raw) else raw.get("peripherality")),
        "categories": clean_categories(raw) if is_raw_record(raw) else list(raw.get("categories") or []),
        "challenge": clean_text(raw.get("challengeRich_text") or raw.get("challenge")),
        "description": clean_text(raw.get("jobDescriptionRich_text") or raw.get("description") or raw.get("jobDescription")),
        "solution": clean_text(raw.get("solutionRich_text") or raw.get("solution")),
        "managerTitle": blank_none(raw.get("managerTitle")),
        "url": clean_text(raw.get("url")),
        "lat": point.get("lat", raw.get("lat")),
        "lon": point.get("lon", raw.get("lon")),
        "locationPrecision": point.get("precision", raw.get("locationPrecision")),
        "locationNote": clean_text(point.get("note", raw.get("locationNote") or "")),
    }
    if not is_raw_record(raw):
        # Filtered input is already normalized; don't re-read raw-only columns.
        job["categories"] = [clean_text(c).replace("פתוח ארגוני", "פיתוח ארגוני") for c in (raw.get("categories") or []) if clean_text(c)]
    if include_contacts:
        manager_email, manager_phone = resolve_email_phone(raw.get("managerEmail"), raw.get("managerPhone"))
        contact_email, contact_phone = resolve_email_phone(raw.get("contactEmail"), raw.get("contactPhone"))
        liaison_email, liaison_phone = resolve_email_phone(raw.get("lotemEmail"), raw.get("lotemPhone"))
        job.update({
            "managerName": blank_none(raw.get("manager")),
            "managerEmail": manager_email,
            "managerPhone": manager_phone,
            "contactName": blank_none(raw.get("contact")),
            "contactEmail": contact_email,
            "contactPhone": contact_phone,
            "liaisonName": blank_none(raw.get("maarach_livui")),
            "liaisonEmail": liaison_email,
            "liaisonPhone": liaison_phone,
        })
    allowed = set(PUBLIC_KEYS) | (set(CONTACT_KEYS) if include_contacts else set())
    extra = set(job) - allowed
    if extra:
        raise SystemExit(f"refusing to publish unexpected keys: {sorted(extra)}")
    leaked = DROPPED_RAW_KEYS & set(job)
    if leaked and not include_contacts:
        raise SystemExit(f"refusing to publish contact keys: {sorted(leaked)}")
    return job


def load_records(path):
    data = load_json(path)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("jobs"), list):
        return data["jobs"]
    raise SystemExit(f"unrecognized job file: {path}")


def build_jobs(records, coords, include_contacts):
    jobs = [public_job(record, coords, include_contacts) for record in records]
    missing_ids = [job["authority"] for job in jobs if not job["id"]]
    if missing_ids:
        raise SystemExit("jobs without id")
    ids = [job["id"] for job in jobs]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate job ids")
    for job in jobs:
        if not job["url"].startswith("https://www.bogrim-muni.com/") and not job["url"].startswith("https://bogrim-muni.com/"):
            raise SystemExit(f"unexpected job url for {job.get('authority')}")
    if not include_contacts:
        blob = json.dumps(jobs, ensure_ascii=False)
        emails, phones = find_personal_data(blob)
        if emails or phones:
            raise SystemExit(f"public build contains personal data emails={emails[:5]} phones={phones[:5]}")
        for job in jobs:
            for key in CONTACT_KEYS:
                if key in job:
                    raise SystemExit(f"contact key {key} in public job")
    return jobs


def write_site(dest, jobs, localities, include_contacts):
    os.makedirs(dest, exist_ok=True)
    meta = {
        "source": SOURCE_URL,
        "sourceLabel": "בוגרים לשלטון המקומי",
        "count": len(jobs),
        "includeContacts": bool(include_contacts),
        "generated": datetime.date.today().isoformat(),
    }
    payload = {"meta": meta, "jobs": jobs, "localities": localities}
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if not include_contacts:
        emails, phones = find_personal_data(blob)
        if emails or phones:
            raise SystemExit("refusing to write data.json that contains emails or phones")
    with open(os.path.join(dest, "data.json"), "w", encoding="utf-8") as handle:
        handle.write(blob)
    for name in sorted(os.listdir(SRC)):
        if os.path.splitext(name)[1] in {".html", ".js", ".css", ".svg", ".png"}:
            shutil.copy(os.path.join(SRC, name), os.path.join(dest, name))
    leaflet_dest = os.path.join(dest, "vendor", "leaflet")
    if os.path.isdir(leaflet_dest):
        shutil.rmtree(leaflet_dest)
    shutil.copytree(VENDOR, leaflet_dest)
    shutil.copy(os.path.join(ROOT, "robots.txt"), os.path.join(dest, "robots.txt"))
    return meta


def default_raw_path():
    return os.path.join(ROOT, "data", "raw", "bogrim_jobs.json")


def default_filtered_path():
    return os.path.join(ROOT, "data", "jobs.json")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Build the bogrim-jobs static site")
    parser.add_argument("--include-contacts", action="store_true", help="include personal contacts; writes outside dist/")
    parser.add_argument("--raw", help="input JSON (raw scrape or filtered jobs.json)")
    parser.add_argument("--dest", help="output directory")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    include_contacts = args.include_contacts
    if args.dest:
        dest = args.dest
    elif include_contacts:
        dest = os.path.join(ROOT, "dist-contacts")
    else:
        dest = os.path.join(ROOT, "dist")

    raw_default = default_raw_path()
    filtered_default = default_filtered_path()
    if args.raw:
        source = args.raw
    elif include_contacts:
        source = raw_default
    elif os.path.exists(raw_default):
        source = raw_default
    else:
        source = filtered_default

    if not os.path.exists(source):
        raise SystemExit(f"missing input {source}")
    if include_contacts and os.path.basename(os.path.normpath(dest)) == "dist":
        raise SystemExit("refusing to write contacts into dist/")

    coords = load_json(os.path.join(GEO, "authority_coords.json"))
    localities = load_json(os.path.join(GEO, "localities_clean.json"))
    records = load_records(source)
    if include_contacts and not any(is_raw_record(record) for record in records):
        raise SystemExit("--include-contacts needs the raw scrape (contact columns are not in the filtered file)")
    jobs = build_jobs(records, coords, include_contacts)
    meta = write_site(dest, jobs, localities, include_contacts)

    if not include_contacts and not args.dest:
        filtered = {"meta": {k: meta[k] for k in ("source", "sourceLabel", "count", "includeContacts", "generated")}, "jobs": jobs}
        os.makedirs(os.path.dirname(filtered_default), exist_ok=True)
        with open(filtered_default, "w", encoding="utf-8") as handle:
            json.dump(filtered, handle, ensure_ascii=False, indent=1)
            handle.write("\n")

    print(f"wrote {dest} ({len(jobs)} jobs, contacts={'on' if include_contacts else 'off'})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
