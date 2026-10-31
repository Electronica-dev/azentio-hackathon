"""Classify clause-level regulatory changes into seven classes.

Rules first: numbers, then explicit amendment language, then text similarity.
Every change carries a one-sentence plain-English significance.
"""
from __future__ import annotations

import re

from .text import similarity, words_to_int

NUM_RE = re.compile(
    r"([A-Za-z\-]+)\s+(?:calendar\s+)?(days?|months?|years?|hours?|per\s+cent)", re.I
)

CLASSES = (
    "new_obligation",
    "modified",
    "withdrawn",
    "deadline_extended",
    "deadline_shortened",
    "clarification",
    "no_material_change",
)


def _numbers(text: str) -> list[tuple[int, str]]:
    out = []
    for m in NUM_RE.finditer(text or ""):
        value = words_to_int(m.group(1))
        if value is not None:
            out.append((value, m.group(2).lower().replace(" ", "_")))
    return out


def _first_deadline(text: str) -> tuple[int, str] | None:
    """A deadline is a number tied to within/every, not a percentage."""
    low = (text or "").lower()
    if "within" not in low and "every" not in low:
        return None
    for value, unit in _numbers(text):
        if unit in ("days", "day", "months", "month", "years", "year", "hours", "hour"):
            return value, unit
    return None


def _phrase(old: tuple[int, str] | None, new: tuple[int, str] | None) -> str:
    if not old or not new:
        return "Wording changed without a numeric change."
    return f"Requirement moves from {old[0]} to {new[0]} {new[1]}."


def classify(clause: dict) -> dict:
    """Return {change_class, significance} for one clause."""
    change_type = clause.get("change_type", "unchanged")
    before = clause.get("previous_text", "") or ""
    after = clause.get("text", "") or ""
    low = after.lower()

    if change_type == "removed" or "is omitted" in low or "are omitted" in low:
        return {
            "change_class": "withdrawn",
            "significance": "The earlier provision is withdrawn, so the bank must stop relying on it and unwind any process built on it.",
        }

    if change_type == "added" and not before:
        return {
            "change_class": "new_obligation",
            "significance": "This is a new requirement with no earlier equivalent, so a new policy, control or process is needed.",
        }

    if change_type == "unchanged":
        return {
            "change_class": "no_material_change",
            "significance": "No change to the obligation; the text is carried over or renumbered only.",
        }

    old_deadline = _first_deadline(before)
    new_deadline = _first_deadline(after)
    if old_deadline and new_deadline and old_deadline[0] != new_deadline[0]:
        extended = new_deadline[0] > old_deadline[0]
        return {
            "change_class": "deadline_extended" if extended else "deadline_shortened",
            "significance": _phrase(old_deadline, new_deadline)
            + (" Compliance has more time, so the internal timeline can be relaxed." if extended else " Compliance has less time, so the internal timeline must be brought forward."),
        }

    if _numbers(before) != _numbers(after):
        return {
            "change_class": "modified",
            "significance": _phrase(_first_deadline(before), _first_deadline(after))
            + " The threshold or parameter changes, so configured values and controls must be updated.",
        }

    ratio = similarity(before, after) if before else 0.0
    if ratio >= 0.985:
        return {
            "change_class": "no_material_change",
            "significance": "Text is essentially identical; the change is formatting or renumbering.",
        }
    if ratio >= 0.90:
        return {
            "change_class": "clarification",
            "significance": "Wording is clarified without adding a new duty; check that policies quote the current text.",
        }
    return {
        "change_class": "modified",
        "significance": "The obligation is rewritten; compare the redline and update the affected policy and control language.",
    }


def build_changes(state: dict) -> list[dict]:
    """Classify every changed clause and attach document context."""
    sources = {s["id"]: s for s in state.get("sources", [])}
    documents = state.get("documents", [])
    doc_by_file = {d.get("doc"): d for d in documents if d.get("doc")}
    out: list[dict] = []

    for clause in state.get("clauses", []):
        if clause.get("change_type") == "unchanged":
            continue
        source = sources.get(clause.get("source_id"), {})
        relationship = source.get("relationship") or {}
        prior_file = source.get("prior_doc")
        prior_doc = doc_by_file.get(prior_file) if prior_file else None
        if not prior_doc and relationship.get("prior_document_id"):
            prior_doc = next(
                (d for d in documents if str(d.get("id")) == str(relationship["prior_document_id"])),
                None,
            )
        own_doc = doc_by_file.get(source.get("doc")) if source.get("doc") else None
        document_id = own_doc.get("id") if own_doc else clause.get("document_id") or source.get("id")
        verdict = classify(clause)

        if prior_doc:
            link = "linked"
        elif relationship.get("status") == "proposed":
            # Surfaced as a question, not silently treated as standalone.
            link = "proposed"
        else:
            link = "unresolved"
        confidence = float(relationship.get("confidence", 0.9 if prior_doc else 0.2))

        out.append({
            "id": f"chg-{clause['id']}",
            "document_id": document_id,
            "document_title": source.get("title", ""),
            "authority": source.get("regulator", ""),
            "region": source.get("region", "INDIA"),
            "clause_id": clause["id"],
            "clause_num": clause.get("num"),
            "section_ref": clause.get("section_ref", ""),
            "subject": clause.get("subject", ""),
            "change_type": clause.get("change_type"),
            "change_class": verdict["change_class"],
            "significance": verdict["significance"],
            "previous_text": clause.get("previous_text", ""),
            "text": clause.get("text", ""),
            "redline": clause.get("redline", []),
            "prior_document_id": prior_doc.get("id") if prior_doc else None,
            "relationship": link,
            "confidence": round(confidence, 2),
            "relationship_rationale": relationship.get("rationale", ""),
            "relationship_signals": relationship.get("signals", []),
        })
    return out


def summary(changes: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for change in changes:
        counts[change["change_class"]] = counts.get(change["change_class"], 0) + 1
    return {
        "total": len(changes),
        "by_class": counts,
        "unresolved": sum(1 for c in changes if c["relationship"] == "unresolved"),
        "proposed": sum(1 for c in changes if c["relationship"] == "proposed"),
    }
