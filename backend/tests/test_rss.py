"""RSS discovery tests (offline — the network is monkeypatched)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import rss  # noqa: E402

FEED = {"id": "test-feed", "authority": "RBI", "region": "INDIA", "url": "https://example.test/rss", "enabled": True}

SAMPLE = b"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <item><title>First circular</title><link>https://example.test/1</link><pubDate>Fri, 30 Oct 2026 15:15:00</pubDate></item>
  <item><title>Second circular</title><link>https://example.test/2</link><pubDate>29 Oct, 2026 +0530</pubDate></item>
</channel></rss>"""


class RssTests(unittest.TestCase):
    def test_parses_titles_links_and_both_date_formats(self):
        items = rss.parse_feed(SAMPLE, FEED)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "First circular")
        self.assertEqual(items[0]["url"], "https://example.test/1")
        self.assertEqual(items[0]["published"], "2026-10-30")
        self.assertEqual(items[1]["published"], "2026-10-29")
        self.assertEqual(items[0]["authority"], "RBI")

    def test_second_run_is_deduplicated_by_url(self):
        original = rss.fetch_feed
        rss.fetch_feed = lambda url, timeout=12: SAMPLE
        try:
            state: dict = {"documents": [], "audit": []}
            first = rss.discover(state, feeds=[FEED])
            second = rss.discover(state, feeds=[FEED])
        finally:
            rss.fetch_feed = original

        self.assertEqual(first["stats"]["new"], 2)
        self.assertEqual(first["stats"]["duplicates"], 0)
        self.assertEqual(len(state["documents"]), 2)
        self.assertEqual(second["stats"]["new"], 0)
        self.assertEqual(second["stats"]["duplicates"], 2)
        self.assertTrue(all(d["transport"] == "rss" for d in state["documents"]))

    def test_a_broken_feed_does_not_stop_the_run(self):
        original = rss.fetch_feed

        def fake(url: str, timeout: float = 12) -> bytes:
            if "bad" in url:
                raise OSError("connection refused")
            return SAMPLE

        rss.fetch_feed = fake
        try:
            bad = dict(FEED, id="bad-feed", url="https://bad.test/rss")
            run = rss.discover({"documents": [], "audit": []}, feeds=[bad, FEED])
        finally:
            rss.fetch_feed = original

        self.assertEqual(len(run["errors"]), 1)
        self.assertEqual(run["stats"]["new"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
