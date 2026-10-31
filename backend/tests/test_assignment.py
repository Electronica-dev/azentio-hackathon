"""Level 2 workstream C tests: register lookup, manual flags, reviewer updates."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import assignment, level2, org  # noqa: E402
from tests.test_level2 import DOC, PARTIAL, make_state  # noqa: E402


class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "inventory.json").write_text("[]")
        self.saved = (org.ORG, org.FILES, org.SEED_INVENTORY, level2.DB)
        org.ORG, org.FILES, org.SEED_INVENTORY = root / "org", root / "org" / "files", root / "inventory.json"
        level2.DB = root / "level2.json"
        org.snapshot()  # seed empty files
        self.state = make_state()

    def tearDown(self):
        org.ORG, org.FILES, org.SEED_INVENTORY, level2.DB = self.saved
        self.tmp.cleanup()

    def people(self, *rows):
        org.add_people({"items": [dict(zip(("name", "department", "designation"), row)) for row in rows]})
        return {p["name"]: p["id"] for p in org.snapshot()["people"]}

    def analyse(self, documents=None, chunks=None):
        analysis = level2.analyse(self.state, {"regulatory_source_id": "src-ai-2026"},
                                  documents=[DOC] if documents is None else documents,
                                  chunk_corpus=PARTIAL if chunks is None else chunks)
        return analysis

    def recs(self, analysis_id):
        return level2.get_analysis(analysis_id)["recommendations"]

    def test_only_person_in_department_is_assigned_from_register(self):
        ids = self.people(("Asha Rao", "Risk", "Analyst"), ("Dev Shah", "Legal", ""))
        analysis = self.analyse()
        result = assignment.apply_register(analysis["id"])
        self.assertEqual(result["assigned"], 1)
        a = self.recs(analysis["id"])[0]["assignment"]
        self.assertEqual((a["status"], a["owner_id"], a["source"]), ("assigned", ids["Asha Rao"], "ownership_register"))
        self.assertIn("Only person in Risk", a["basis"])

    def test_department_labels_collapse_to_the_enum(self):
        ids = self.people(("Ravi Iyer", "Risk Tech", ""))
        analysis = self.analyse()
        assignment.apply_register(analysis["id"])
        self.assertEqual(self.recs(analysis["id"])[0]["assignment"]["owner_id"], ids["Ravi Iyer"])

    def test_single_head_wins_among_several(self):
        ids = self.people(("Asha Rao", "Risk", "Analyst"), ("Kavita Shah", "Risk", "Head of Risk"))
        analysis = self.analyse()
        assignment.apply_register(analysis["id"])
        a = self.recs(analysis["id"])[0]["assignment"]
        self.assertEqual(a["owner_id"], ids["Kavita Shah"])
        self.assertEqual(a["basis"], "Head of Risk, Risk")

    def test_ambiguous_department_is_flagged_not_guessed(self):
        self.people(("Asha Rao", "Risk", "Analyst"), ("Kavita Shah", "Risk", "Analyst"))
        analysis = self.analyse()
        result = assignment.apply_register(analysis["id"])
        a = self.recs(analysis["id"])[0]["assignment"]
        self.assertEqual(result["flagged"], 1)
        self.assertIsNone(a["owner_id"])
        self.assertEqual((a["status"], a["source"]), ("unassigned", "none"))
        self.assertTrue(a["needs_manual_assignment"])
        self.assertIn("2 people in Risk", a["manual_reason"])

    def test_empty_department_and_missing_document_are_flagged(self):
        self.people(("Asha Rao", "Risk", ""))
        analysis = self.analyse(documents=[], chunks=[])  # cannot_assess → evidence request, no department
        assignment.apply_register(analysis["id"])
        a = self.recs(analysis["id"])[0]["assignment"]
        self.assertTrue(a["needs_manual_assignment"])
        self.assertIn("No department", a["manual_reason"])

        org.delete_person(org.snapshot()["people"][0]["id"])  # the directory is now empty
        analysis = self.analyse()
        assignment.apply_register(analysis["id"])
        self.assertIn("No one in the people directory belongs to Risk", self.recs(analysis["id"])[0]["assignment"]["manual_reason"])

    def test_named_document_owner_is_preferred(self):
        ids = self.people(("Asha Rao", "Risk", ""), ("Meera Joshi", "Legal", ""))
        org._write("documents", [{**DOC, "owner": "Meera Joshi"}])
        analysis = self.analyse()
        assignment.apply_register(analysis["id"])
        a = self.recs(analysis["id"])[0]["assignment"]
        self.assertEqual(a["owner_id"], ids["Meera Joshi"])
        self.assertIn("Named owner of AI Model Governance Policy", a["basis"])

    def test_reviewer_confirms_changes_and_records_status(self):
        ids = self.people(("Asha Rao", "Risk", ""), ("Dev Shah", "Legal", ""))
        analysis = self.analyse()
        assignment.apply_register(analysis["id"])
        rec_id = self.recs(analysis["id"])[0]["id"]
        assessed = self.recs(analysis["id"])[0]["priority"]["level"]
        who = {"actor": "Priya Menon", "role": "reviewer"}

        with self.assertRaises(assignment.AssignmentError) as denied:
            assignment.update(rec_id, {"actor": "Priya Menon", "role": "viewer", "confirm": True})
        self.assertEqual(denied.exception.status, 403)

        a, detail = assignment.update(rec_id, {**who, "confirm": True})
        self.assertEqual((a["status"], a["implementation_status"]), ("confirmed", "not_started"))
        self.assertIn("confirmed Asha Rao", detail)

        a, _ = assignment.update(rec_id, {**who, "owner_id": ids["Dev Shah"], "due_date": "2026-12-15",
                                          "implementation_status": "in_progress", "priority_override": "critical"})
        self.assertEqual((a["owner_id"], a["source"], a["due_date"]), (ids["Dev Shah"], "reviewer", "2026-12-15"))
        self.assertEqual((a["implementation_status"], a["priority_override"]), ("in_progress", "critical"))
        self.assertEqual(self.recs(analysis["id"])[0]["priority"]["level"], assessed)  # override never rewrites B's priority

        # a later register pass never overwrites a reviewer's choice
        assignment.apply_register(analysis["id"])
        self.assertEqual(self.recs(analysis["id"])[0]["assignment"]["owner_id"], ids["Dev Shah"])

    def test_update_validation(self):
        self.people(("Asha Rao", "Risk", ""))
        analysis = self.analyse()
        rec_id = self.recs(analysis["id"])[0]["id"]
        who = {"actor": "Priya Menon", "role": "reviewer"}
        cases = [
            ({**who, "owner_id": "per-nope"}, 400),
            ({**who, "due_date": "15/12/2026"}, 400),
            ({**who, "implementation_status": "finished"}, 400),
            ({**who, "implementation_status": "done"}, 400),  # no owner yet
            ({**who, "status": "confirmed"}, 400),            # not a writable field
            ({**who, "confirm": True}, 400),                  # nothing to confirm
            ({"role": "reviewer", "confirm": True}, 400),     # no actor
            ({**who, "confirm": True, "x": 1}, 400),
        ]
        for payload, status in cases:
            with self.subTest(payload=payload), self.assertRaises(assignment.AssignmentError) as err:
                assignment.update(rec_id, payload)
            self.assertEqual(err.exception.status, status)
        with self.assertRaises(assignment.AssignmentError) as missing:
            assignment.update("rec-nope", {**who, "confirm": True})
        self.assertEqual(missing.exception.status, 404)

    def test_rejected_recommendation_is_not_actioned(self):
        self.people(("Asha Rao", "Risk", ""))
        analysis = self.analyse()
        rec_id = self.recs(analysis["id"])[0]["id"]
        level2.review_recommendation(self.state, rec_id, {"decision": "reject", "role": "reviewer",
                                                          "actor": "Priya", "note": "Covered elsewhere"})
        with self.assertRaises(assignment.AssignmentError) as err:
            assignment.update(rec_id, {"actor": "Priya", "role": "reviewer", "due_date": "2026-12-01"})
        self.assertEqual(err.exception.status, 409)

    def test_assignment_never_changes_gap_or_recommendation_content(self):
        self.people(("Asha Rao", "Risk", ""))
        analysis = self.analyse()
        before = json.loads(json.dumps(level2.get_analysis(analysis["id"])))
        assignment.apply_register(analysis["id"])
        rec_id = before["recommendations"][0]["id"]
        assignment.update(rec_id, {"actor": "Priya", "role": "reviewer", "confirm": True, "priority_override": "low"})
        after = level2.get_analysis(analysis["id"])
        self.assertEqual(before["gaps"], after["gaps"])
        strip = lambda r: {k: v for k, v in r.items() if k != "assignment"}  # noqa: E731
        self.assertEqual(strip(before["recommendations"][0]), strip(after["recommendations"][0]))


if __name__ == "__main__":
    unittest.main()
