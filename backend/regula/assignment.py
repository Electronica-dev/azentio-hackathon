"""Level 2 workstream C — ownership and action assignment.

Writes only the ``assignment`` block nested on a recommendation
(contracts/level2-gaps.md §8). Workstream B never reads it back, so nothing
here can change a gap state or a recommendation's content.

Owners come from the ownership register, which is the people directory
(data/org/people.json, importable as CSV). A suggestion is made only when the
register identifies one person; otherwise the item is flagged for manual
assignment with the reason, and no one is invented.

Storage is B's data/level2.json, read and written under B's lock.
"""
from __future__ import annotations

import re
from datetime import date, datetime

from . import level2, org

STATUSES = ("unassigned", "assigned", "confirmed")
IMPLEMENTATION = ("not_started", "in_progress", "blocked", "done")
PRIORITIES = ("critical", "high", "medium", "low")
REVIEW_ROLES = ("reviewer", "admin")
SENIOR = re.compile(r"\b(head|chief|director|lead|manager|officer|vp|vice president|gm|general manager)\b", re.I)


class AssignmentError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def suggest(rec: dict, people: list[dict], documents: dict[str, dict]) -> dict:
    """Look the recommendation up in the register.

    Returns {"owner_id", "basis"} when exactly one person is identified,
    otherwise {"owner_id": None, "reason"} explaining why it needs a human.
    """
    target_id = (rec.get("target") or {}).get("id")
    doc = documents.get(target_id) if target_id else None
    by_name = {p["name"].strip().lower(): p for p in people if p.get("name")}

    named = (doc or {}).get("owner", "").strip()
    if named:
        person = by_name.get(named.lower())
        if person:
            return {"owner_id": person["id"], "basis": f"Named owner of {doc.get('title', 'the document')}"}

    dept = (rec.get("assignment") or {}).get("suggested_department") or "Unassigned"
    if dept == "Unassigned":
        if named:
            return {"owner_id": None, "reason": f"Document owner “{named}” is not in the people directory, and no department is recorded"}
        return {"owner_id": None, "reason": "No department could be determined for this item"}

    in_dept = [p for p in people if level2.department_of(p)[0] == dept]
    if len(in_dept) == 1:
        return {"owner_id": in_dept[0]["id"], "basis": f"Only person in {dept} in the people directory"}
    seniors = [p for p in in_dept if SENIOR.search(p.get("designation") or "")]
    if len(seniors) == 1:
        return {"owner_id": seniors[0]["id"], "basis": f"{seniors[0]['designation']}, {dept}"}
    if not in_dept:
        return {"owner_id": None, "reason": f"No one in the people directory belongs to {dept}"}
    return {"owner_id": None, "reason": f"{len(in_dept)} people in {dept} and no single head to choose — pick one"}


def apply_register(analysis_id: str | None = None) -> dict:
    """Fill owners from the register for every open draft in an analysis.

    Only touches assignments nobody has set yet: confirmed or reviewer-set
    owners are never overwritten. Returns counts for the caller.
    """
    people = org.snapshot()["people"]
    documents = {d["id"]: d for d in org.snapshot()["documents"]}
    counts = {"assigned": 0, "flagged": 0, "kept": 0}
    with level2._lock:
        data = level2._load()
        analyses = data.get("analyses", [])
        analysis = next((a for a in analyses if a["id"] == analysis_id), None) if analysis_id else (analyses[0] if analyses else None)
        if analysis is None:
            raise AssignmentError(404, "analysis not found")
        for rec in analysis.get("recommendations", []):
            current = rec.setdefault("assignment", {})
            if rec.get("status") == "rejected" or current.get("status") == "confirmed" or current.get("source") == "reviewer":
                counts["kept"] += 1
                continue
            found = suggest(rec, people, documents)
            if found["owner_id"]:
                current.update(status="assigned", owner_id=found["owner_id"], source="ownership_register",
                               basis=found["basis"], needs_manual_assignment=False, manual_reason=None)
                counts["assigned"] += 1
            else:
                current.update(status="unassigned", owner_id=None, source="none", basis=None,
                               needs_manual_assignment=True, manual_reason=found["reason"])
                counts["flagged"] += 1
        level2._save(data)
    return {"analysis_id": analysis["id"], **counts}


def update(rec_id: str, payload: dict) -> tuple[dict, str]:
    """PATCH /api/level2/recommendations/{id}/assignment. Returns (assignment, audit detail)."""
    actor = str(payload.get("actor") or "").strip()
    if not actor:
        raise AssignmentError(400, "actor is required")
    if payload.get("role") not in REVIEW_ROLES:
        raise AssignmentError(403, "only a reviewer or admin can assign owners")
    allowed = {"actor", "role", "owner_id", "due_date", "implementation_status", "priority_override", "confirm"}
    unknown = set(payload) - allowed
    if unknown:
        raise AssignmentError(400, f"not an assignment field: {', '.join(sorted(unknown))}")

    people = {p["id"]: p for p in org.snapshot()["people"]}
    if payload.get("owner_id") and payload["owner_id"] not in people:
        raise AssignmentError(400, "owner_id is not in the people directory")
    if payload.get("due_date"):
        try:
            date.fromisoformat(str(payload["due_date"]))
        except ValueError:
            raise AssignmentError(400, "due_date must be YYYY-MM-DD") from None
    if payload.get("implementation_status") not in (None, *IMPLEMENTATION):
        raise AssignmentError(400, f"implementation_status must be one of {', '.join(IMPLEMENTATION)}")
    if payload.get("priority_override") not in (None, "", *PRIORITIES):
        raise AssignmentError(400, f"priority_override must be one of {', '.join(PRIORITIES)}")

    with level2._lock:
        data = level2._load()
        try:
            _, rec = level2._locate(data, rec_id)
        except KeyError:
            raise AssignmentError(404, "recommendation not found") from None
        if rec.get("status") == "rejected":
            raise AssignmentError(409, "a rejected recommendation is not actioned")
        a = rec.setdefault("assignment", {})
        changes = []

        if "owner_id" in payload:
            owner = payload["owner_id"] or None
            if owner != a.get("owner_id"):
                a.update(owner_id=owner, source="reviewer" if owner else "none", basis=None)
                changes.append(f"owner {people[owner]['name'] if owner else 'cleared'}")
            if owner:
                if a.get("status") != "confirmed" and not changes:  # same owner: this is a confirmation
                    changes.append(f"confirmed {people[owner]['name']}")
                a.update(status="confirmed", needs_manual_assignment=False, manual_reason=None)
            else:
                a.update(status="unassigned", needs_manual_assignment=True, manual_reason="Owner cleared by reviewer",
                         implementation_status=None)
        if payload.get("confirm"):
            if not a.get("owner_id"):
                raise AssignmentError(400, "there is no owner to confirm; choose one")
            if a.get("status") != "confirmed":
                a["status"] = "confirmed"
                changes.append(f"confirmed {people.get(a['owner_id'], {}).get('name', a['owner_id'])}")
        if "due_date" in payload:
            a["due_date"] = payload["due_date"] or None
            changes.append(f"due {a['due_date'] or 'cleared'}")
        if "implementation_status" in payload and payload["implementation_status"]:
            if not a.get("owner_id"):
                raise AssignmentError(400, "assign an owner before recording implementation status")
            a["implementation_status"] = payload["implementation_status"]
            changes.append(f"status {a['implementation_status']}")
        if "priority_override" in payload:
            a["priority_override"] = payload["priority_override"] or None
            changes.append(f"priority {a['priority_override'] or 'as assessed'}")

        if a.get("status") == "confirmed" and not a.get("implementation_status"):
            a["implementation_status"] = "not_started"
        if not changes:
            raise AssignmentError(400, "nothing to change")
        a["updated_by"], a["updated_at"] = actor, _now()
        level2._save(data)
        return a, "; ".join(changes)
