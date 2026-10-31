"""Internal policy and control repository — plain JSON files, stdlib only.

data/org/documents.json   uploaded internal documents (metadata; text beside the file)
data/org/assets.json      policies, controls, systems and processes the matcher scores
data/org/people.json      people directory: name, email, department, designation
data/org/files/           the uploaded files and their extracted text

assets.json is the single source of truth for the asset inventory. It is seeded
from data/inventory.json the first time it is read, and store.build_state loads
it, so assets added here take part in every later regulatory analysis.
"""
from __future__ import annotations

import csv
import io
import json
import re
import threading
import uuid
from datetime import date, datetime
from pathlib import Path

from . import upload

DATA = Path(__file__).resolve().parent.parent / "data"
ORG = DATA / "org"
FILES = ORG / "files"
SEED_INVENTORY = DATA / "inventory.json"
EXCERPT = 280

# One category per capability in the challenge brief.
CATEGORIES = {
    "policy": "Policy or SOP",
    "process": "Business process",
    "control_catalogue": "Risk & control catalogue",
    "ai_governance": "AI governance policy",
    "system_inventory": "System inventory",
    "ownership_register": "Ownership register",
}
ASSET_TYPES = ("policy", "control", "system", "process")

_lock = threading.Lock()


class OrgError(ValueError):
    pass


# ---------- storage ----------

def _path(name: str) -> Path:
    return ORG / f"{name}.json"


def _read(name: str) -> list[dict]:
    path = _path(name)
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _write(name: str, items: list[dict]) -> None:
    ORG.mkdir(parents=True, exist_ok=True)
    tmp = _path(name).with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(_path(name))


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _clean(value, limit: int = 300) -> str:
    return str(value or "").strip()[:limit]


def _seed() -> None:
    """First run: copy the demo inventory into assets.json and derive people from its owners."""
    if _path("assets").exists():
        return
    inventory = json.loads(SEED_INVENTORY.read_text(encoding="utf-8")) if SEED_INVENTORY.exists() else []
    _write("assets", inventory)
    if not _path("people").exists():
        seen: dict[str, dict] = {}
        for asset in inventory:
            name = _clean(asset.get("owner"))
            if name and name not in seen:
                seen[name] = {"id": _new_id("per"), "name": name, "email": "", "department": _clean(asset.get("team")),
                              "designation": "", "created": _now()}
        _write("people", list(seen.values()))
    if not _path("documents").exists():
        _write("documents", [])


def load_assets() -> list[dict]:
    with _lock:
        _seed()
        return _read("assets")


def snapshot() -> dict:
    with _lock:
        _seed()
        return {
            "documents": _read("documents"),
            "assets": _read("assets"),
            "people": _read("people"),
            "categories": [{"value": k, "label": v} for k, v in CATEGORIES.items()],
            "asset_types": list(ASSET_TYPES),
        }


# ---------- documents ----------

def add_documents(payload: dict, actor: str = "Organisation upload") -> list[dict]:
    """Store one or more files: {files: [{filename, content_base64}], category, department, owner, version, review_date}."""
    files = payload.get("files") or []
    if not isinstance(files, list) or not files:
        raise OrgError("no files supplied")
    category = payload.get("category") or "policy"
    if category not in CATEGORIES:
        raise OrgError(f"unknown category {category!r}")
    review_date = _clean(payload.get("review_date"), 10)
    if review_date:
        try:
            date.fromisoformat(review_date)
        except ValueError:
            raise OrgError("review_date must be YYYY-MM-DD") from None

    added = []
    FILES.mkdir(parents=True, exist_ok=True)
    for item in files:
        filename = Path(_clean(item.get("filename"), 200) or "document.txt").name
        raw = upload.decode(item.get("content_base64") or "")
        if not raw:
            raise OrgError(f"{filename} is empty")
        if len(raw) > upload.MAX_BYTES:
            raise OrgError(f"{filename} is larger than 8 MB")
        try:
            text, quality = upload.extract(filename, raw)
        except Exception:  # noqa: BLE001 - keep the file even when text extraction fails
            text, quality = "", "unreadable"
        doc_id = _new_id("doc")
        stored = FILES / f"{doc_id}-{re.sub(r'[^A-Za-z0-9._-]+', '_', filename)}"
        stored.write_bytes(raw)
        if text:
            stored.with_suffix(stored.suffix + ".txt").write_text(text, encoding="utf-8")
        added.append({
            "id": doc_id,
            "title": _clean(payload.get("title")) if len(files) == 1 and payload.get("title") else Path(filename).stem.replace("_", " "),
            "category": category,
            "department": _clean(payload.get("department"), 80),
            "owner": _clean(payload.get("owner"), 80),
            "version": _clean(payload.get("version"), 20),
            "review_date": review_date,
            "filename": filename,
            "file": stored.name,
            "bytes": len(raw),
            "words": len(text.split()),
            "quality": quality,
            "excerpt": " ".join(text.split())[:EXCERPT],
            "uploaded": _now(),
            "uploaded_by": actor,
        })
    with _lock:
        _seed()
        _write("documents", added + _read("documents"))
    return added


def delete_document(doc_id: str) -> None:
    with _lock:
        docs = _read("documents")
        doc = next((d for d in docs if d["id"] == doc_id), None)
        if not doc:
            raise KeyError(doc_id)
        _write("documents", [d for d in docs if d["id"] != doc_id])
    for path in (FILES / doc["file"], FILES / f"{doc['file']}.txt"):
        path.unlink(missing_ok=True)


# ---------- assets and people ----------

def _rows(payload: dict) -> list[dict]:
    """Accept {item: {...}}, {items: [...]} or {csv: "header,row..."}."""
    if payload.get("csv"):
        reader = csv.DictReader(io.StringIO(str(payload["csv"]).lstrip("﻿")))
        return [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader]
    if isinstance(payload.get("items"), list):
        return payload["items"]
    if isinstance(payload.get("item"), dict):
        return [payload["item"]]
    raise OrgError("send item, items or csv")


def _asset(row: dict) -> dict:
    name = _clean(row.get("name"), 160)
    if not name:
        raise OrgError("every asset needs a name")
    kind = _clean(row.get("type"), 20).lower() or "system"
    if kind not in ASSET_TYPES:
        raise OrgError(f"{name}: type must be one of {', '.join(ASSET_TYPES)}")
    try:
        criticality = max(1, min(5, int(row.get("criticality") or 3)))
    except (TypeError, ValueError):
        raise OrgError(f"{name}: criticality must be 1-5") from None
    tags = row.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r"[;,]", tags) if t.strip()]
    return {
        "id": _new_id(kind[:3]),
        "type": kind,
        "name": name,
        "owner": _clean(row.get("owner"), 80),
        "team": _clean(row.get("department") or row.get("team"), 80),
        "criticality": criticality,
        "version": _clean(row.get("version"), 20),
        "state": _clean(row.get("description") or row.get("state"), 1000),
        "gap": "",
        "params": {},
        "tags": [str(t)[:40] for t in tags][:20],
        "created": _now(),
    }


def _person(row: dict) -> dict:
    name = _clean(row.get("name"), 120)
    if not name:
        raise OrgError("every person needs a name")
    email = _clean(row.get("email"), 160)
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise OrgError(f"{name}: {email!r} is not an email address")
    return {
        "id": _new_id("per"),
        "name": name,
        "email": email,
        "department": _clean(row.get("department"), 80),
        "designation": _clean(row.get("designation") or row.get("title"), 80),
        "created": _now(),
    }


def add_assets(state: dict, payload: dict) -> list[dict]:
    """Validate every row first, then append to assets.json and the live state."""
    items = [_asset(row) for row in _rows(payload)]
    with _lock:
        _seed()
        _write("assets", _read("assets") + items)
    state.setdefault("assets", []).extend(items)
    return items


def delete_asset(state: dict, asset_id: str) -> None:
    with _lock:
        assets = _read("assets")
        if not any(a["id"] == asset_id for a in assets):
            raise KeyError(asset_id)
        _write("assets", [a for a in assets if a["id"] != asset_id])
    state["assets"] = [a for a in state.get("assets", []) if a["id"] != asset_id]


def add_people(payload: dict) -> list[dict]:
    items = [_person(row) for row in _rows(payload)]
    with _lock:
        _seed()
        people = _read("people")
        emails = {p["email"].lower() for p in people if p.get("email")}
        for person in items:
            if person["email"] and person["email"].lower() in emails:
                raise OrgError(f"{person['email']} is already in the directory")
            emails.add(person["email"].lower())
        _write("people", people + items)
    return items


def delete_person(person_id: str) -> None:
    with _lock:
        people = _read("people")
        if not any(p["id"] == person_id for p in people):
            raise KeyError(person_id)
        _write("people", [p for p in people if p["id"] != person_id])


# ---------- overview and score ----------

def _component(key: str, label: str, weight: int, value: float | None, detail: str) -> dict:
    return {"key": key, "label": label, "weight": weight,
            "score": None if value is None else round(max(0.0, min(1.0, value)) * 100), "detail": detail}


def overview(state: dict) -> dict:
    """Compliance score as a weighted average of five measurable checks.

    A check with no data yet (e.g. no documents with a review date) is left out
    and the remaining weights are rescaled, so an empty area never scores 0 or 100.
    """
    data = snapshot()
    docs, assets, people = data["documents"], data["assets"], data["people"]
    today = date.today()

    covered = {d["category"] for d in docs}
    dated = [d for d in docs if d.get("review_date")]
    current = [d for d in dated if date.fromisoformat(d["review_date"]) >= today]
    names = {p["name"].strip().lower() for p in people}
    owned = [a for a in assets if a.get("owner", "").strip().lower() in names]
    obligations = state.get("obligations", [])
    mapped = {i["obligation_id"] for i in state.get("impacts", [])}
    tasks = state.get("tasks", [])
    done = sum(1 for t in tasks if t.get("status") == "done") + 0.5 * sum(1 for t in tasks if t.get("status") == "in_progress")

    components = [
        _component("documentation", "Documentation coverage", 20, len(covered) / len(CATEGORIES),
                   f"{len(covered)} of {len(CATEGORIES)} document types on file"),
        _component("review", "Documents in date", 15, len(current) / len(dated) if dated else None,
                   f"{len(current)} of {len(dated)} documents within their review date" if dated else "No review dates set yet"),
        _component("ownership", "Assets with a known owner", 20, len(owned) / len(assets) if assets else None,
                   f"{len(owned)} of {len(assets)} assets owned by someone in the directory" if assets else "No assets yet"),
        _component("mapping", "Obligations mapped to controls", 20, len(mapped & {o['id'] for o in obligations}) / len(obligations) if obligations else None,
                   f"{len(mapped & {o['id'] for o in obligations})} of {len(obligations)} regulatory obligations mapped" if obligations else "No obligations extracted yet"),
        _component("remediation", "Remediation progress", 25, done / len(tasks) if tasks else None,
                   f"{sum(1 for t in tasks if t.get('status') == 'done')} of {len(tasks)} change tasks done" if tasks else "No change tasks yet"),
    ]
    scored = [c for c in components if c["score"] is not None]
    weight = sum(c["weight"] for c in scored)
    score = round(sum(c["score"] * c["weight"] for c in scored) / weight) if weight else None

    impacts = state.get("impacts", [])
    open_critical = sorted((i for i in impacts if i.get("severity") == "critical" and i.get("status") != "approved"),
                           key=lambda i: -i.get("score", 0))
    # One row per asset: its highest-scoring open critical gap.
    worst_per_asset: dict[str, dict] = {}
    for impact in open_critical:
        worst_per_asset.setdefault(impact.get("asset_id") or impact["id"], impact)
    sources = {s["id"]: s for s in state.get("sources", [])}
    deadlines = []
    for s in sources.values():
        try:
            days = (date.fromisoformat(s["effective"]) - today).days
        except (KeyError, TypeError, ValueError):
            continue
        if s.get("status") != "closed":
            deadlines.append({"source_id": s["id"], "title": s.get("short_title") or s["title"], "ref": s.get("ref", ""),
                              "authority": s.get("authority") or s.get("regulator") or "", "effective": s["effective"], "days_left": days})
    deadlines.sort(key=lambda d: d["days_left"])

    by_team: dict[str, int] = {}
    for t in tasks:
        if t.get("status") != "done":
            by_team[t.get("team") or "Unassigned"] = by_team.get(t.get("team") or "Unassigned", 0) + 1

    return {
        "score": score,
        "grade": None if score is None else "good" if score >= 80 else "fair" if score >= 60 else "at_risk",
        "components": components,
        "totals": {
            "documents": len(docs),
            "assets": len(assets),
            "people": len(people),
            "departments": len({p["department"] for p in people if p.get("department")} | {a["team"] for a in assets if a.get("team")}),
            "publications": len(sources),
            "open_changes": sum(1 for s in sources.values() if s.get("status") in ("new", "in_review")),
            "critical_impacts": len(open_critical),
            "open_tasks": sum(1 for t in tasks if t.get("status") != "done"),
        },
        "attention": [
            {"id": i["id"], "asset": i.get("asset_name"), "team": i.get("team"), "owner": i.get("owner"),
             "gap": i.get("gap") or i.get("rationale"), "source_id": i.get("source_id"),
             "ref": sources.get(i.get("source_id"), {}).get("ref", ""), "score": i.get("score")}
            for i in list(worst_per_asset.values())[:5]
        ],
        "deadlines": deadlines[:5],
        "open_tasks_by_team": sorted(({"team": k, "open": v} for k, v in by_team.items()), key=lambda x: -x["open"]),
        "missing_categories": [{"value": k, "label": v} for k, v in CATEGORIES.items() if k not in covered],
    }
