"""Internal repository tests — storage is redirected to a temp folder."""
from __future__ import annotations

import base64
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import org  # noqa: E402

INVENTORY = [
    {"id": "pol-a", "type": "policy", "name": "KYC Policy", "owner": "Priya Menon", "team": "Compliance", "criticality": 5, "tags": []},
    {"id": "sys-b", "type": "system", "name": "Core Banking", "owner": "Ravi Iyer", "team": "Technology", "criticality": 4, "tags": []},
    {"id": "ctl-c", "type": "control", "name": "Consent Audit", "owner": "Priya Menon", "team": "Compliance", "criticality": 3, "tags": []},
]


def b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


class OrgTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        seed = root / "inventory.json"
        seed.write_text(json.dumps(INVENTORY))
        self.saved = (org.ORG, org.FILES, org.SEED_INVENTORY)
        org.ORG, org.FILES, org.SEED_INVENTORY = root / "org", root / "org" / "files", seed

    def tearDown(self):
        org.ORG, org.FILES, org.SEED_INVENTORY = self.saved
        self.tmp.cleanup()

    def test_first_read_seeds_assets_and_people_from_inventory(self):
        snap = org.snapshot()
        self.assertEqual([a["id"] for a in snap["assets"]], ["pol-a", "sys-b", "ctl-c"])
        self.assertEqual(sorted(p["name"] for p in snap["people"]), ["Priya Menon", "Ravi Iyer"])
        self.assertEqual(snap["documents"], [])

    def test_bulk_upload_stores_files_and_metadata(self):
        added = org.add_documents({
            "files": [{"filename": "aml_sop.txt", "content_base64": b64("Customer onboarding steps " * 20)},
                      {"filename": "ai-policy.md", "content_base64": b64("Model risk governance")}],
            "category": "ai_governance", "department": "Risk", "review_date": "2027-01-31",
        })
        self.assertEqual(len(added), 2)
        self.assertEqual(added[0]["title"], "aml sop")
        self.assertTrue((org.FILES / added[0]["file"]).exists())
        self.assertGreater(added[0]["words"], 0)
        self.assertEqual(len(org.snapshot()["documents"]), 2)
        org.delete_document(added[0]["id"])
        self.assertFalse((org.FILES / added[0]["file"]).exists())
        self.assertEqual(len(org.snapshot()["documents"]), 1)

    def test_document_validation(self):
        with self.assertRaises(org.OrgError):
            org.add_documents({"files": [{"filename": "a.txt", "content_base64": b64("x")}], "category": "nope"})
        with self.assertRaises(ValueError):
            org.add_documents({"files": [{"filename": "a.txt", "content_base64": ""}]})
        with self.assertRaises(org.OrgError):
            org.add_documents({"files": []})

    def test_assets_from_csv_join_the_live_state(self):
        state = {"assets": list(INVENTORY)}
        added = org.add_assets(state, {"csv": "name,type,owner,department,criticality,tags\n"
                                              "Loan Origination System,system,Ravi Iyer,Technology,5,lending;credit\n"
                                              "Vendor Review,process,,Procurement,2,\n"})
        self.assertEqual([a["type"] for a in added], ["system", "process"])
        self.assertEqual(added[0]["tags"], ["lending", "credit"])
        self.assertEqual(len(state["assets"]), 5)
        self.assertEqual(len(org.load_assets()), 5)
        org.delete_asset(state, added[0]["id"])
        self.assertEqual(len(state["assets"]), 4)

    def test_invalid_asset_row_rejects_the_whole_import(self):
        state = {"assets": []}
        org.snapshot()
        with self.assertRaises(org.OrgError):
            org.add_assets(state, {"items": [{"name": "Fine", "type": "system"}, {"name": "Bad", "type": "spaceship"}]})
        self.assertEqual(len(org.load_assets()), 3)
        self.assertEqual(state["assets"], [])

    def test_people_validate_email_and_reject_duplicates(self):
        org.add_people({"item": {"name": "Asha Rao", "email": "asha@bank.test", "department": "Risk", "designation": "CRO"}})
        with self.assertRaises(org.OrgError):
            org.add_people({"item": {"name": "Asha Again", "email": "ASHA@bank.test"}})
        with self.assertRaises(org.OrgError):
            org.add_people({"item": {"name": "No Email", "email": "not-an-email"}})
        self.assertIn("Asha Rao", [p["name"] for p in org.snapshot()["people"]])

    def test_overview_score_skips_checks_without_data(self):
        state = {"obligations": [], "impacts": [], "tasks": [], "sources": []}
        result = org.overview(state)
        by_key = {c["key"]: c for c in result["components"]}
        self.assertEqual(by_key["documentation"]["score"], 0)
        self.assertIsNone(by_key["review"]["score"])
        self.assertEqual(by_key["ownership"]["score"], 100)
        # documentation 0 (w20) and ownership 100 (w20) are the only scored checks
        self.assertEqual(result["score"], 50)
        self.assertEqual(len(result["missing_categories"]), 6)

    def test_overview_counts_remediation_and_review_dates(self):
        past = (date.today() - timedelta(days=1)).isoformat()
        future = (date.today() + timedelta(days=30)).isoformat()
        for when in (past, future):
            org.add_documents({"files": [{"filename": "p.txt", "content_base64": b64("policy text")}], "review_date": when})
        state = {
            "obligations": [{"id": "o1"}, {"id": "o2"}],
            "impacts": [{"id": "i1", "obligation_id": "o1", "severity": "critical", "status": "proposed", "score": 90,
                         "asset_name": "KYC Policy", "source_id": "s1"}],
            "tasks": [{"status": "done", "team": "Compliance"}, {"status": "proposed", "team": "Compliance"}],
            "sources": [{"id": "s1", "title": "KYC", "effective": future, "status": "in_review", "ref": "R/1"}],
        }
        result = org.overview(state)
        by_key = {c["key"]: c for c in result["components"]}
        self.assertEqual(by_key["review"]["score"], 50)
        self.assertEqual(by_key["mapping"]["score"], 50)
        self.assertEqual(by_key["remediation"]["score"], 50)
        self.assertEqual(result["attention"][0]["ref"], "R/1")
        self.assertEqual(result["deadlines"][0]["days_left"], 30)
        self.assertEqual(result["open_tasks_by_team"], [{"team": "Compliance", "open": 1}])


if __name__ == "__main__":
    unittest.main()
