"""Dummy extraction endpoint tests. Run: python app/tests/test_extract.py"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import extract_api  # noqa: E402

TEXT = """RESERVE BANK OF INDIA
Department of Regulation

RBI/2026-27/101                                October 31, 2026

Guidelines on Responsible Use of Artificial Intelligence

1. Short title and commencement
(1) These Guidelines may be called the AI Guidelines, 2026.

2. Model validation
(1) Every Regulated Entity shall validate each credit model at least once every twelve months.
(2) The Regulated Entity shall maintain a model card for every model in production.

3. Grievance redressal
(1) Every Regulated Entity shall resolve customer complaints within thirty days.
"""


class ExtractApiTests(unittest.TestCase):
    def test_returns_dummy_flag_and_contract_version(self):
        out = extract_api.extract_document({"text": TEXT})
        self.assertTrue(out["dummy"])
        self.assertEqual(out["contract_version"], "pending")

    def test_obligations_have_evidence(self):
        out = extract_api.extract_document({"text": TEXT})
        self.assertGreaterEqual(out["stats"]["obligations"], 3)
        for obl in out["obligations"]:
            self.assertTrue(obl["quote"])
            self.assertTrue(obl["section_ref"])
            self.assertGreater(obl["confidence"], 0.7)

    def test_deadline_is_extracted(self):
        out = extract_api.extract_document({"text": TEXT})
        deadlines = {o["deadline"] for o in out["obligations"]}
        self.assertTrue(any(deadlines), deadlines)

    def test_metadata_is_carried_through(self):
        out = extract_api.extract_document({
            "text": TEXT,
            "title": "AI Guidelines",
            "authority": "RBI",
            "region": "india",
        })
        self.assertEqual(out["source"]["authority"], "RBI")
        self.assertEqual(out["source"]["region"], "INDIA")

    def test_missing_text_is_a_value_error(self):
        with self.assertRaises(ValueError):
            extract_api.extract_document({})

    def test_shape_is_stable(self):
        out = extract_api.extract_document({"text": TEXT})
        for key in ("dummy", "contract_version", "source", "clauses", "obligations", "stats"):
            self.assertIn(key, out)
        for key in ("id", "document_id", "clause_id", "section_ref", "statement", "quote", "deadline", "params", "tags", "confidence"):
            self.assertIn(key, out["obligations"][0])
        for key in ("id", "document_id", "num", "heading", "section_ref", "change_type"):
            self.assertIn(key, out["clauses"][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
