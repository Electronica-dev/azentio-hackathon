"""AI enrichment: align a new regulation to its prior version, classify changes,
and write plain-English significance.

One direct OpenAI-compatible chat-completions call. No provider abstraction.
Configure with:
    REGULA_LLM_BASE_URL   default https://api.openai.com/v1
    REGULA_LLM_API_KEY    required to enable
    REGULA_LLM_MODEL      default gpt-4o-mini

If the key is absent or the call fails, the deterministic pipeline output is
left untouched and `enriched` is False. Nothing in the demo depends on the
model being reachable except the enrichment fields themselves.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from .ingest import _prior_body, _substantive, parse_prior
from .text import redline

CHANGE_CLASSES = {
    "new_obligation",
    "modified",
    "withdrawn",
    "deadline_extended",
    "deadline_shortened",
    "clarification",
    "no_material_change",
}

CLASS_TO_TYPE = {
    "new_obligation": "added",
    "withdrawn": "removed",
    "no_material_change": "unchanged",
    "modified": "modified",
    "deadline_extended": "modified",
    "deadline_shortened": "modified",
    "clarification": "modified",
}

TYPE_TO_CLASS = {
    "added": "new_obligation",
    "removed": "withdrawn",
    "modified": "modified",
    "unchanged": "no_material_change",
}

SYSTEM = """You are a regulatory change analyst at an Indian bank. You compare a NEW regulatory
document against the PRIOR document it replaces or amends, clause by clause.

Return STRICT JSON only (no markdown, no prose) with exactly this shape:
{
  "relationship": {"prior_ref": string|null, "confidence": number, "rationale": string},
  "clauses": [
    {
      "num": string,
      "prior_clause_num": string|null,
      "change_class": "new_obligation"|"modified"|"withdrawn"|"deadline_extended"|"deadline_shortened"|"clarification"|"no_material_change",
      "significance": string,
      "applicability": ["ai"|"banking"|"lending"|"insurance"|"payments"],
      "applies_to": [string],
      "references": [string]
    }
  ]
}

Rules:
- Include EVERY clause number from the NEW document exactly once.
- prior_clause_num must be a number that exists in the PRIOR document, or null if there is no real counterpart.
- change_class describes what changed for that clause. deadline_extended / deadline_shortened only when a
  compliance timeline moved. clarification when wording is clarified without changing the duty.
  no_material_change when the clause is substantively identical.
- significance: one plain-English sentence (max 160 chars) saying why the change matters to the bank.
  No legal citation, no restating the clause title.
- applicability and applies_to: only what the text supports; empty array if unclear.
- references: earlier circular/regulation identifiers explicitly cited in the clause text; empty array if none.
- Never invent clause numbers, references or requirements. If unsure, use null / no_material_change.
- Output valid JSON only. Escape any double quote inside a string; do not wrap in markdown.
"""


def is_configured() -> bool:
    return bool(os.environ.get("REGULA_LLM_API_KEY", "").strip())


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def _prompt(source: dict, clauses: list[dict], prior: dict[str, str]) -> str:
    new_block = "\n".join(
        f"[{c['num']}] {_clip(c['heading'], 140)}\n{_clip(c['body'], 700)}" for c in clauses
    )
    prior_block = "\n".join(
        f"[{num}] {_clip(text, 600)}" for num, text in sorted(prior.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)
    ) or "(no prior document provided — every clause is a new obligation)"

    return f"""NEW DOCUMENT
Title: {source.get('title', '')}
Reference: {source.get('ref', '')}
Regulator: {source.get('regulator', '')}
Published: {source.get('published', '')}
Effective: {source.get('effective', '')}

CLAUSES
{new_block}

PRIOR DOCUMENT (the regulation this one replaces/amends)
{prior_block}
"""


def _completion(base: str, key: str, body: dict, timeout: int) -> str:
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"]


def _chat(messages: list[dict], timeout: int = 120) -> dict:
    base = os.environ.get("REGULA_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    key = os.environ["REGULA_LLM_API_KEY"].strip()
    model = os.environ.get("REGULA_LLM_MODEL", "gpt-4o-mini").strip()

    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 6000,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }

    last: Exception | None = None
    for _ in range(2):
        try:
            return json.loads(_json_block(_completion(base, key, body, timeout)))
        except urllib.error.HTTPError as exc:
            last = exc
            # Some OpenAI-compatible providers reject response_format; retry without it.
            if exc.code == 400 and "response_format" in body:
                body.pop("response_format", None)
                continue
            time.sleep(0.8)
        except json.JSONDecodeError as exc:
            last = exc
            time.sleep(0.8)
    raise last or RuntimeError("model call failed")


def _json_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def _usable(item: dict) -> bool:
    return str(item.get("change_class")) in CHANGE_CLASSES


def apply_result(
    source: dict,
    clauses: list[dict],
    prior_text: str | None,
    result: dict,
) -> dict:
    """Apply a model result to clauses. Pure function so it is testable offline."""
    prior = parse_prior(prior_text) if prior_text else {}
    by_num = {c["num"]: c for c in clauses}
    applied = 0

    rel = result.get("relationship") or {}
    known_ref = source.get("prior_ref") or _prior_ref(prior_text)
    if isinstance(rel, dict):
        prior_ref = rel.get("prior_ref") or known_ref
        source["relationship"] = {
            "status": "linked" if prior_ref else "standalone",
            "prior_ref": prior_ref,
            "confidence": round(float(rel.get("confidence") or (0.9 if prior_ref else 0)), 2),
            "rationale": str(rel.get("rationale") or "")[:400],
        }
    elif known_ref:
        source["relationship"] = {"status": "linked", "prior_ref": known_ref, "confidence": 0.9, "rationale": ""}

    for item in result.get("clauses") or []:
        clause = by_num.get(str(item.get("num")))
        if not clause or not _usable(item):
            continue
        cls = item["change_class"]
        clause["change_class"] = cls
        clause["change_type"] = CLASS_TO_TYPE[cls]
        clause["significance"] = (str(item.get("significance") or "").strip() or f"{cls.replace('_', ' ').capitalize()} — review the redline against the prior clause.")[:260]
        clause["applicability"] = [a for a in item.get("applicability") or [] if isinstance(a, str)][:5]
        clause["applies_to"] = [a for a in item.get("applies_to") or [] if isinstance(a, str)][:6]
        clause["references"] = [a for a in item.get("references") or [] if isinstance(a, str)][:6]
        clause["enrichment"] = "llm"
        clause["confidence"] = 0.9

        pc = item.get("prior_clause_num")
        if pc not in (None, "", "null") and str(pc) in prior:
            text = prior[str(pc)]
            clause["prior_clause_num"] = str(pc)
            clause["prior_clause_id"] = f"{source.get('prior_source_id', 'prior')}#c{pc}"
            clause["previous_text"] = text
            clause["redline"] = redline(_prior_body(text), _substantive(clause["body"]))
        elif cls in ("new_obligation", "added"):
            clause["previous_text"] = ""
            clause["redline"] = []
        applied += 1

    # Repeal clauses are withdrawals even if the model reads them as new duties.
    for clause in clauses:
        if "repeal" in clause.get("heading", "").lower() and clause.get("change_class") == "new_obligation":
            clause["change_class"] = "withdrawn"
            clause["change_type"] = "removed"
            clause["significance"] = "The earlier guidelines are repealed; only the transition savings clause survives."

    # Anything the model skipped still gets a class so every clause renders.
    for clause in clauses:
        if not clause.get("change_class"):
            clause["change_class"] = TYPE_TO_CLASS.get(clause.get("change_type", "added"), "new_obligation")

    return {"enriched": applied > 0, "applied": applied, "total": len(clauses)}


def _prior_ref(prior_text: str | None) -> str | None:
    if not prior_text:
        return None
    match = re.search(r"RBI/\d{4}-\d{2}/\d+", prior_text)
    return match.group(0) if match else None


def _batched(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def enrich_source(source: dict, clauses: list[dict], prior_text: str | None, batch_size: int = 5) -> dict:
    """Call the model in parallel batches and apply the merged result.

    Small batches keep each generation short (latency ~10 s) and give partial
    results even if one batch fails. Missing clauses get one retry pass.
    Never raises into the pipeline.
    """
    if not is_configured():
        return {"enriched": False, "applied": 0, "total": len(clauses), "error": "no key"}

    prior = parse_prior(prior_text) if prior_text else {}
    batches = _batched(clauses, batch_size)
    merged: dict = {"relationship": None, "clauses": []}
    errors: list[str] = []

    def run(batch: list[dict]) -> dict:
        return _chat([
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": _prompt(source, batch, prior)},
        ])

    with ThreadPoolExecutor(max_workers=min(4, len(batches))) as pool:
        futures = [pool.submit(run, batch) for batch in batches]
        for future in futures:
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001 - partial results are fine
                errors.append(str(exc)[:160])
                continue
            if not merged["relationship"] and isinstance(result.get("relationship"), dict):
                merged["relationship"] = result["relationship"]
            merged["clauses"].extend(result.get("clauses") or [])

    apply_result(source, clauses, prior_text, merged)

    for _ in range(2):
        missing = [c for c in clauses if c.get("enrichment") != "llm"]
        if not missing:
            break
        try:
            retry = run(missing)
            apply_result(source, clauses, prior_text, {"relationship": merged.get("relationship"), "clauses": retry.get("clauses") or []})
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc)[:160])
            break

    applied = sum(1 for c in clauses if c.get("enrichment") == "llm")
    stats = {"enriched": applied > 0, "applied": applied, "total": len(clauses)}
    if errors:
        stats["partial_errors"] = len(errors)
    return stats


RELATION_SYSTEM = """You are a regulatory change analyst. You are given ONE new regulatory
document and a SHORTLIST of earlier documents from the same repository. Decide which single
candidate, if any, the new document amends or replaces.

Return STRICT JSON only (no markdown, no prose) with exactly this shape:
{
  "prior_document_id": string|null,
  "confidence": number,
  "evidence": string,
  "rationale": string
}

Rules:
- prior_document_id MUST be one of the candidate ids, or null. Never invent an id.
- Choose null unless the new document amends, replaces, supersedes or implements the
  candidate. Topical similarity alone is NOT a relationship: two circulars on the same
  subject are siblings, not versions of each other.
- evidence: the exact phrase from the new document that establishes the relationship
  (for example "in supersession of", or a cited reference). Empty string when null.
- confidence: 0 to 1. Use below 0.5 when the shortlist is weak or the text is ambiguous.
- rationale: one sentence a compliance reviewer can act on, max 200 characters.
- Output valid JSON only. Escape any double quote inside a string.
"""


def adjudicate_relationship(source: dict, candidates: list[dict]) -> dict | None:
    """Ask the model to argue for one shortlisted candidate.

    The model is an *adviser*: it may only choose from the ids it was given, and
    a null answer is a first-class outcome. It never returns an id outside the
    shortlist, and it never changes a document's link status by itself.
    """
    if not is_configured() or not candidates:
        return None

    listing = "\n".join(
        f"- id={c.get('document_id')} | title={c.get('title', '')} "
        f"| ref={c.get('ref') or '-'} | published={c.get('published') or 'unknown'} "
        f"| score={c.get('confidence')} | {c.get('rationale', '')}"
        for c in candidates
    )
    prompt = (
        f"NEW DOCUMENT\nTitle: {_clip(source.get('title', ''), 200)}\n"
        f"Reference: {source.get('ref') or '-'}\n"
        f"Excerpt: {_clip(source.get('text') or source.get('summary', ''), 900)}\n\n"
        f"CANDIDATES\n{listing}"
    )

    try:
        result = _chat([
            {"role": "system", "content": RELATION_SYSTEM},
            {"role": "user", "content": prompt},
        ], timeout=45)
    except Exception:  # noqa: BLE001 - advice must never break the pipeline
        return None

    ids = {str(c.get("document_id")) for c in candidates}
    chosen = result.get("prior_document_id")
    chosen = None if chosen in (None, "", "null") else str(chosen)
    if chosen not in ids:
        chosen = None

    try:
        confidence = max(0.0, min(1.0, float(result.get("confidence") or 0.0)))
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "prior_document_id": chosen,
        "confidence": round(confidence, 2),
        "evidence": str(result.get("evidence") or "")[:200],
        "rationale": str(result.get("rationale") or "")[:400],
    }
