"""Level 2 tests: mapping, the four gap states, drafts, review and matrix.

Run: python backend/tests/test_level2.py
"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import level2  # noqa: E402

OBLIGATION = {
    "id": "obl-ai-7-2",
    "source_id": "src-ai-2026",
    "section_ref": "Section 7(2)",
    "statement": ("Every Regulated Entity shall ensure that an automated credit decision is explainable, "
                  "is reviewed by a natural person, and that the decision and reviewer identity are "
                  "retained in the audit trail."),
    "quote": ("(2) Every Regulated Entity shall ensure that an automated credit decision is explainable, "
              "is reviewed by a natural person, and that the decision and reviewer identity are retained "
              "in the audit trail."),
    "tags": ["ai", "credit decisioning", "human review", "explainability"],
    "change_class": "modified",
    "change_type": "modified",
    "deadline": "",
    "params": {},
}

DOC = {
    "id": "int-ai-gov",
    "title": "AI Model Governance Policy",
    "category": "ai_governance",
    "department": "Risk",
    "business_area": "Model Risk",
    "version": "v2.3",
    "quality": "text",
}

PARTIAL = [{
    "id": "int-ai-gov#3.2",
    "document_id": "int-ai-gov",
    "ref": "3.2",
    "heading": "Model explainability",
    "heading_path": ["3", "3.2"],
    "text": ("3.2 Model explainability. The model owner shall document the factors that influence a "
             "credit decision in the model card. The documentation shall be reviewed by the validation "
             "function before deployment."),
}]

ADDRESSED = PARTIAL + [{
    "id": "int-ai-gov#3.3",
    "document_id": "int-ai-gov",
    "ref": "3.3",
    "heading": "Human review and audit trail",
    "heading_path": ["3", "3.3"],
    "text": ("3.3 Every automated credit decision shall be reviewed by a natural person before the "
             "decision is communicated. The decision, the reviewer identity and the timestamp shall be "
             "retained in the audit trail."),
}]

UNRELATED = [{
    "id": "int-ai-gov#5",
    "document_id": "int-ai-gov",
    "ref": "5",
    "heading": "Automated credit decisioning governance",
    "heading_path": ["5"],
    "text": ("This policy covers automated credit decisioning for retail lending. It describes the "
             "governance process and the roles of the model owner and the credit committee."),
}]


def make_state() -> dict:
    return {
        "sources": [{"id": "src-ai-2026", "title": "AI in Credit Decisioning — Amendment 2026",
                     "effective": "2027-01-15", "ref": "RBI/2026-27/92"}],
        "obligations": [dict(OBLIGATION)],
        "audit": [],
        "impacts": [],
        "tasks": [],
    }


class Level2Tests(unittest.TestCase):
    def setUp(self):
        level2.DB = level2.DATA / f"level2-selftest-{os.getpid()}.json"
        level2.DB.unlink(missing_ok=True)
        self.state = make_state()

    def tearDown(self):
        level2.DB.unlink(missing_ok=True)

    def _analyse(self, chunks, documents=None):
        return level2.analyse(
            self.state,
            {"regulatory_source_id": "src-ai-2026"},
            documents=[DOC] if documents is None else documents,
            chunk_corpus=chunks,
        )

    def test_partial_gap_produces_an_actionable_draft(self):
        analysis = self._analyse(PARTIAL)
        self.assertEqual(analysis["counts"]["obligations"], 1)
        gap = analysis["gaps"][0]
        self.assertEqual(gap["state"], "partially_addressed")
        self.assertTrue(any("human review" in item.lower() for item in gap["what_is_missing"]))
        self.assertTrue(gap["mapping_ids"])

        rec = analysis["recommendations"][0]
        self.assertEqual(rec["kind"], "compliance_change")
        self.assertEqual(rec["change_type"], "process_step")
        self.assertEqual(rec["status"], "draft")
        self.assertEqual(rec["regulatory_clause"]["quote"], OBLIGATION["quote"])
        self.assertIn("natural person", rec["proposed_text"])
        self.assertIn("audit trail", rec["proposed_text"].lower())
        self.assertIn(rec["priority"]["level"], ("critical", "high", "medium", "low"))
        self.assertTrue(rec["priority"]["rationale"])
        self.assertEqual(rec["assignment"]["status"], "unassigned")
        self.assertIsNone(rec["assignment"]["owner_id"])
        self.assertEqual(rec["assignment"]["suggested_department"], "Risk")

    def test_full_coverage_is_addressed_and_needs_no_draft(self):
        analysis = self._analyse(ADDRESSED)
        gap = analysis["gaps"][0]
        self.assertEqual(gap["state"], "addressed")
        self.assertEqual(gap["what_is_missing"], [])
        self.assertEqual(analysis["recommendations"], [])

    def test_no_matching_control_is_not_addressed(self):
        analysis = self._analyse(UNRELATED)
        gap = analysis["gaps"][0]
        self.assertEqual(gap["state"], "not_addressed")
        self.assertTrue(gap["what_is_missing"])
        self.assertTrue(gap["search_scope"]["documents_searched"])
        self.assertEqual(len(analysis["recommendations"]), 1)

    def test_no_documents_is_cannot_assess_with_an_evidence_request(self):
        analysis = self._analyse([], documents=[])
        gap = analysis["gaps"][0]
        self.assertEqual(gap["state"], "cannot_assess")
        self.assertIsNone(gap["internal_document_id"])
        self.assertTrue(gap["needs_review"])
        rec = analysis["recommendations"][0]
        self.assertEqual(rec["kind"], "evidence_request")
        self.assertEqual(rec["change_type"], "evidence_request")
        self.assertIsNone(rec["target"]["id"])

    def test_review_requires_a_role_and_is_final(self):
        analysis = self._analyse(PARTIAL)
        rec_id = analysis["recommendations"][0]["id"]

        with self.assertRaises(PermissionError):
            level2.review_recommendation(self.state, rec_id, {"decision": "approve", "role": "viewer"})

        approved = level2.review_recommendation(
            self.state, rec_id,
            {"decision": "approve", "role": "reviewer", "actor": "Priya Menon", "note": "Accepted."},
        )
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(approved["approved_by"], "Priya Menon")

        with self.assertRaises(RuntimeError):
            level2.review_recommendation(self.state, rec_id,
                                         {"decision": "approve", "role": "reviewer"})

        stored = level2.recommendations_for(analysis["id"])[0]
        self.assertEqual(stored["status"], "approved")

    def test_rejection_needs_a_note(self):
        analysis = self._analyse(PARTIAL)
        rec_id = analysis["recommendations"][0]["id"]
        with self.assertRaises(ValueError):
            level2.review_recommendation(self.state, rec_id, {"decision": "reject", "role": "reviewer"})
        rejected = level2.review_recommendation(
            self.state, rec_id,
            {"decision": "reject", "role": "reviewer", "note": "Wrong owner policy."},
        )
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(rejected["review_note"], "Wrong owner policy.")

    def test_draft_can_be_edited_but_approved_cannot(self):
        analysis = self._analyse(PARTIAL)
        rec_id = analysis["recommendations"][0]["id"]
        edited = level2.edit_recommendation(self.state, rec_id,
                                            {"proposed_text": "Add a human review step before rejection."})
        self.assertEqual(edited["version"], 2)

        level2.review_recommendation(self.state, rec_id,
                                     {"decision": "approve", "role": "reviewer"})
        with self.assertRaises(RuntimeError):
            level2.edit_recommendation(self.state, rec_id, {"proposed_text": "Changed."})

    def test_matrix_returns_one_row_per_gap_with_unassigned_owner(self):
        analysis = self._analyse(PARTIAL)
        rows = level2.matrix(self.state, analysis["id"])
        self.assertEqual(len(rows), len(analysis["gaps"]))
        row = rows[0]
        self.assertEqual(row["analysis_id"], analysis["id"])
        self.assertEqual(row["obligation"]["quote"], OBLIGATION["quote"])
        self.assertEqual(row["obligation"]["source_title"], "AI in Credit Decisioning — Amendment 2026")
        self.assertEqual(row["assignment"]["status"], "unassigned")
        self.assertIsNone(row["assignment"]["owner_id"])
        self.assertIsNotNone(row["recommendation"])
        self.assertIsNotNone(row["mapping"])

    def test_analysis_scope_requires_obligations(self):
        self.state["obligations"] = []
        with self.assertRaises(ValueError):
            self._analyse(PARTIAL)


if __name__ == "__main__":
    unittest.main(verbosity=2)
