"""Discover new regulatory publications from configured India sources.

Fetch each enabled feed with a short timeout; on any failure fall back to the
offline mirror in app/data/. Dedupe by content hash so a second run reports the
same documents as duplicates instead of ingesting them again.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from . import audit

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY = DATA_DIR / "regulators.json"
TIMEOUT = 3.0
MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}
DATE_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b"
)
REF_RE = re.compile(r"\b([A-Z][A-Za-z]{1,}\s*/[\d]{4}-[\d]{2}/[A-Za-z0-9/\-]+)")


def load_registry() -> list[dict]:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _read_mirror(name: str) -> str:
    return (DATA_DIR / name).read_text(encoding="utf-8")


def _fetch(entry: dict) -> tuple[str, str]:
    """Return (text, transport). Never raises."""
    # Registries mark offline:true for a deterministic demo. REGULA_OFFLINE=0
    # forces the real HTTP fetch + 3 s timeout path even for those entries.
    force_online = os.environ.get("REGULA_OFFLINE", "1") == "0"
    if force_online or not entry.get("offline", False):
        try:
            req = urllib.request.Request(entry["feed"], headers={"User-Agent": "Regula/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            if text.strip():
                return text, "http"
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            pass
    return _read_mirror(entry["mirror"]), "mirror"


def _date_iso(line: str) -> str:
    m = DATE_RE.search(line)
    if not m:
        return ""
    try:
        return datetime(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))).date().isoformat()
    except ValueError:
        return ""


def _metadata(text: str, fallback: str) -> tuple[str, str, str]:
    """Return (title, ref, published) from the document header. Best effort."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    ref = ""
    for line in lines[:6]:
        m = REF_RE.search(line)
        if m:
            ref = m.group(1)
            break
    published = ""
    for i, line in enumerate(lines):
        published = _date_iso(line)
        if not published:
            continue
        title_parts: list[str] = []
        for nxt in lines[i + 1:]:
            title_parts.append(nxt)
            if len(title_parts) == 2:
                break
        title = " ".join(title_parts).strip() or fallback
        return title[:160], ref, published
    return fallback, ref, published


def _seen_hashes(state: dict) -> set[str]:
    return {d.get("hash") for d in state.get("documents", []) if d.get("hash")}


def discover(state: dict, registry: list[dict] | None = None, actor: str = "Discovery Service") -> dict:
    """Scan configured sources. Returns run stats; mutates state['documents']."""
    t0 = time.perf_counter()
    registry = registry if registry is not None else load_registry()
    docs = state.setdefault("documents", [])
    seen = _seen_hashes(state)
    now = audit.now_iso()

    found: list[dict] = []
    duplicates: list[dict] = []
    errors: list[dict] = []

    for entry in registry:
        if not entry.get("enabled", True):
            continue
        try:
            text, transport = _fetch(entry)
        except Exception as exc:  # noqa: BLE001 - one bad source must not stop the run
            errors.append({"id": entry.get("id"), "error": str(exc)})
            continue

        digest = content_hash(text)
        if digest in seen:
            existing = next((d for d in docs if d.get("hash") == digest), None)
            if existing:
                existing["last_seen"] = now
            duplicates.append({
                "id": entry.get("id"),
                "authority": entry.get("authority"),
                "document_id": existing.get("id") if existing else None,
                "transport": transport,
            })
            continue

        seen.add(digest)
        title, ref, published = _metadata(text, entry.get("name", "Untitled regulatory document"))
        document = {
            "id": f"doc-{digest[:12]}",
            "feed_id": entry.get("id"),
            "authority": entry.get("authority"),
            "region": entry.get("region", "INDIA"),
            "title": title,
            "ref": ref,
            "published": published,
            "effective": "",
            "hash": digest,
            "transport": transport,
            "first_seen": now,
            "last_seen": now,
            "processed_at": None,
            "status": "new",
        }
        docs.append(document)
        found.append(document)

    prior_runs = sum(1 for e in state.get("audit", []) if e.get("action") == "monitor.run")
    run = {
        "id": f"disc-{prior_runs + 1:03d}",
        "started": now,
        "ms": max(1, round((time.perf_counter() - t0) * 1000)),
        "sources": sum(1 for e in registry if e.get("enabled", True)),
        "discovered": len(found) + len(duplicates),
        "new": [
            {"id": d["id"], "title": d["title"], "authority": d["authority"], "transport": d["transport"]}
            for d in found
        ],
        "duplicates": duplicates,
        "errors": errors,
        "stats": {
            "discovered": len(found) + len(duplicates),
            "new": len(found),
            "duplicates": len(duplicates),
        },
    }
    audit.add(
        state, actor, "monitor.run", "discovery",
        f"{run['stats']['discovered']} discovered · {run['stats']['new']} new · {run['stats']['duplicates']} duplicates · {len(errors)} errors",
    )
    return run
