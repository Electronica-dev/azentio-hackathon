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
import urllib.error
import urllib.request

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
- significance: one plain-English sentence (max 220 chars) saying why the change matters to the bank.
  No legal citation, no restating the clause title.
- applicability and applies_to: only what the text supports; empty array if unclear.
- references: earlier circular/regulation identifiers explicitly cited in the clause text; empty array if none.
- Never invent clause numbers, references or requirements. If unsure, use null / no_material_change.
"""


def is_configured() -> bool:
    return bool(os.environ.get("REGULA_LLM_API_KEY", "").strip())


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def _prompt(source: dict, clauses: list[dict], prior_text: str | None) -> str:
    prior = parse_prior(prior_text) if prior_text else {}
    new_block = "\n".join(
        f"[{c['num']}] {_clip(c['heading'], 140)}\n{_clip(c['body'], 900)}" for c in clauses
    )
    prior_block = "\n".join(
        f"[{num}] {_clip(text, 700)}" for num, text in sorted(prior.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)
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


def _chat(messages: list[dict], timeout: int = 90) -> dict:
    base = os.environ.get("REGULA_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    key = os.environ["REGULA_LLM_API_KEY"].strip()
    model = os.environ.get("REGULA_LLM_MODEL", "gpt-4o-mini").strip()

    body = {
        "model": model,
        "temperature": 0,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Some OpenAI-compatible providers reject response_format; retry without it.
        if exc.code != 400:
            raise
        body.pop("response_format", None)
        req = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    return json.loads(_json_block(content))


def _json_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def _usable(item: dict, prior: dict[str, str]) -> bool:
    if str(item.get("change_class")) not in CHANGE_CLASSES:
        return False
    if not str(item.get("significance") or "").strip():
        return False
    pc = item.get("prior_clause_num")
    if pc not in (None, "", "null") and str(pc) not in prior:
        return False
    return True


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
    if isinstance(rel, dict):
        source["relationship"] = {
            "status": "linked" if rel.get("prior_ref") else "standalone",
            "prior_ref": rel.get("prior_ref"),
            "confidence": round(float(rel.get("confidence") or 0), 2),
            "rationale": str(rel.get("rationale") or "")[:400],
        }

    for item in result.get("clauses") or []:
        clause = by_num.get(str(item.get("num")))
        if not clause or not _usable(item, prior):
            continue
        cls = item["change_class"]
        clause["change_class"] = cls
        clause["change_type"] = CLASS_TO_TYPE[cls]
        clause["significance"] = str(item.get("significance") or "")[:260]
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

    return {"enriched": applied > 0, "applied": applied, "total": len(clauses)}


def enrich_source(source: dict, clauses: list[dict], prior_text: str | None) -> dict:
    """Call the model and apply the result. Never raises into the pipeline."""
    if not is_configured():
        return {"enriched": False, "applied": 0, "total": len(clauses), "error": "no key"}
    try:
        result = _chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": _prompt(source, clauses, prior_text)}])
        return apply_result(source, clauses, prior_text, result)
    except Exception as exc:  # noqa: BLE001 - demo must never die on the model
        return {"enriched": False, "applied": 0, "total": len(clauses), "error": str(exc)[:300]}
