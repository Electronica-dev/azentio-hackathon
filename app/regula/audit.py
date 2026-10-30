"""Tamper-evident audit trail: every action is hash-chained to the previous one."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_iso() -> str:
    return datetime.now(IST).replace(microsecond=0).isoformat()


def _hash(prev: str, payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256((prev + "|" + body).encode("utf-8")).hexdigest()


def add(state: dict, actor: str, action: str, entity: str, detail: str, ts: str | None = None) -> dict:
    prev = state["audit"][-1]["hash"] if state.get("audit") else "0" * 64
    event = {
        "id": f"evt-{len(state.get('audit', [])) + 1:04d}",
        "ts": ts or now_iso(),
        "actor": actor,
        "action": action,
        "entity": entity,
        "detail": detail,
    }
    event["prev_hash"] = prev
    event["hash"] = _hash(prev, event)
    state.setdefault("audit", []).append(event)
    return event


def verify(state: dict) -> dict:
    prev = "0" * 64
    for i, event in enumerate(state.get("audit", [])):
        payload = {k: event[k] for k in ("id", "ts", "actor", "action", "entity", "detail", "prev_hash")}
        expected = _hash(prev, payload)
        if event.get("prev_hash") != prev or event.get("hash") != expected:
            return {"ok": False, "checked": i, "broken_at": event.get("id")}
        prev = event["hash"]
    return {"ok": True, "checked": len(state.get("audit", [])), "head": prev[:16]}
