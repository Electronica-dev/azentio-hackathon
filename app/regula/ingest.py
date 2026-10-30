"""Ingest a regulatory document into numbered clauses, with change classification."""
from __future__ import annotations

import re
from pathlib import Path

from .text import redline, similarity, substitution_pair

TOP_RE = re.compile(r"^(\d+)\.\s+(.+)$")
REF_RE = re.compile(r"(?:Section|Clause)\s+(\d+[A-Z]?)(?:\([a-z]\))?", re.I)


def parse_document(text: str) -> list[dict]:
    """Split at sequential top-level numbering, ignoring embedded section refs."""
    lines = text.splitlines()
    clauses: list[dict] = []
    current: dict | None = None
    expected = 1
    for line in lines:
        m = TOP_RE.match(line.strip())
        if m and int(m.group(1)) == expected:
            current = {"num": str(expected), "heading": m.group(2).strip(), "body": []}
            clauses.append(current)
            expected += 1
        elif current is not None:
            current["body"].append(line)
    for c in clauses:
        c["text"] = (c["heading"] + "\n" + "\n".join(c["body"])).strip()
        c["body"] = "\n".join(c["body"]).strip()
    return clauses


def parse_prior(text: str) -> dict[str, str]:
    """Prior versions are sparse (only amended sections), so match any number."""
    found = list(re.finditer(r"^(\d+)\.\s+(.+)$", text, re.M))
    out: dict[str, str] = {}
    for i, m in enumerate(found):
        end = found[i + 1].start() if i + 1 < len(found) else len(text)
        out[m.group(1)] = text[m.start():end].strip()
    return out


def subject_of(heading: str) -> str:
    if "—" in heading:
        return heading.split("—", 1)[1].strip()
    if "–" in heading:
        return heading.split("–", 1)[1].strip()
    cleaned = re.sub(
        r"^(Amendment to|Insertion of new|Omission of)\s+(Section|Clause)\s+\S+\s*",
        "", heading, flags=re.I,
    )
    return cleaned.strip() or heading


def _substantive(body: str) -> str:
    """Start at the substituted section if the amendment embeds one."""
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if re.match(r"^\d+[A-Z]?\.\s", line.strip()):
            return "\n".join(lines[i:]).strip()
    return body.strip()


def _prior_body(text: str) -> str:
    lines = text.splitlines()
    if lines and re.match(r"^\d+[A-Z]?\.\s", lines[0].strip()):
        return "\n".join(lines[1:]).strip()
    return text.strip()


def build_clauses(source: dict, doc_text: str, prior_text: str | None) -> list[dict]:
    prior = parse_prior(prior_text) if prior_text else {}
    out: list[dict] = []
    for c in parse_document(doc_text):
        m = REF_RE.search(c["heading"])
        prior_key = m.group(1) if m else None
        before = prior.get(prior_key, "") if prior_key else ""
        pair = substitution_pair(c["text"])
        lower = c["heading"].lower()
        if prior_key and prior_key in prior and "omission" in lower:
            change = "removed"
        elif not before:
            change = "added"
        else:
            change = "modified" if similarity(before, c["text"]) < 0.985 else "unchanged"

        summary = ""
        if pair:
            summary = f"Replaces “{pair[0]}” with “{pair[1]}”."
        elif change == "added":
            summary = "New requirement introduced by this amendment."
        elif change == "removed":
            summary = "Existing provision omitted; current exemption must be withdrawn."
        elif change == "modified":
            summary = "Provision substituted; compare the redline for changed thresholds and duties."

        out.append({
            "id": f"{source['id']}#c{c['num']}",
            "source_id": source["id"],
            "num": c["num"],
            "heading": c["heading"],
            "subject": subject_of(c["heading"]),
            "section_ref": f"Section {prior_key}" if prior_key else f"Clause {c['num']}",
            "text": c["text"],
            "body": c["body"],
            "change_type": change,
            "previous_text": before,
            "redline": redline(_prior_body(before), _substantive(c["body"])) if change in ("modified", "removed") else [],
            "summary": summary,
            "substitution": list(pair) if pair else None,
        })
    return out
