"""Change classifier tests: all seven classes plus the unresolved path.

Run: python app/tests/test_changes.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import changes, store  # noqa: E402

LONG = (
    "Every Regulated Entity shall ensure that the records of every customer are maintained in a "
    "secure manner, that access to those records is restricted to authorised personnel at all times, "
    "and that every access to those records is logged and reviewed by the compliance function"
)


def clause(change_type: str, before: str, after: str) -> dict:
    return {
        "id": "src-test#c9",
        "source_id": "src-test",
        "change_type": change_type,
        "previous_text": before,
        "text": after,
        "num": "9",
        "section_ref": "Section 9",
        "subject": "test clause",
    }


class ClassifierTests(unittest.TestCase):
    def test_new_obligation(self):
        out = changes.classify(clause("added", "", "The Regulated Entity shall appoint a model owner."))
        self.assertEqual(out["change_class"], "new_obligation")

    def test_withdrawn(self):
        out = changes.classify(clause("removed", "Clause 12(b) permitted simplified measures.", "Clause 12(b) is omitted."))
        self.assertEqual(out["change_class"], "withdrawn")

    def test_no_material_change(self):
        out = changes.classify(clause("unchanged", "Section 16 text.", "Section 16 text."))
        self.assertEqual(out["change_class"], "no_material_change")

    def test_deadline_extended(self):
        out = changes.classify(clause(
            "modified",
            "The Regulated Entity shall report the incident within thirty days.",
            "The Regulated Entity shall report the incident within sixty days.",
        ))
        self.assertEqual(out["change_class"], "deadline_extended")

    def test_deadline_shortened(self):
        out = changes.classify(clause(
            "modified",
            "The Regulated Entity shall report the incident within sixty days.",
            "The Regulated Entity shall report the incident within ten days.",
        ))
        self.assertEqual(out["change_class"], "deadline_shortened")

    def test_clarification(self):
        out = changes.classify(clause(
            "modified",
            LONG + ".",
            LONG.replace("secure manner", "secure manner, for the avoidance of doubt,") + ".",
        ))
        self.assertEqual(out["change_class"], "clarification")

    def test_modified_threshold(self):
        out = changes.classify(clause(
            "modified",
            "The natural person who owns more than twenty-five per cent of the shares shall be identified.",
            "The natural person who owns more than ten per cent of the shares shall be identified.",
        ))
        self.assertEqual(out["change_class"], "modified")

    def test_every_class_is_reachable(self):
        seen = set()
        cases = [
            ("added", "", "The Regulated Entity shall appoint a model owner."),
            ("removed", "old", "Clause 12(b) is omitted."),
            ("unchanged", "same text", "same text"),
            ("modified", "within thirty days", "within sixty days"),
            ("modified", "within sixty days", "within ten days"),
            ("modified", LONG + ".", LONG.replace("secure manner", "secure manner, for the avoidance of doubt,") + "."),
            ("modified", "more than twenty-five per cent", "more than ten per cent"),
        ]
        for ct, before, after in cases:
            seen.add(changes.classify(clause(ct, before, after))["change_class"])
        self.assertEqual(seen, set(changes.CLASSES))

    def test_every_change_has_a_significance_sentence(self):
        state = store.build_state()
        items = changes.build_changes(state)
        self.assertGreater(len(items), 10)
        for item in items:
            self.assertIn(item["change_class"], changes.CLASSES)
            self.assertTrue(item["significance"].endswith("."))

    def test_unresolved_when_no_prior_document(self):
        state = store.build_state()
        items = changes.build_changes(state)
        unresolved = [c for c in items if c["relationship"] == "unresolved"]
        self.assertTrue(unresolved)
        self.assertTrue(all(c["prior_document_id"] is None for c in unresolved))
        self.assertTrue(all(c["confidence"] < 0.45 for c in unresolved))

    def test_linked_when_prior_document_exists(self):
        state = store.build_state()
        items = changes.build_changes(state)
        linked = [c for c in items if c["relationship"] == "linked"]
        self.assertTrue(linked)
        self.assertTrue(all(c["prior_document_id"] for c in linked))


if __name__ == "__main__":
    unittest.main(verbosity=2)
