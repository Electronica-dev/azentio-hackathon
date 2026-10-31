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

    def test_non_directive_is_listed_but_not_ingested(self):
        original = rss.fetch_page
        rss.fetch_page = lambda url, timeout=12: b"<html><body><p>UNSC sanctions list update</p></body></html>"
        try:
            state = {
                "documents": [{
                    "id": "doc-x", "transport": "rss", "status": "new", "url": "https://x",
                    "title": "Updates to UNSC sanctions list", "authority": "RBI",
                    "region": "INDIA", "published": "2026-10-30",
                }],
                "sources": [],
                "audit": [],
            }
            out = rss.ingest_new(state, limit=1)
        finally:
            rss.fetch_page = original

        self.assertEqual(out, [])
        self.assertEqual(state["documents"][0]["status"], "reference")
        self.assertEqual(state["sources"], [])

    def test_directive_with_numbered_clauses_is_queued(self):
        page = (
            b"<html><body><p>RBI/2026-27/1</p>"
            b"<p>1. Scope</p><p>These directions apply to banks.</p>"
            b"<p>2. Definitions</p><p>Bank means a bank.</p>"
            b"<p>3. Reporting</p><p>A bank shall report monthly.</p></body></html>"
        )
        original_page, original_data = rss.fetch_page, rss.DATA
        try:
            rss.fetch_page = lambda url, timeout=12: page
            rss.DATA = APP / "data"
            try:
                doc = {
                    "id": "doc-test-queue", "transport": "rss", "status": "new", "url": "https://x",
                    "title": "Digital Lending Directions", "authority": "RBI",
                    "region": "INDIA", "published": "2026-10-30",
                }
                state = {"documents": [doc], "sources": [], "audit": []}
                out = rss.ingest_new(state, limit=1)
            finally:
                rss.fetch_page, rss.DATA = original_page, original_data

            self.assertEqual(len(out), 1)
            self.assertEqual(doc["status"], "ingested")
            target = APP / "data" / "discovered" / f"{out[0]['source_id']}.txt"
            self.assertTrue(target.exists())
            self.assertEqual(len(state["sources"]), 1)
        finally:
            target = APP / "data" / "discovered" / "src-test-queue.txt"
            target.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
