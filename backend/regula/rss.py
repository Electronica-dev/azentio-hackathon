"""RSS-based discovery for the India regulators.

Neither RBI nor SEBI offers a public JSON API for publications. Both publish
RSS feeds, which is the supported discovery surface:

    RBI  — https://rbi.org.in/notifications_rss.xml
    SEBI — https://www.sebi.gov.in/sebirss.xml

Each feed item becomes a repository document with title, link, publication
date, authority and region. Items are deduplicated by canonical URL, so a
second run reports them as duplicates rather than ingesting them again.
"""
from __future__ import annotations

import hashlib
import html
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

from . import audit
from .ingest import parse_document

DATA = Path(__file__).resolve().parent.parent / "data"
REF_RE = re.compile(r"\b(?:RBI|SEBI)/[A-Za-z0-9/\-]{4,40}")
# Not every notification is a directive: sanctions lists and press releases are
# recorded as references but never queued as an analysable source.
REGULATORY_RE = re.compile(r"direction|guideline|circular|master direction|amendment|regulation|framework", re.I)

# Configured India feeds. `enabled` lets a demo run with only one authority.
FEEDS: list[dict] = [
    {
        "id": "rbi-notifications",
        "authority": "RBI",
        "region": "INDIA",
        "name": "RBI notifications",
        "url": "https://rbi.org.in/notifications_rss.xml",
        "homepage": "https://www.rbi.org.in/",
        "enabled": True,
    },
    {
        "id": "sebi-circulars",
        "authority": "SEBI",
        "region": "INDIA",
        "name": "SEBI circulars",
        "url": "https://www.sebi.gov.in/sebirss.xml",
        "homepage": "https://www.sebi.gov.in/",
        "enabled": True,
    },
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)
TIMEOUT = 12.0


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value: str) -> str:
    """Normalise the two feed date formats to an ISO date. Empty on failure."""
    value = _clean(value)
    if not value:
        return ""
    try:
        return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError):
        pass
    for fmt in ("%d %b, %Y %z", "%d %b, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def parse_feed(raw: bytes | str, feed: dict) -> list[dict]:
    """Turn an RSS document into normalised items. Never raises on one bad item."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    root = ET.fromstring(raw)
    items: list[dict] = []
    for item in root.iter("item"):
        title = _clean(item.findtext("title"))
        link = _clean(item.findtext("link"))
        if not link:
            # Some feeds use guid as the permalink.
            link = _clean(item.findtext("guid"))
        if not title or not link:
            continue
        items.append({
            "title": title[:240],
            "url": link,
            "published": parse_date(item.findtext("pubDate") or ""),
            "authority": feed["authority"],
            "region": feed.get("region", "INDIA"),
            "feed_id": feed["id"],
        })
    items.sort(key=lambda it: it["published"], reverse=True)
    return items


def fetch_feed(url: str, timeout: float = TIMEOUT) -> bytes:
    # The RBI host intermittently answers 406 when a feed is polled quickly;
    # one short retry with a permissive Accept header is enough.
    for attempt in range(2):
        request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if attempt == 1 or exc.code not in (406, 429):
                raise
            time.sleep(1.5)


def document_id(url: str) -> str:
    return "doc-" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]


def discover(state: dict, feeds: list[dict] | None = None, actor: str = "Discovery Service") -> dict:
    """Fetch the RSS feeds and add unseen items to the repository."""
    started = time.perf_counter()
    feeds = [f for f in (feeds if feeds is not None else FEEDS) if f.get("enabled", True)]
    documents = state.setdefault("documents", [])
    known = {doc.get("url") for doc in documents if doc.get("url")}
    now = audit.now_iso()

    new: list[dict] = []
    duplicates: list[dict] = []
    errors: list[dict] = []

    for feed in feeds:
        try:
            items = parse_feed(fetch_feed(feed["url"]), feed)
        except Exception as exc:  # noqa: BLE001 - one bad feed must not stop the run
            errors.append({"id": feed["id"], "error": str(exc)[:200]})
            continue

        for item in items:
            if item["url"] in known:
                existing = next((doc for doc in documents if doc.get("url") == item["url"]), None)
                if existing:
                    existing["last_seen"] = now
                duplicates.append({"feed_id": feed["id"], "authority": item["authority"], "title": item["title"], "url": item["url"]})
                continue
            known.add(item["url"])
            document = {
                "id": document_id(item["url"]),
                "feed_id": feed["id"],
                "authority": item["authority"],
                "region": item["region"],
                "title": item["title"],
                "ref": "",
                "url": item["url"],
                "published": item["published"],
                "effective": "",
                "hash": hashlib.sha256((item["title"] + item["url"]).encode("utf-8")).hexdigest(),
                "transport": "rss",
                "first_seen": now,
                "last_seen": now,
                "processed_at": None,
                "status": "new",
            }
            documents.append(document)
            new.append(document)

    run = {
        "id": f"disc-{sum(1 for e in state.get('audit', []) if e.get('action') == 'monitor.run') + 1:03d}",
        "started": now,
        "ms": max(1, round((time.perf_counter() - started) * 1000)),
        "sources": len(feeds),
        "discovered": len(new) + len(duplicates),
        "new": [{"id": d["id"], "title": d["title"], "authority": d["authority"], "url": d["url"], "published": d["published"]} for d in new],
        "duplicates": duplicates,
        "errors": errors,
        "stats": {"discovered": len(new) + len(duplicates), "new": len(new), "duplicates": len(duplicates)},
    }
    audit.add(
        state, actor, "monitor.run", "discovery",
        f"{run['stats']['discovered']} discovered · {run['stats']['new']} new · {run['stats']['duplicates']} duplicates · {len(errors)} errors",
    )
    return run


def extract_text(raw: bytes) -> str:
    """Generic HTML → text for a publication page. Good enough to queue for review."""
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"<(script|style|noscript|nav|footer|header)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(p|div|tr|li|h[1-6]|table|section|article)>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text).replace("\ufffd", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if len(line) > 2]
    return "\n".join(lines)


def fetch_page(url: str, timeout: float = TIMEOUT) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _effective(published: str) -> tuple[str, bool]:
    """A discovered item has no effective date in the feed; keep the demo timeline positive."""
    today = date.today()
    if published:
        try:
            stated = date.fromisoformat(published)
            if stated > today:
                return stated.isoformat(), True
        except ValueError:
            pass
    return (today + timedelta(days=90)).isoformat(), True


def ingest_new(state: dict, limit: int = 3, actor: str = "Discovery Service") -> list[dict]:
    """Fetch full text for the newest discovered items and queue them as sources."""
    documents = state.get("documents", [])
    pending = [
        doc for doc in documents
        if doc.get("transport") == "rss" and doc.get("status") == "new" and not doc.get("source_id") and doc.get("url")
    ]
    pending.sort(key=lambda doc: doc.get("published") or "", reverse=True)
    out: list[dict] = []
    now = audit.now_iso()

    for doc in pending[: max(0, limit)]:
        if not REGULATORY_RE.search(doc.get("title") or ""):
            doc["status"] = "reference"
            doc["note"] = "not a directive — listed only"
            continue
        try:
            text = extract_text(fetch_page(doc["url"]))
        except Exception as exc:  # noqa: BLE001 - one bad page must not stop discovery
            doc["status"] = "error"
            doc["error"] = str(exc)[:200]
            continue
        if len(text) < 120:
            doc["status"] = "empty"
            continue

        # Drop the site chrome above the circular header.
        lines = text.splitlines()
        for index, line in enumerate(lines):
            if REF_RE.search(line):
                lines = lines[index:]
                break
        text = "\n".join(lines)
        if len(parse_document(text)) < 3:
            doc["status"] = "reference"
            doc["note"] = "no numbered clauses extracted"
            continue

        source_id = "src-" + doc["id"].removeprefix("doc-")
        target = DATA / "discovered" / f"{source_id}.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")

        match = REF_RE.search(text)
        ref = match.group(0) if match else ""
        effective, assumed = _effective(doc.get("published") or "")
        source = {
            "id": source_id,
            "regulator": doc.get("authority") or "RBI",
            "ref": ref,
            "title": doc.get("title") or "Discovered publication",
            "short_title": (doc.get("title") or "Discovered publication")[:60],
            "published": doc.get("published") or "",
            "effective": effective,
            "effective_assumed": assumed,
            "status": "new",
            "risk": "medium",
            "owner": "Unassigned",
            "region": doc.get("region") or "INDIA",
            "authority": doc.get("authority") or "RBI",
            "jurisdiction": "India",
            "doc_type": "circular",
            "url": doc.get("url"),
            "doc": f"discovered/{source_id}.txt",
            "prior_doc": None,
            "summary": text[:280].replace("\n", " "),
            "tags": [],
            "discovered_from": doc.get("feed_id"),
        }
        state.setdefault("sources", []).append(source)
        doc["status"] = "ingested"
        doc["source_id"] = source_id
        doc["processed_at"] = now
        audit.add(state, actor, "source.ingested", ref or source_id, f"{source['title']} · discovered via {doc.get('feed_id')}")
        out.append({"source_id": source_id, "title": source["title"], "chars": len(text), "url": doc["url"]})

    return out
