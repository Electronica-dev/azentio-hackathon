"""State assembly, persistence and the few write operations the demo needs."""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from pathlib import Path

from . import audit
from .changes import build_changes, summary as changes_summary
from .ingest import build_clauses
from .pipeline import run_source

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "db.json"

SEED_APPROVALS = 2


def _read(name: str) -> str:
    return (DATA_DIR / name).read_text(encoding="utf-8")


def load_seed() -> tuple[list[dict], list[dict], dict[str, str], dict[str, str]]:
    sources = json.loads(_read("sources.json"))
    assets = json.loads(_read("inventory.json"))
    docs = {s["doc"]: _read(s["doc"]) for s in sources}
    priors = {s["prior_doc"]: _read(s["prior_doc"]) for s in sources if s.get("prior_doc")}
    return sources, assets, docs, priors


def build_state() -> dict:
    sources, assets, docs, priors = load_seed()
    state: dict = {
        "meta": {
            "org": "Meridian Bank",
            "product": "Regula",
            "tagline": "Regulatory Change Impact Agent",
            "version": "1.0.0-demo",
            "as_of": date.today().isoformat(),
            "built_at": audit.now_iso(),
            "scope": "India · RBI / SEBI",
            "mode": "deterministic",
        },
        "sources": sources,
        "assets": assets,
        "documents": [],
        "clauses": [],
        "obligations": [],
        "impacts": [],
        "tasks": [],
        "runs": [],
        "audit": [],
    }
    for source in sources:
        text = docs[source["doc"]]
        state["documents"].append({
            "id": source["id"],
            "doc": source["doc"],
            "feed_id": None,
            "authority": source["regulator"],
            "region": "INDIA",
            "title": source["title"],
            "ref": source["ref"],
            "published": source["published"],
            "effective": source["effective"],
            "hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "transport": "seed",
            "first_seen": audit.now_iso(),
            "last_seen": audit.now_iso(),
            "processed_at": audit.now_iso() if source["status"] != "new" else None,
            "status": "processed" if source["status"] != "new" else "new",
        })
        state["clauses"].extend(build_clauses(source, docs[source["doc"]], priors.get(source.get("prior_doc") or "")))
        audit.add(state, "Ingestion Service", "source.ingested", source["ref"], f"{source['title']} · effective {source['effective']}")

    for source in sources:
        prior_doc = source.get("prior_doc")
        if not prior_doc or prior_doc not in priors:
            continue
        text = priors[prior_doc]
        state["documents"].append({
            "id": f"doc-prior-{source['id']}",
            "doc": prior_doc,
            "feed_id": None,
            "authority": source["regulator"],
            "region": "INDIA",
            "title": f"{source['title']} — prior version",
            "ref": "",
            "published": "",
            "effective": "",
            "hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "transport": "seed",
            "first_seen": audit.now_iso(),
            "last_seen": audit.now_iso(),
            "processed_at": None,
            "status": "prior",
        })

    for source in sources:
        if source["status"] != "new":
            run_source(state, source, docs, priors)

    _seed_review(state)
    return state


def _seed_review(state: dict) -> None:
    critical = sorted([i for i in state["impacts"] if i["severity"] == "critical"], key=lambda i: -i["score"])
    for imp in critical[:SEED_APPROVALS]:
        imp["status"] = "approved"
        imp["reviewed_by"] = "Priya Menon"
        imp["review_note"] = "Confirmed. Owner for the cited policy sections; change plan accepted."
        audit.add(state, "Priya Menon", "impact.approved", imp["id"], f"{imp['asset_name']} · score {imp['score']}")

    tasks = sorted([t for t in state["tasks"] if t["asset_type"] == "system"], key=lambda t: -t["effort_days"])
    if tasks:
        task = tasks[0]
        task["status"] = "in_progress"
        task["started_at"] = audit.now_iso()
        audit.add(state, task["owner"], "task.status_changed", task["id"], "proposed → in_progress")

    policy = next((t for t in state["tasks"] if t["asset_type"] == "policy" and t["status"] == "proposed"), None)
    if policy:
        policy["status"] = "approved"
        audit.add(state, policy["owner"], "task.status_changed", policy["id"], "proposed → approved")

    control = next((t for t in state["tasks"] if t["asset_type"] == "control" and t["status"] == "proposed"), None)
    if control:
        control["status"] = "done"
        control["completed_at"] = audit.now_iso()
        audit.add(state, control["owner"], "task.status_changed", control["id"], "proposed → done · acceptance evidence attached")

    for source in state["sources"]:
        if source["status"] == "analyzed":
            source["status"] = "in_review"


def save(state: dict) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(state, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def load_or_build(reset: bool = False) -> dict:
    if not reset and DB_PATH.exists():
        try:
            state = json.loads(DB_PATH.read_text(encoding="utf-8"))
            if state.get("meta", {}).get("as_of") == date.today().isoformat():
                return state
        except Exception:
            pass
    state = build_state()
    save(state)
    return state


def counts(state: dict) -> dict:
    out = {}
    for source in state["sources"]:
        sid = source["id"]
        obs = [o for o in state["obligations"] if o["source_id"] == sid]
        imps = [i for i in state["impacts"] if i["source_id"] == sid]
        tasks = [t for t in state["tasks"] if t["source_id"] == sid]
        days_left = (date.fromisoformat(source["effective"]) - date.today()).days
        out[sid] = {
            "obligations": len(obs),
            "impacts": len(imps),
            "critical": sum(1 for i in imps if i["severity"] == "critical"),
            "high": sum(1 for i in imps if i["severity"] == "high"),
            "approved": sum(1 for i in imps if i["status"] == "approved"),
            "tasks": len(tasks),
            "open_tasks": sum(1 for t in tasks if t["status"] != "done"),
            "effort_days": sum(t["effort_days"] for t in tasks),
            "days_left": days_left,
            "overdue": days_left < 0,
        }
    return out


def serialize(state: dict) -> dict:
    c = counts(state)
    sources = []
    for s in state["sources"]:
        item = dict(s)
        item.update(c.get(s["id"], {}))
        sources.append(item)
    out = dict(state)
    out.setdefault("documents", [])
    out["sources"] = sources
    out["summary"] = {
        "sources": len(state["sources"]),
        "open_changes": sum(1 for s in state["sources"] if s["status"] in ("new", "in_review")),
        "obligations": len(state["obligations"]),
        "impacts": len(state["impacts"]),
        "critical": sum(1 for i in state["impacts"] if i["severity"] == "critical"),
        "tasks": len(state["tasks"]),
        "effort_days": sum(t["effort_days"] for t in state["tasks"]),
        "approved": sum(1 for i in state["impacts"] if i["status"] == "approved"),
        "coverage": round(len({i["obligation_id"] for i in state["impacts"]}) / max(1, len(state["obligations"])) * 100),
        "last_run_ms": state["runs"][0]["ms"] if state["runs"] else 0,
    }
    out["changes"] = build_changes(state)
    out["changes_summary"] = changes_summary(out["changes"])
    out["audit_chain"] = audit.verify(state)
    return out


def review_impact(state: dict, impact_id: str, decision: str, note: str, actor: str) -> dict:
    imp = next((i for i in state["impacts"] if i["id"] == impact_id), None)
    if not imp:
        raise KeyError("impact not found")
    if decision not in ("approved", "rejected"):
        raise ValueError("decision must be approved or rejected")
    imp["status"] = decision
    imp["reviewed_by"] = actor
    imp["review_note"] = note
    audit.add(state, actor, f"impact.{decision}", impact_id, note or f"{imp['asset_name']} · score {imp['score']}")
    save(state)
    return imp


def set_task_status(state: dict, task_id: str, status: str, actor: str) -> dict:
    task = next((t for t in state["tasks"] if t["id"] == task_id), None)
    if not task:
        raise KeyError("task not found")
    if status not in ("proposed", "approved", "in_progress", "done"):
        raise ValueError("bad status")
    prev = task["status"]
    task["status"] = status
    if status == "done":
        task["completed_at"] = audit.now_iso()
    audit.add(state, actor or task["owner"], "task.status_changed", task_id, f"{prev} → {status}")
    save(state)
    return task


def source_report(state: dict, source_id: str) -> str:
    source = next((s for s in state["sources"] if s["id"] == source_id), None)
    if not source:
        raise KeyError("source not found")
    obs = [o for o in state["obligations"] if o["source_id"] == source_id]
    imps = [i for i in state["impacts"] if i["source_id"] == source_id]
    tasks = [t for t in state["tasks"] if t["source_id"] == source_id]
    assets = {a["id"]: a for a in state["assets"]}
    lines = [
        f"# Regulatory Change Impact Assessment",
        "",
        f"**Source:** {source['title']}  ",
        f"**Reference:** {source['ref']}  ",
        f"**Regulator:** {source['regulator']}  ",
        f"**Published:** {source['published']}  ",
        f"**Effective:** {source['effective']}  ",
        f"**Prepared by:** Regula · Regulatory Change Impact Agent  ",
        f"**Generated:** {audit.now_iso()}  ",
        "",
        "## 1. Executive summary",
        "",
        source.get("summary", ""),
        "",
        f"- Obligations extracted: **{len(obs)}**",
        f"- Impacted assets: **{len({i['asset_id'] for i in imps})}**",
        f"- Impacts scored: **{len(imps)}** ({sum(1 for i in imps if i['severity'] == 'critical')} critical, {sum(1 for i in imps if i['severity'] == 'high')} high)",
        f"- Change tasks: **{len(tasks)}**, effort **{sum(t['effort_days'] for t in tasks)} person-days**",
        "",
        "## 2. Obligations and evidence",
        "",
        "| Ref | Obligation | Type | Deadline | Confidence |",
        "|---|---|---|---|---|",
    ]
    for o in obs:
        lines.append(f"| {o['section_ref']} | {o['statement'].replace('|', '/')} | {o['kind']} | {o['deadline'] or '—'} | {o['confidence']:.2f} |")
    lines += ["", "## 3. Impact assessment", "", "| Severity | Score | Asset | Type | Owner | Gap |", "|---|---|---|---|---|---|"]
    for i in sorted(imps, key=lambda x: -x["score"]):
        lines.append(f"| {i['severity']} | {i['score']} | {i['asset_name']} | {i['asset_type']} | {i['owner']} | {i['gap'].replace('|', '/')} |")
    lines += ["", "## 4. Change plan", "", "| Priority | Task | Owner | Due | Effort | Status |", "|---|---|---|---|---|---|"]
    for t in tasks:
        lines.append(f"| {t['priority']} | {t['title']} | {t['owner']} | {t['due']} | {t['effort_days']}d | {t['status']} |")
    lines += ["", "## 5. Evidence chain", "", f"Audit events: **{len(state['audit'])}** · chain: **{'verified' if audit.verify(state)['ok'] else 'BROKEN'}**", ""]
    for e in state["audit"][-8:]:
        lines.append(f"- `{e['ts']}` **{e['action']}** · {e['entity']} · {e['detail']} (`{e['hash'][:12]}`)")
    return "\n".join(lines)
