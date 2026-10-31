"""Discovery endpoint tests. Run: python app/tests/test_discover.py"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import discover, store  # noqa: E402


class DiscoverTests(unittest.TestCase):
    def setUp(self):
        self.state = store.build_state()

    def test_first_run_finds_the_new_document(self):
        run = discover.discover(self.state)
        self.assertEqual(run["sources"], 3)
        self.assertEqual(run["stats"]["new"], 1)
        self.assertEqual(run["stats"]["duplicates"], 2)
        self.assertEqual(run["discovered"], 3)
        self.assertEqual(run["errors"], [])
        self.assertEqual(len(run["new"]), 1)
        self.assertEqual(len(run["duplicates"]), 2)
        self.assertIn("Artificial Intelligence", run["new"][0]["title"])

    def test_second_run_is_all_duplicates(self):
        discover.discover(self.state)
        run = discover.discover(self.state)
        self.assertEqual(run["stats"]["new"], 0)
        self.assertEqual(run["stats"]["duplicates"], 3)
        self.assertEqual(run["discovered"], 3)
        self.assertEqual(run["new"], [])

    def test_documents_are_stored_with_hash_and_first_seen(self):
        baseline = len(self.state["documents"])
        discover.discover(self.state)
        docs = self.state["documents"]
        self.assertEqual(len(docs), baseline + 1)
        for doc in docs:
            self.assertTrue(doc["hash"])
            self.assertTrue(doc["first_seen"])
            self.assertIn(doc["status"], ("new", "processed", "prior"))

    def test_dead_feed_falls_back_to_mirror(self):
        registry = [{
            "id": "feed-dead",
            "region": "INDIA",
            "authority": "RBI",
            "name": "Dead feed",
            "feed": "http://127.0.0.1:9/never",
            "mirror": "feeds/rbi-new-2026.txt",
            "enabled": True,
            "offline": False,
        }]
        run = discover.discover(self.state, registry=registry)
        self.assertEqual(run["errors"], [])
        self.assertEqual(run["stats"]["new"], 1)
        self.assertEqual(run["new"][0]["transport"], "mirror")

    def test_disabled_source_is_skipped(self):
        registry = [{
            "id": "feed-off",
            "region": "INDIA",
            "authority": "RBI",
            "name": "Disabled feed",
            "feed": "http://127.0.0.1:9/never",
            "mirror": "feeds/rbi-new-2026.txt",
            "enabled": False,
        }]
        run = discover.discover(self.state, registry=registry)
        self.assertEqual(run["sources"], 0)
        self.assertEqual(run["stats"]["new"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
