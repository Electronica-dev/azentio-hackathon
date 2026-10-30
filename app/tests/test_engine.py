"""Engine regression tests. Run: python app/tests/test_engine.py"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import audit, store  # noqa: E402
from regula.pipeline import run_source  # noqa: E402


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = store.build_state()

    def test_clauses_and_changes(self):
        clauses = self.state["clauses"]
        self.assertGreaterEqual(len(clauses), 18)
        types = {c["change_type"] for c in clauses}
        self.assertEqual(types, {"added", "modified", "removed"})

    def test_obligations_have_evidence(self):
        obs = self.state["obligations"]
        self.assertEqual(len(obs), 21)
        for o in obs:
            self.assertTrue(o["quote"])
            self.assertTrue(o["clause_id"])
            self.assertGreater(o["confidence"], 0.7)

    def test_beneficial_ownership_threshold(self):
        bo = next(o for o in self.state["obligations"] if "beneficial owner" in o["statement"].lower())
        self.assertEqual(bo["params"]["bo_threshold_pct"], 10)

    def test_delta_detects_cif_gap(self):
        cif = [i for i in self.state["impacts"] if i["asset_id"] == "sys-cif" and i["deltas"]]
        self.assertTrue(cif)
        self.assertIn("bo_threshold_pct", {d["key"] for i in cif for d in i["deltas"]})

    def test_plan_is_owned_and_sequenced(self):
        tasks = self.state["tasks"]
        self.assertEqual(len(tasks), 25)
        self.assertTrue(all(t["owner"] for t in tasks))
        self.assertTrue(any(t["depends_on"] for t in tasks))
        self.assertTrue(all(t["due"] for t in tasks))

    def test_audit_chain(self):
        result = audit.verify(self.state)
        self.assertTrue(result["ok"])
        self.assertEqual(result["checked"], len(self.state["audit"]))

    def test_run_second_source(self):
        sources, assets, docs, priors = store.load_seed()
        dl = next(s for s in sources if s["id"] == "src-dl-2026")
        state = store.build_state()
        result = run_source(state, dl, docs, priors)
        self.assertEqual(len(result["obligations"]), 9)
        self.assertGreater(len(result["impacts"]), 15)
        self.assertTrue(all(t["owner"] for t in result["tasks"]))
        self.assertTrue(audit.verify(state)["ok"])

    def test_export(self):
        md = store.source_report(self.state, "src-kyc-2026")
        self.assertIn("Regulatory Change Impact Assessment", md)
        self.assertIn("RBI/2026-27/87", md)
        self.assertIn("## 4. Change plan", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
