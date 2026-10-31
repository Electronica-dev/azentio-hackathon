"""The agent run: ingest -> extract -> map -> score -> plan -> verify."""
from __future__ import annotations

import time
from datetime import date
from pathlib import Path

from . import audit, enrich
from .assess import build_impact
from .extract import extract_obligations
from .ingest import build_clauses
from .match import Matcher
from .planner import build_tasks

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

CLASS_OF_TYPE = {
    "added": "new_obligation",
    "removed": "withdrawn",
    "modified": "modified",
    "unchanged": "no_material_change",
}


def _doc_text(docs: dict[str, str], name: str | None) -> str:
    """Seeded documents live in the dict; discovered ones are files under data/."""
    if not name:
        return ""
    if name in docs:
        return docs[name]
    path = DATA_DIR / name
    return path.read_text(encoding="utf-8") if path.exists() else ""


def run_source(state: dict, source: dict, docs: dict[str, str], prior_docs: dict[str, str], actor: str = "Regula Agent") -> dict:
    t0 = time.perf_counter()
    steps: list[dict] = []

    def step(name: str, detail: str, started: float) -> None:
        steps.append({"name": name, "status": "done", "ms": max(1, round((time.perf_counter() - started) * 1000)), "detail": detail})

    s = time.perf_counter()
    clauses = build_clauses(source, _doc_text(docs, source.get("doc")), _doc_text(prior_docs, source.get("prior_doc")))
    state["clauses"] = [c for c in state["clauses"] if c["source_id"] != source["id"]] + clauses
    changed = sum(1 for c in clauses if c["change_type"] in ("modified", "added", "removed"))
    step("Ingest & align clauses", f"{len(clauses)} clauses · {changed} changed · redlines generated", s)

    ai = {"enriched": False, "applied": 0, "total": len(clauses)}
    if source.get("ai") and enrich.is_configured():
        s = time.perf_counter()
        ai = enrich.enrich_source(source, clauses, prior_docs.get(source.get("prior_doc") or ""))
        detail = (f"{ai['applied']}/{ai['total']} clauses aligned & classified by model"
                  if ai["enriched"] else f"model unavailable ({ai.get('error', 'error')}) — deterministic output kept")
        step("AI align & classify", detail, s)

    s = time.perf_counter()
    obligations = extract_obligations(source, clauses)
    clause_by_id = {c["id"]: c for c in clauses}
    for obligation in obligations:
        clause = clause_by_id.get(obligation["clause_id"]) or {}
        obligation["applicability"] = clause.get("applicability", [])
        obligation["applies_to"] = clause.get("applies_to", [])
        obligation["references"] = clause.get("references", [])
        obligation["significance"] = clause.get("significance", "")
        obligation["change_class"] = clause.get("change_class") or CLASS_OF_TYPE.get(obligation["change_type"], "modified")
        obligation["enrichment"] = clause.get("enrichment", "rule")
    step("Extract obligations", f"{len(obligations)} obligations · confidence {sum(o['confidence'] for o in obligations) / max(1, len(obligations)):.2f}", s)

    s = time.perf_counter()
    matcher = Matcher(state["assets"])
    assets_by_id = {a["id"]: a for a in state["assets"]}
    candidates = 0
    impacts: list[dict] = []
    effective = date.fromisoformat(source["effective"])
    days_left = (effective - date.today()).days
    for obligation in obligations:
        matches = matcher.match(obligation)
        candidates += len(matches)
        for match in matches:
            impacts.append(build_impact(obligation, assets_by_id[match["asset_id"]], match, source, days_left))
    step("Map control library", f"{len(state['assets'])} assets evaluated · {candidates} candidate mappings", s)

    s = time.perf_counter()
    critical = sum(1 for i in impacts if i["severity"] == "critical")
    high = sum(1 for i in impacts if i["severity"] == "high")
    covered = len({i["obligation_id"] for i in impacts})
    step("Score & explain impact", f"{len(impacts)} impacts · {critical} critical · {high} high · {covered} obligations covered", s)

    s = time.perf_counter()
    obligations_by_id = {o["id"]: o for o in obligations}
    tasks = build_tasks(source, impacts, obligations_by_id, assets_by_id, date.today())
    effort = sum(t["effort_days"] for t in tasks)
    step("Draft change plan", f"{len(tasks)} owned tasks · {effort} effort-days sequenced", s)

    s = time.perf_counter()
    evidenced = len({i["obligation_id"] for i in impacts if i.get("evidence")})
    flagged = [o for o in obligations if o["confidence"] < 0.8]
    step("Verify evidence chain", f"{evidenced}/{len(obligations)} obligations evidenced · {len(flagged)} low-confidence flags", s)

    state["obligations"] = [o for o in state["obligations"] if o["source_id"] != source["id"]] + obligations
    state["impacts"] = [i for i in state["impacts"] if i["source_id"] != source["id"]] + impacts
    state["tasks"] = [t for t in state["tasks"] if t["source_id"] != source["id"]] + tasks
    source["status"] = "in_review"
    source["last_run"] = audit.now_iso()

    run = {
        "id": f"run-{len(state['runs']) + 1:03d}",
        "source_id": source["id"],
        "source_ref": source["ref"],
        "started": audit.now_iso(),
        "ms": max(1, round((time.perf_counter() - t0) * 1000)),
        "steps": steps,
        "stats": {
            "clauses": len(clauses),
            "obligations": len(obligations),
            "impacts": len(impacts),
            "critical": critical,
            "high": high,
            "tasks": len(tasks),
            "effort_days": effort,
            "coverage": round(evidenced / max(1, len(obligations)) * 100),
        },
    }
    state["runs"].insert(0, run)
    audit.add(state, actor, "agent.run.completed", source["ref"], f"{len(obligations)} obligations → {len(impacts)} impacts → {len(tasks)} tasks in {run['ms']} ms")
    return {"run": run, "clauses": clauses, "obligations": obligations, "impacts": impacts, "tasks": tasks}
