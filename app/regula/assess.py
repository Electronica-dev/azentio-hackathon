"""Turn a match into an explainable, scored impact with a named gap."""
from __future__ import annotations

from .text import PARAM_LABELS, fmt_param

CHANGE_WEIGHT = {"added": 22, "modified": 18, "removed": 14, "unchanged": 4}
CHANGE_VERB = {"added": "introduces", "modified": "tightens", "removed": "withdraws", "unchanged": "restates"}
EFFORT_BASE = {"policy": 4, "process": 7, "system": 16, "control": 3}
TYPE_WEIGHT = {"policy": 0, "process": 2, "system": 6, "control": 0}


def severity_of(score: int) -> str:
    if score >= 80:
        return "critical"
    if score >= 66:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def deltas_for(obligation: dict, asset: dict) -> list[dict]:
    out = []
    for key, required in (obligation.get("params") or {}).items():
        current = (asset.get("params") or {}).get(key)
        if current is None or current == required:
            continue
        out.append({
            "key": key,
            "label": PARAM_LABELS.get(key, key.replace("_", " ")),
            "current": current,
            "required": required,
            "current_text": fmt_param(key, current),
            "required_text": fmt_param(key, required),
        })
    return out


def build_impact(obligation: dict, asset: dict, match: dict, source: dict, days_left: int) -> dict:
    deltas = deltas_for(obligation, asset)
    gap = ""
    if deltas:
        d = deltas[0]
        gap = f"{asset['name']} currently records {d['current_text']} for {d['label']}; the amendment requires {d['required_text']}."
    elif asset.get("gap"):
        gap = asset["gap"]
    else:
        gap = "No parameter mismatch detected; control evidence still needs to be refreshed."

    score = 4 + int(asset["criticality"]) * 6 + CHANGE_WEIGHT.get(obligation["change_type"], 8)
    score += 10 if days_left <= 45 else 5 if days_left <= 90 else 1
    score += 14 if deltas else 5 if asset.get("gap") else 0
    score += TYPE_WEIGHT.get(asset["type"], 0)
    score = max(5, min(99, score))

    if deltas:
        d = deltas[0]
        rationale = f"{obligation['section_ref']} sets {d['label']} to {d['required_text']}. {asset['name']} currently records {d['current_text']}."
    else:
        rationale = f"{obligation['section_ref']} {CHANGE_VERB.get(obligation['change_type'], 'affects')} {obligation.get('subject') or 'the requirement'}. {gap}"
    if obligation.get("deadline"):
        rationale += f" Deadline: {obligation['deadline']}."
    rationale = rationale[:340]

    effort = EFFORT_BASE.get(asset["type"], 4) * (1 + 0.2 * (int(asset["criticality"]) - 3)) * (1.2 if deltas else 1.0)
    effort_days = max(2, min(25, round(effort)))
    confidence = 0.84 + (0.08 if deltas else 0) + (0.03 if match["match_score"] > 0.55 else 0)

    return {
        "id": f"imp-{obligation['id'].replace('obl-', '')}-{asset['id']}",
        "obligation_id": obligation["id"],
        "source_id": obligation["source_id"],
        "asset_id": asset["id"],
        "asset_type": asset["type"],
        "asset_name": asset["name"],
        "owner": asset["owner"],
        "team": asset["team"],
        "severity": severity_of(score),
        "score": score,
        "rationale": rationale,
        "gap": gap,
        "deltas": deltas,
        "effort_days": effort_days,
        "confidence": round(min(confidence, 0.97), 2),
        "match_score": match["match_score"],
        "shared_tags": match["shared_tags"],
        "evidence": obligation["quote"][:400],
        "status": "proposed",
        "reviewed_by": None,
        "review_note": None,
        "days_left": days_left,
    }
