"""Level 2 — regulatory obligations to internal clauses, gaps, and draft fixes.

Deterministic and evidence-bound:

    obligation -> candidate documents -> best chunks -> Mapping
               -> required elements vs chunk text -> Gap
               -> missing elements -> draft Recommendation

No model call is required. Every mapping carries the obligation quote and the
internal quote it was judged against; every recommendation cites its clause.
A gap with no evidence is ``cannot_assess``, never a guess.

Storage: ``data/level2.json`` (analyses with their mappings, gaps and drafts).
The audit events live in the main state and stay hash-chained.
"""
from __future__ import annotations

import json
import math
import re
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

from . import audit, chunks, enrich, org

DATA = Path(__file__).resolve().parent.parent / "data"
DB = DATA / "level2.json"
ENGINE_VERSION = "level2-1"

MAPPING_FLOOR = 0.16     # chunk cosine needed to become a mapping
CANDIDATE_FLOOR = 0.10   # document cosine needed to be "searched"
MAX_DOCS = 3             # documents assessed per obligation
MAX_MAPPINGS = 3         # clause mappings kept per document
MAX_POLISH = 6           # drafts rewritten by the optional model per run
EDITED = ("title", "proposed_text", "implementation_notes", "priority", "acceptance_criteria", "business_area")

_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Department enum (contract §4) — A's raw labels collapse into this closed set
# ---------------------------------------------------------------------------
_DEPARTMENTS = {
    "compliance": "Compliance", "compliance tech": "Compliance",
    "legal": "Legal", "company secretary": "Legal",
    "risk": "Risk", "risk tech": "Risk",
    "finance": "Finance", "finance tech": "Finance",
    "operations": "Operations", "customer service": "Operations",
    "technology": "Technology", "it": "Technology", "integrations": "Technology",
    "core banking": "Technology", "security": "Technology",
    "lending": "Business", "digital": "Business", "digital banking": "Business",
}


def department_of(doc: dict) -> tuple[str, str]:
    """Return (enum value, raw label)."""
    raw = str(doc.get("department") or doc.get("team") or "").strip()
    return _DEPARTMENTS.get(raw.lower(), "Unassigned"), raw


# ---------------------------------------------------------------------------
# Text features
# ---------------------------------------------------------------------------
_STOP = set("""
a an the and or of to in for on by with from is are was were be been being shall must may
should such any every all where which who whom whose this that these those it its as at not
no than then there their they them we our you your more most other into within without under
over between during after before upon period person persons entity entities regulated customer
customers bank banks provided however namely case said same herein hereof thereto
""".split())
_TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall((text or "").lower()) if t not in _STOP]


class _Index:
    """TF-IDF over internal chunks, built per analysis."""

    def __init__(self, texts: list[str]):
        self.n = len(texts)
        df: Counter = Counter()
        for text in texts:
            df.update(set(_tokens(text)))
        self.idf = {w: math.log((self.n + 1) / (c + 1)) + 1 for w, c in df.items()}
        self._cache: dict[str, dict[str, float]] = {}

    def vec(self, text: str) -> dict[str, float]:
        cached = self._cache.get(text)
        if cached is not None:
            return cached
        counter = Counter(_tokens(text))
        raw = {t: (1 + math.log(c)) * self.idf.get(t, math.log(self.n + 1) + 1)
               for t, c in counter.items()}
        norm = math.sqrt(sum(v * v for v in raw.values())) or 1.0
        vector = {t: v / norm for t, v in raw.items()}
        self._cache[text] = vector
        return vector

    def cosine(self, a: dict[str, float], b: dict[str, float]) -> float:
        if len(a) > len(b):
            a, b = b, a
        return sum(v * b.get(t, 0.0) for t, v in a.items())


# ---------------------------------------------------------------------------
# Required elements: what the obligation actually asks for
# ---------------------------------------------------------------------------
_ELEMENTS = (
    ("human_review", "human review of automated decisions",
     r"human review|manual review|reviewed by a natural person|reviewer|human oversight"),
    ("audit_trail", "audit trail and record retention",
     r"audit trail|audit log|logged|retained|retention|records shall be kept"),
    ("explainability", "explanation of automated decisions",
     r"explainab|model card|factors that influence|reasons for"),
    ("reporting", "reporting to the regulator or board",
     r"\breport(?:ing|ed)?\b|furnish|notify"),
    ("governance", "board or committee approval",
     r"\bboard\b|committee|approved by"),
    ("consent", "customer consent",
     r"\bconsent\b|opt[- ]in|revoc"),
)


def _required_elements(obligation: dict) -> list[dict]:
    text = f"{obligation.get('statement', '')} {' '.join(obligation.get('tags') or [])}".lower()
    required = [
        {"key": key, "label": label, "pattern": pattern}
        for key, label, pattern in _ELEMENTS
        if re.search(pattern, text)
    ]
    if obligation.get("deadline"):
        required.append({"key": "deadline", "label": "stated compliance deadline",
                         "pattern": r"within|every|not less than|by\s+\d"})
    if obligation.get("params"):
        required.append({"key": "parameter", "label": "configured numeric threshold",
                         "pattern": r"\d|per cent|months|days|years"})
    return required


def _matched_elements(required: list[dict], text: str) -> tuple[list[str], list[str]]:
    low = (text or "").lower()
    matched, missing = [], []
    for element in required:
        (matched if re.search(element["pattern"], low) else missing).append(element["label"])
    return matched, missing


def _core_coverage(obligation: dict, text: str) -> float:
    """Fallback when the obligation has no recognisable element."""
    wanted = set(_tokens(obligation.get("statement", ""))[:8])
    if not wanted:
        return 0.0
    have = set(_tokens(text))
    return len(wanted & have) / len(wanted)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def _tag_overlap(obligation: dict, chunk: dict) -> float:
    tags = {t.lower() for t in (obligation.get("tags") or [])}
    if not tags:
        return 0.0
    have = set(_tokens(f"{chunk.get('heading', '')} {chunk.get('text', '')}"))
    return len(tags & have) / min(len(tags), 5)


def _doc_type(doc: dict) -> str:
    return str(doc.get("doc_type") or doc.get("category") or "policy")


def _target_kind(doc_type: str) -> str:
    return {
        "process": "process",
        "control_catalogue": "control",
        "system_inventory": "system",
    }.get(doc_type, "policy")


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
def analyse(state: dict, payload: dict, actor: str = "Regula Agent",
            documents: list[dict] | None = None,
            chunk_corpus: list[dict] | None = None,
            use_llm: bool | None = None) -> dict:
    """Run one analysis. ``documents``/``chunk_corpus`` are injectable for tests."""
    if use_llm is None:
        requested = (payload.get("options") or {}).get("use_llm")
        use_llm = enrich.is_configured() if requested is None else bool(requested)
    obligations = _scope_obligations(state, payload)
    if not obligations:
        raise ValueError("no obligations in scope")

    documents = documents if documents is not None else org.snapshot().get("documents", [])
    chunk_corpus = chunk_corpus if chunk_corpus is not None else chunks.load_chunks()

    by_doc: dict[str, list[dict]] = {}
    for chunk in chunk_corpus:
        by_doc.setdefault(chunk["document_id"], []).append(chunk)

    indexed = [d for d in documents if by_doc.get(d["id"])]
    excluded = [
        {"document_id": d.get("id"), "title": d.get("title", ""),
         "reason": "no extracted text" if not by_doc.get(d.get("id")) else "not indexed"}
        for d in documents if not by_doc.get(d.get("id"))
    ]

    index = _Index([c["text"] for c in chunk_corpus]) if chunk_corpus else _Index([])
    analysis_id = _next_id("an")
    created = _now()

    mappings: list[dict] = []
    gaps: list[dict] = []
    recommendations: list[dict] = []

    for obligation in obligations:
        required = _required_elements(obligation)
        obligation_vec = index.vec(f"{obligation.get('statement', '')} {' '.join(obligation.get('tags') or [])}")

        scored_docs = []
        for doc in indexed:
            best = 0.0
            best_chunk = None
            for chunk in by_doc[doc["id"]]:
                score = 0.8 * index.cosine(obligation_vec, index.vec(chunk["text"])) + 0.2 * _tag_overlap(obligation, chunk)
                if score > best:
                    best, best_chunk = score, chunk
            scored_docs.append((best, doc, best_chunk))
        scored_docs.sort(key=lambda item: -item[0])

        candidates = [item for item in scored_docs[:MAX_DOCS] if item[0] >= CANDIDATE_FLOOR]
        if not candidates:
            gap = _cannot_assess(analysis_id, obligation, required, [d for _, d, _ in scored_docs[:3]])
            recommendation = _recommend(analysis_id, obligation, {}, None, gap,
                                        gap["what_is_missing"], required, "cannot_assess", state)
            gap["recommendation_ids"] = [recommendation["id"]]
            gaps.append(gap)
            recommendations.append(recommendation)
            continue

        for doc_score, doc, best_chunk in candidates:
            doc_maps, doc_missing = _mappings(analysis_id, obligation, doc, by_doc[doc["id"]],
                                              required, index, obligation_vec)
            mappings.extend(doc_maps)

            covers = [m for m in doc_maps if m["relation"] in ("addresses", "partially_addresses")]
            if doc_maps and not doc_missing:
                gap_state = "addressed"
                confidence = 0.9
                missing = []
            elif covers:
                gap_state = "partially_addressed"
                confidence = round(min(0.92, 0.45 + 0.1 * len(covers) + 0.2 * doc_score), 2)
                missing = doc_missing
            else:
                gap_state = "not_addressed"
                confidence = round(0.45 + 0.3 * doc_score, 2)
                missing = [e["label"] for e in required] or ["a documented control for this requirement"]

            gap = {
                "id": f"gap-{analysis_id}-{_slug(obligation['id'])}-{_slug(doc['id'])}",
                "analysis_id": analysis_id,
                "obligation_id": obligation["id"],
                "obligation_ref": obligation.get("section_ref", ""),
                "internal_document_id": doc["id"],
                "internal_title": doc.get("title", ""),
                "doc_type": _doc_type(doc),
                "department": department_of(doc)[0],
                "business_area": doc.get("business_area") or "",
                "state": gap_state,
                "summary": _summary(gap_state, missing, doc),
                "what_is_missing": missing,
                "why_insufficient": _why(gap_state, missing, obligation, doc, best_chunk),
                "mapping_ids": [m["id"] for m in doc_maps],
                "recommendation_ids": [],
                "confidence": confidence,
                "confidence_basis": (
                    f"matched {len(required) - len(missing)} of {len(required)} required elements"
                    if required else "no explicit elements; topical overlap only"
                ),
                "method": "rule",
                "search_scope": {
                    "documents_searched": [d["id"] for _, d, _ in candidates],
                    "terms": _tokens(obligation.get("statement", ""))[:8],
                    "excluded": [e["document_id"] for e in excluded],
                },
                "needs_review": gap_state in ("cannot_assess", "partially_addressed") or confidence < 0.5,
                "assessed_at": created,
            }

            if gap_state != "addressed":
                recommendation = _recommend(analysis_id, obligation, doc, best_chunk,
                                            gap, missing, required, gap_state, state)
                recommendations.append(recommendation)
                gap["recommendation_ids"] = [recommendation["id"]]
            gaps.append(gap)

    polished, polish_failed = _polish(recommendations, gaps, use_llm)

    analysis = {
        "id": analysis_id,
        "status": "partial" if use_llm and polish_failed else "complete",
        "generated_at": created,
        "engine_version": ENGINE_VERSION,
        "regulatory_scope": payload.get("regulatory_source_id") and [payload["regulatory_source_id"]]
                            or [o["source_id"] for o in obligations],
        "internal_scope": [d["id"] for d in indexed],
        "excluded": excluded,
        "counts": {
            "obligations": len(obligations),
            "mappings": len(mappings),
            "gaps": _counts(g["state"] for g in gaps),
            "recommendations": _counts(r["kind"] for r in recommendations),
            "polished": polished,
        },
        "mappings": mappings,
        "gaps": gaps,
        "recommendations": recommendations,
    }

    with _lock:
        data = _load()
        data["analyses"].insert(0, analysis)
        _save(data)

    audit.add(state, actor, "level2.analysis.completed", analysis_id,
              f"{len(obligations)} obligations → {len(mappings)} mappings → {len(gaps)} gaps "
              f"→ {len(recommendations)} drafts")
    return analysis


def _polish(recommendations: list[dict], gaps: list[dict], use_llm: bool) -> tuple[int, int]:
    """Rewrite drafts with the optional model; keep the rule text for audit.

    A failure leaves the deterministic wording in place and marks the run
    ``partial``. The model never changes the gap state, the clause, or the
    draft status.
    """
    if not use_llm:
        return 0, 0
    targets = [r for r in recommendations if r["kind"] == "compliance_change"][:MAX_POLISH]
    if not targets:
        return 0, 0
    by_id = {g["id"]: g for g in gaps}

    def refine(rec: dict) -> str | None:
        gap = by_id.get((rec.get("gap_ids") or [""])[0], {})
        return enrich.polish_text({
            "obligation": rec["regulatory_clause"]["quote"] or rec["rationale"],
            "section_ref": rec["regulatory_clause"]["section_ref"],
            "document": rec["target"]["title"],
            "ref": rec["target"]["ref"],
            "missing": gap.get("what_is_missing", []),
            "business_area": rec["business_area"],
            "current": rec["proposed_text"],
        })

    polished = failed = 0
    with ThreadPoolExecutor(max_workers=min(4, len(targets))) as pool:
        for rec, text in zip(targets, pool.map(refine, targets)):
            if text:
                rec["rule_text"] = rec["proposed_text"]
                rec["proposed_text"] = text
                rec["method"] = "llm"
                polished += 1
            else:
                failed += 1
    return polished, failed


def _scope_obligations(state: dict, payload: dict) -> list[dict]:
    all_obligations = state.get("obligations", [])
    ids = payload.get("obligation_ids")
    if isinstance(ids, list) and ids:
        wanted = {str(i) for i in ids}
        return [o for o in all_obligations if o["id"] in wanted]
    source = payload.get("regulatory_source_id")
    if source:
        return [o for o in all_obligations if o.get("source_id") == source]
    return list(all_obligations)


def _mappings(analysis_id: str, obligation: dict, doc: dict, doc_chunks: list[dict],
              required: list[dict], index: _Index, obligation_vec: dict) -> tuple[list[dict], list[str]]:
    scored = []
    for chunk in doc_chunks:
        score = 0.8 * index.cosine(obligation_vec, index.vec(chunk["text"])) + 0.2 * _tag_overlap(obligation, chunk)
        if score >= MAPPING_FLOOR:
            scored.append((score, chunk))
    scored.sort(key=lambda item: -item[0])
    scored = scored[:MAX_MAPPINGS]

    mappings: list[dict] = []
    covered: set[str] = set()
    for score, chunk in scored:
        matched, chunk_missing = _matched_elements(required, chunk["text"])
        if not required:
            coverage = _core_coverage(obligation, chunk["text"])
            matched = ["topical overlap"] if coverage >= 0.5 else []
            chunk_missing = [] if coverage >= 0.5 else ["direct wording of the requirement"]
        if required and not chunk_missing:
            relation = "addresses"
        elif matched:
            relation = "partially_addresses"
        else:
            relation = "references"
        covered.update(matched)
        mappings.append({
            "id": f"map-{analysis_id}-{_slug(obligation['id'])}-{_slug(chunk['id'])}",
            "analysis_id": analysis_id,
            "obligation_id": obligation["id"],
            "obligation_ref": obligation.get("section_ref", ""),
            "obligation_quote": obligation.get("quote", ""),
            "internal": {
                "document_id": doc["id"],
                "chunk_id": chunk["id"],
                "ref": chunk.get("ref", ""),
                "title": doc.get("title", ""),
                "doc_type": _doc_type(doc),
                "department": department_of(doc)[0],
                "business_area": doc.get("business_area") or "",
            },
            "level": "clause",
            "relation": relation,
            "reason": _mapping_reason(relation, matched, chunk_missing, chunk),
            "internal_quote": chunk["text"][:400],
            "confidence": round(min(0.95, 0.5 + 0.4 * score + 0.05 * len(matched)), 2),
            "confidence_basis": f"clause similarity {score:.2f}; {len(matched)} matched element(s)",
            "method": "rule",
            "evidence": [
                {"kind": "obligation", "ref": obligation.get("section_ref", ""),
                 "quote": (obligation.get("quote") or "")[:400]},
                {"kind": "internal", "ref": chunk.get("ref", ""), "quote": chunk["text"][:400]},
            ],
            "reviewed": False,
            "created_at": _now(),
        })
    missing = [e["label"] for e in required if e["label"] not in covered]
    return mappings, missing


def _mapping_reason(relation: str, matched: list[str], missing: list[str], chunk: dict) -> str:
    ref = chunk.get("ref") or "the matched section"
    if relation == "addresses":
        return f"{ref} covers every required element: {', '.join(matched)}."
    if relation == "partially_addresses":
        return f"{ref} covers {', '.join(matched)} but not {', '.join(missing)}."
    return f"{ref} refers to the subject but establishes none of the required elements."


def _summary(state: str, missing: list[str], doc: dict) -> str:
    if state == "addressed":
        return f"{doc.get('title', 'The document')} addresses every required element."
    if state == "partially_addressed":
        return f"{doc.get('title', 'The document')} covers part of the requirement; missing: {', '.join(missing)}."
    if state == "not_addressed":
        return f"{doc.get('title', 'The document')} does not address the requirement."
    return "There is not enough internal evidence to assess this requirement."


def _why(state: str, missing: list[str], obligation: dict, doc: dict, chunk: dict | None) -> str:
    subject = obligation.get("statement", "")[:140].rstrip(".")
    if state == "partially_addressed":
        return (f"The requirement asks for {subject}. The matched section covers only part of it; "
                f"no internal text establishes: {', '.join(missing)}.")
    if state == "not_addressed":
        near = f" The closest section is {chunk.get('ref')}, which does not establish the requirement." if chunk else ""
        return f"No section of {doc.get('title')} establishes: {', '.join(missing)}.{near}"
    return f"No internal document covers: {subject}."


def _cannot_assess(analysis_id: str, obligation: dict, required: list[dict],
                   nearby: list[dict]) -> dict:
    return {
        "id": f"gap-{analysis_id}-{_slug(obligation['id'])}-none",
        "analysis_id": analysis_id,
        "obligation_id": obligation["id"],
        "obligation_ref": obligation.get("section_ref", ""),
        "internal_document_id": None,
        "internal_title": "No matching internal document",
        "department": "Unassigned",
        "business_area": "",
        "state": "cannot_assess",
        "summary": "No indexed internal document is relevant enough to assess this requirement.",
        "what_is_missing": [e["label"] for e in required] or ["an internal document covering this requirement"],
        "why_insufficient": (f"No internal document scored above the candidate floor. "
                             f"Provide a policy, SOP or control covering: {obligation.get('statement', '')[:120]}."),
        "mapping_ids": [],
        "recommendation_ids": [],
        "confidence": 0.15,
        "confidence_basis": "no candidate document above the floor",
        "method": "rule",
        "search_scope": {
            "documents_searched": [d.get("id") for d in nearby],
            "terms": _tokens(obligation.get("statement", ""))[:8],
            "excluded": [],
        },
        "needs_review": True,
        "assessed_at": _now(),
    }


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------
_CRITERIA = {
    "human_review": "a reviewer identity and timestamp recorded for every automatically rejected application",
    "audit_trail": "an audit-trail entry showing the decision, the reviewer and the timestamp",
    "explainability": "a model card or equivalent record documenting the factors behind the decision",
    "reporting": "a filed report with the regulator or board, within the stated deadline",
    "governance": "minutes showing board or committee approval",
    "consent": "a recorded consent artefact that can be produced on request",
    "deadline": "a dated control showing the requirement is met within the stated period",
    "parameter": "a configured value and a test showing it matches the required threshold",
}


def _recommend(analysis_id: str, obligation: dict, doc: dict, chunk: dict | None,
               gap: dict, missing: list[str], required: list[dict],
               gap_state: str, state: dict) -> dict:
    is_evidence = gap_state == "cannot_assess"
    key = _missing_key(missing, required)
    ref = chunk.get("ref", "") if chunk else ""
    title = (f"Provide evidence for {obligation.get('section_ref', 'the requirement')}"
             if is_evidence else
             f"Add {missing[0] if missing else 'the requirement'} to {doc.get('title', 'the policy')}")
    title = title[:100]

    if is_evidence:
        proposed = (f"Provide the internal document that establishes the following requirement, "
                    f"or confirm that no control exists: {obligation.get('statement', '').rstrip('.')}.")
        change_type = "evidence_request"
        kind = "evidence_request"
        target = {"kind": "policy", "id": None, "ref": "", "title": "No matching internal document"}
    else:
        clause = f"{doc.get('title', 'the policy')}" + (f" §{ref}" if ref else "")
        criterion = _CRITERIA.get(key, "a documented procedure and a sample of evidence")
        proposed = (f"Amend {clause} to add the following requirement: "
                    f"{obligation.get('statement', '').rstrip('.')}. "
                    f"Evidence shall be {criterion}.")
        change_type = _change_type(key)
        kind = "compliance_change"
        target = {"kind": _target_kind(_doc_type(doc)), "id": doc["id"], "ref": ref,
                  "title": doc.get("title", "")}

    department, raw = department_of(doc)
    days = _days_left(state, obligation.get("source_id"))
    priority = _priority(obligation, days, missing)
    criterion = _CRITERIA.get(key, "a documented procedure and a sample of evidence")

    return {
        "id": f"rec-{analysis_id}-{_slug(obligation['id'])}-{_slug(doc.get('id') or 'none')}",
        "analysis_id": analysis_id,
        "gap_ids": [gap["id"]],
        "obligation_id": obligation["id"],
        "kind": kind,
        "change_type": change_type,
        "target": target,
        "title": title,
        "rationale": gap["why_insufficient"],
        "proposed_text": proposed,
        "implementation_notes": (
            f"Owner: {department}. Apply to {target['title']}"
            + (f" §{ref}" if ref else "")
            + " and attach the evidence named in the acceptance criteria."
        ),
        "regulatory_clause": {
            "obligation_id": obligation["id"],
            "section_ref": obligation.get("section_ref", ""),
            "quote": obligation.get("quote", ""),
        },
        "business_area": doc.get("business_area") or department,
        "priority": priority,
        "acceptance_criteria": [criterion, f"The {department} owner reviews the change at least annually."],
        "evidence": [
            {"kind": "gap", "ref": gap["id"], "quote": gap["why_insufficient"][:400]},
            {"kind": "obligation", "ref": obligation.get("section_ref", ""),
             "quote": (obligation.get("quote") or "")[:400]},
        ],
        "confidence": gap["confidence"],
        "confidence_basis": gap["confidence_basis"],
        "method": "rule",
        "status": "draft",
        "version": 1,
        "created_at": _now(),
        "created_by": "Regula Agent",
        "approved_by": None,
        "approved_at": None,
        "review_note": None,
        "assignment": {
            "status": "unassigned",
            "suggested_department": department,
            "owner_id": None,
            "due_date": None,
            "implementation_status": None,
            "source": "classification" if raw else "none",
            "priority_override": None,
        },
    }


def _missing_key(missing: list[str], required: list[dict]) -> str:
    labels = {e["label"]: e["key"] for e in required}
    for label in missing:
        if label in labels:
            return labels[label]
    return ""


def _change_type(key: str) -> str:
    return {
        "human_review": "process_step",
        "audit_trail": "process_step",
        "reporting": "system_change",
        "explainability": "amend_clause",
        "consent": "process_step",
        "governance": "amend_clause",
        "deadline": "amend_clause",
        "parameter": "amend_clause",
    }.get(key, "amend_clause")


def _priority(obligation: dict, days: int | None, missing: list[str]) -> dict:
    change = obligation.get("change_class") or obligation.get("change_type") or "modified"
    if change in ("new_obligation", "added") or (days is not None and days <= 30):
        level = "critical"
    elif change in ("modified", "deadline_shortened") or (days is not None and days <= 90):
        level = "high"
    elif missing:
        level = "medium"
    else:
        level = "low"
    horizon = f"effective in {days} days" if days is not None else "no effective date recorded"
    return {
        "level": level,
        "rationale": f"{change.replace('_', ' ')} obligation, {horizon}, "
                     f"{len(missing)} missing element(s).",
        "due_hint_days": 45 if level in ("critical", "high") else 90,
    }


def _days_left(state: dict, source_id: str | None) -> int | None:
    source = next((s for s in state.get("sources", []) if s.get("id") == source_id), None)
    if not source or not source.get("effective"):
        return None
    try:
        return (date.fromisoformat(str(source["effective"])[:10]) - date.today()).days
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Persistence and queries
# ---------------------------------------------------------------------------
def _load() -> dict:
    try:
        data = json.loads(DB.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("analyses"), list):
            return data
    except (OSError, ValueError):
        pass
    return {"analyses": []}


def _save(data: dict) -> None:
    DB.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(DB)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "")).strip("-")
    return slug[:80] or "x"


def _next_id(prefix: str) -> str:
    data = _load()
    numbers = []
    for analysis in data["analyses"]:
        match = re.fullmatch(rf"{prefix}-(\d+)", analysis.get("id", ""))
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}-{max(numbers, default=0) + 1:03d}"


def _counts(values) -> dict:
    out: dict[str, int] = {}
    for value in values:
        out[value] = out.get(value, 0) + 1
    return out


def list_analyses() -> list[dict]:
    return [
        {k: v for k, v in analysis.items() if k not in ("mappings", "gaps", "recommendations")}
        for analysis in _load()["analyses"]
    ]


def get_analysis(analysis_id: str) -> dict:
    for analysis in _load()["analyses"]:
        if analysis["id"] == analysis_id:
            return analysis
    raise KeyError(analysis_id)


def matrix(state: dict, analysis_id: str) -> list[dict]:
    analysis = get_analysis(analysis_id)
    obligations = {o["id"]: o for o in state.get("obligations", [])}
    sources = {s["id"]: s for s in state.get("sources", [])}
    recs = {r["id"]: r for r in analysis.get("recommendations", [])}
    maps = {m["id"]: m for m in analysis.get("mappings", [])}
    rows = []
    for gap in analysis.get("gaps", []):
        rec = next((recs[i] for i in gap.get("recommendation_ids", []) if i in recs), None)
        obligation = obligations.get(gap["obligation_id"], {})
        source = sources.get(obligation.get("source_id"), {})
        mapping = maps.get((gap.get("mapping_ids") or [None])[0])
        rows.append({
            "row_id": f"mx-{analysis_id}-{_slug(gap['obligation_id'])}-{_slug(gap.get('internal_document_id') or 'none')}",
            "analysis_id": analysis_id,
            "obligation": {
                "id": gap["obligation_id"],
                "source_id": obligation.get("source_id"),
                "source_title": source.get("title", ""),
                "section_ref": gap.get("obligation_ref", ""),
                "quote": obligation.get("quote", ""),
                "change_class": obligation.get("change_class") or obligation.get("change_type", ""),
                "deadline": obligation.get("deadline", ""),
            },
            "internal": {
                "document_id": gap.get("internal_document_id"),
                "chunk_id": (mapping or {}).get("internal", {}).get("chunk_id"),
                "title": gap.get("internal_title", ""),
                "doc_type": gap.get("doc_type", ""),
                "department": gap.get("department", "Unassigned"),
                "business_area": gap.get("business_area", ""),
            },
            "gap": {"id": gap["id"], "state": gap["state"], "summary": gap["summary"],
                    "confidence": gap["confidence"]},
            "recommendation": {
                "id": rec["id"], "title": rec["title"], "change_type": rec["change_type"],
                "priority": rec["priority"]["level"], "status": rec["status"],
            } if rec else None,
            "mapping": {"id": mapping["id"], "relation": mapping["relation"],
                        "confidence": mapping["confidence"]} if mapping else None,
            "assignment": rec["assignment"] if rec else {
                "status": "unassigned", "suggested_department": gap.get("department", "Unassigned"),
                "owner_id": None, "priority_override": None,
            },
        })
    return rows


def mappings_for(analysis_id: str, obligation_id: str | None = None,
                 document_id: str | None = None, level: str | None = None) -> list[dict]:
    items = get_analysis(analysis_id).get("mappings", [])
    return [
        m for m in items
        if (not obligation_id or m["obligation_id"] == obligation_id)
        and (not document_id or m["internal"]["document_id"] == document_id)
        and (not level or m["level"] == level)
    ]


def gaps_for(analysis_id: str, state: str | None = None, department: str | None = None) -> list[dict]:
    items = get_analysis(analysis_id).get("gaps", [])
    return [
        g for g in items
        if (not state or g["state"] == state)
        and (not department or g["department"] == department)
    ]


def recommendations_for(analysis_id: str, status: str | None = None,
                        priority: str | None = None) -> list[dict]:
    items = get_analysis(analysis_id).get("recommendations", [])
    return [
        r for r in items
        if (not status or r["status"] == status)
        and (not priority or r["priority"]["level"] == priority)
    ]


def _locate(data: dict, rec_id: str) -> tuple[dict, dict]:
    for analysis in data.get("analyses", []):
        for rec in analysis.get("recommendations", []):
            if rec["id"] == rec_id:
                return analysis, rec
    raise KeyError(rec_id)


def edit_recommendation(state: dict, rec_id: str, payload: dict, actor: str = "Reviewer") -> dict:
    with _lock:
        data = _load()
        analysis, rec = _locate(data, rec_id)
        if rec["status"] != "draft":
            raise RuntimeError("only a draft can be edited")
        for field in EDITED:
            if field in payload:
                rec[field] = payload[field]
        if not str(rec.get("proposed_text") or "").strip():
            raise ValueError("proposed_text is required")
        rec["version"] += 1
        _save(data)
    audit.add(state, actor, "level2.recommendation.edited", rec_id, f"version {rec['version']}")
    return rec


def review_recommendation(state: dict, rec_id: str, payload: dict) -> dict:
    role = str(payload.get("role") or "")
    if role not in ("reviewer", "admin"):
        raise PermissionError("reviewer role required")
    decision = payload.get("decision")
    if decision not in ("approve", "reject"):
        raise ValueError("decision must be approve or reject")
    note = str(payload.get("note") or "").strip()
    if decision == "reject" and not note:
        raise ValueError("a rejection needs a note")

    with _lock:
        data = _load()
        analysis, rec = _locate(data, rec_id)
        if rec["status"] != "draft":
            raise RuntimeError("recommendation is not a draft")
        rec["status"] = "approved" if decision == "approve" else "rejected"
        rec["review_note"] = note or None
        if decision == "approve":
            rec["approved_by"] = payload.get("actor") or "Reviewer"
            rec["approved_at"] = _now()
        _save(data)

    action = "approved" if decision == "approve" else "rejected"
    audit.add(state, payload.get("actor") or "Reviewer", f"level2.recommendation.{action}", rec_id,
              note or f"{rec['title']} · version {rec['version']}")
    return rec
