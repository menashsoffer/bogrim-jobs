#!/usr/bin/env python3
"""Build pipeline: allowlist, contact flag, and personal-data scan."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import build  # noqa: E402
import privacy_scan  # noqa: E402

SKIP_DIR_NAMES = {".git", "dist-contacts", "__pycache__", "node_modules", ".pytest_cache", "test-results", "playwright-report"}


def text_files(root):
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES and not privacy_scan.skip_personal_scan(os.path.join(dirpath, name))]
        if os.path.basename(dirpath) == "data":
            dirnames[:] = [name for name in dirnames if name != "raw"]
        if privacy_scan.skip_personal_scan(dirpath):
            dirnames[:] = []
            continue
        rel_dir = os.path.relpath(dirpath, root)
        parts = rel_dir.split(os.sep)
        if "dist-contacts" in parts or (len(parts) >= 2 and parts[0] == "data" and "raw" in parts):
            continue
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext not in privacy_scan.TEXT_EXTENSIONS:
                continue
            found.append(os.path.join(dirpath, name))
    return found


class BuildTests(unittest.TestCase):
    def test_email_phone_split_repairs_known_cases(self):
        typo = "ori@" + "wegalil.org" + "li"
        email, phone = build.split_email_field(typo)
        self.assertEqual(email, "ori@" + "wegalil.org" + ".il")
        self.assertEqual(phone, "")

        landline = "-".join(["04", "6937511"])
        email, phone = build.resolve_email_phone(landline, "")
        self.assertIsNone(email)
        self.assertEqual(phone, landline)

        mobile = "052" + "-" + "5853562"
        existing = "052" + "-" + "4689337"
        email, phone = build.resolve_email_phone(mobile, existing)
        self.assertIsNone(email)
        self.assertEqual(phone, existing)

        plain = "054" + "7773807"
        email, phone = build.resolve_email_phone(plain, plain)
        self.assertIsNone(email)
        self.assertEqual(phone, plain)

    def test_category_typo_and_allowlist_on_fixture(self):
        raw = [{
            "_id": "job-1",
            "title": "תפקיד לדוגמה",
            "jobTitle": "עוזר.ת מנכ\"ל",
            "authority": "רשות לדוגמה",
            "mStatus5": "עירייה",
            "district": "מרכז",
            "population": "1000",
            "socio": "5",
            "peri": "3",
            "categories": "פתוח ארגוני; תכנון אסטרטגי",
            "category_eshkolot": "פתוח ארגוני",
            "challengeRich_text": "<p>אתגר</p>",
            "jobDescriptionRich_text": "<ul><li>שורה</li></ul>",
            "solutionRich_text": "פתרון",
            "managerTitle": "מנכ\"ל",
            "url": "https://www.bogrim-muni.com/jobs/example",
            "lat": 32.0,
            "lon": 34.8,
            "manager": "שם פרטי",
            "managerEmail": "-".join(["04", "6937511"]),
            "managerPhone": "",
            "contact": "איש קשר",
            "contactEmail": "ori@" + "wegalil.org" + "li",
            "contactPhone": "",
            "lotemEmail": "",
            "lotemPhone": "",
            "maarach_livui": "",
            "_owner": "hidden",
        }]
        with tempfile.TemporaryDirectory() as tmp:
            raw_path = os.path.join(tmp, "raw.json")
            public_dest = os.path.join(tmp, "public")
            contact_dest = os.path.join(tmp, "with-contacts")
            with open(raw_path, "w", encoding="utf-8") as handle:
                json.dump(raw, handle, ensure_ascii=False)
            build.main(["--raw", raw_path, "--dest", public_dest])
            with open(os.path.join(public_dest, "data.json"), encoding="utf-8") as handle:
                public = json.load(handle)
            job = public["jobs"][0]
            self.assertFalse(public["meta"]["includeContacts"])
            self.assertEqual(job["categories"], ["פיתוח ארגוני", "תכנון אסטרטגי"])
            self.assertNotIn("<", job["description"])
            self.assertNotIn("פתוח ארגוני", json.dumps(job, ensure_ascii=False))
            for key in build.CONTACT_KEYS:
                self.assertNotIn(key, job)
            for key in build.DROPPED_RAW_KEYS:
                self.assertNotIn(key, job)
            emails, phones = privacy_scan.find_personal_data(json.dumps(public, ensure_ascii=False))
            self.assertEqual(emails, [])
            self.assertEqual(phones, [])

            build.main(["--include-contacts", "--raw", raw_path, "--dest", contact_dest])
            with open(os.path.join(contact_dest, "data.json"), encoding="utf-8") as handle:
                private = json.load(handle)
            hidden = private["jobs"][0]
            self.assertTrue(private["meta"]["includeContacts"])
            self.assertEqual(hidden["contactEmail"], "ori@" + "wegalil.org" + ".il")
            self.assertEqual(hidden["managerPhone"], "-".join(["04", "6937511"]))
            self.assertIsNone(hidden["managerEmail"])
            self.assertNotIn("_owner", hidden)
            self.assertTrue(privacy_scan.find_personal_data(json.dumps(private, ensure_ascii=False))[0])

            with self.assertRaises(SystemExit):
                build.main(["--include-contacts", "--raw", raw_path, "--dest", os.path.join(tmp, "dist")])

    def test_default_build_is_public_and_repo_has_no_contacts(self):
        data_path = os.path.join(ROOT, "data", "jobs.json")
        with open(data_path, encoding="utf-8") as handle:
            catalog_before = handle.read()
        build.main([])
        with open(data_path, encoding="utf-8") as handle:
            catalog_after = handle.read()
        self.assertEqual(catalog_after, catalog_before)
        dist_path = os.path.join(ROOT, "dist", "data.json")
        with open(data_path, encoding="utf-8") as handle:
            filtered = json.load(handle)
        with open(dist_path, encoding="utf-8") as handle:
            bundled = json.load(handle)
        self.assertEqual(len(filtered["jobs"]), 211)
        self.assertEqual(bundled["meta"]["includeContacts"], False)
        self.assertEqual(bundled["meta"]["count"], 211)
        self.assertGreaterEqual(len(bundled["localities"]), 1000)
        districts = {}
        types = {}
        for job in bundled["jobs"]:
            self.assertTrue(job["id"])
            self.assertTrue(job["url"].startswith("https://www.bogrim-muni.com/") or job["url"].startswith("https://bogrim-muni.com/"))
            self.assertIsNotNone(job["lat"])
            self.assertIsNotNone(job["lon"])
            self.assertNotIn("פתוח ארגוני", json.dumps(job, ensure_ascii=False))
            for key in list(build.CONTACT_KEYS) + list(build.DROPPED_RAW_KEYS):
                self.assertNotIn(key, job)
            extra = set(job) - set(build.PUBLIC_KEYS)
            self.assertEqual(extra, set())
            districts[job["district"]] = districts.get(job["district"], 0) + 1
            types[job["authorityType"]] = types.get(job["authorityType"], 0) + 1
        self.assertEqual(districts.get("דרום"), 51)
        self.assertEqual(districts.get(None), 16)
        self.assertEqual(types.get(None), 1)
        lod = [job for job in bundled["jobs"] if job["authority"] == "לוד" and "עוזר" in job["role"]]
        self.assertTrue(lod)
        self.assertIn("פיתוח ארגוני", lod[0]["categories"])

        leaked = []
        for path in text_files(ROOT):
            with open(path, encoding="utf-8", errors="replace") as handle:
                emails, phones = privacy_scan.find_personal_data(handle.read())
            if emails or phones:
                leaked.append(os.path.relpath(path, ROOT))
        self.assertEqual(leaked, [])

        tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines()
        for path in tracked:
            self.assertFalse(path.startswith("data/raw/"))
            self.assertFalse(path.startswith("dist-contacts/"))
            self.assertNotIn("bogrim_jobs.json", path)
            self.assertNotIn("bogrim_jobs.csv", path)

        raw_path = build.default_raw_path()
        if os.path.exists(raw_path):
            with tempfile.TemporaryDirectory() as tmp:
                dest = os.path.join(tmp, "dist-contacts")
                build.main(["--include-contacts", "--raw", raw_path, "--dest", dest])
                with open(os.path.join(dest, "data.json"), encoding="utf-8") as handle:
                    private = json.load(handle)
                with open(raw_path, encoding="utf-8") as handle:
                    raw_jobs = json.load(handle)
                by_id = {job["id"]: job for job in private["jobs"]}

                def built_for(predicate):
                    raw_job = next(job for job in raw_jobs if predicate(job))
                    return by_id[raw_job["_id"]]

                western = built_for(lambda job: job.get("authority") == "אשכול גליל מערבי" and str(job.get("contactEmail") or "").lower().endswith("orgli"))
                self.assertTrue(western["contactEmail"])
                self.assertTrue(western["contactEmail"].endswith("org.il"))
                self.assertFalse(western["contactEmail"].lower().endswith("orgli"))
                yesod = built_for(lambda job: job.get("authority") == "יסוד המעלה" and "@" not in str(job.get("managerEmail") or ""))
                self.assertIsNone(yesod["managerEmail"])
                self.assertTrue(yesod["managerPhone"])
                nahariya = built_for(lambda job: job.get("authority") == "נהריה" and "@" not in str(job.get("managerEmail") or "") and job.get("managerPhone"))
                self.assertIsNone(nahariya["managerEmail"])
                self.assertTrue(nahariya["managerPhone"])
                with open(dist_path, encoding="utf-8") as handle:
                    public_again = json.load(handle)
                self.assertFalse(public_again["meta"]["includeContacts"])
                emails, phones = privacy_scan.find_personal_data(json.dumps(public_again, ensure_ascii=False))
                self.assertEqual(emails, [])
                self.assertEqual(phones, [])


if __name__ == "__main__":
    unittest.main()
