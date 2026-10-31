"""Merge impacts into an owned, sequenced change plan."""
from __future__ import annotations

from datetime import date, timedelta

VERB = {"policy": "Amend", "process": "Redesign", "system": "Change", "control": "Update"}
LEAD = {"policy": 21, "process": 14, "system": 7, "control": 10}
GENERIC = {"kyc", "reporting", "threshold", "records", "policy", "exceptions", "governance"}


def _priority(impacts: list[dict]) -> str:
    if any(i["severity"] == "critical" for i in impacts):
        return "P1"
    if any(i["severity"] == "high" for i in impacts):
        return "P2"
    return "P3"


def build_tasks(source: dict, impacts: list[dict], obligations: dict[str, dict], assets: dict[str, dict], as_of: date) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for imp in impacts:
        grouped.setdefault(imp["asset_id"], []).append(imp)

    effective = date.fromisoformat(source["effective"])
    tasks: dict[str, dict] = {}
    for asset_id, imps in grouped.items():
        asset = assets[asset_id]
        imps.sort(key=lambda i: -i["score"])
        lead = obligations[imps[0]["obligation_id"]]
        topic = (lead.get("subject") or "").strip()
        if len(topic) > 44:
            topic = topic[:41] + "..."
        title = f"{VERB.get(asset['type'], 'Update')} {asset['name']}" + (f" — {topic}" if topic else "")
        if len(title) > 88:
            title = title[:85] + "..."
        due = effective - timedelta(days=LEAD.get(asset["type"], 14))
        if due <= as_of:
            due = as_of + timedelta(days=3)
        refs = sorted({obligations[i["obligation_id"]]["section_ref"] for i in imps})
        task_id = f"task-{source['id'].replace('src-', '')}-{asset_id}"
        tasks[task_id] = {
            "id": task_id,
            "source_id": source["id"],
            "asset_id": asset_id,
            "asset_name": asset["name"],
            "asset_type": asset["type"],
            "title": title,
            "description": f"Close {len(imps)} assessed impact(s) from {source['ref']} on {asset['name']}. Lead obligation: {lead['statement'][:180]}",
            "acceptance": f"Updated {asset['name']}; control test evidence linked to {', '.join(refs[:3])}; owner sign-off recorded.",
            "owner": asset["owner"],
            "team": asset["team"],
            "priority": _priority(imps),
            "severity": imps[0]["severity"],
            "effort_days": max(i["effort_days"] for i in imps),
            "due": due.isoformat(),
            "status": "proposed",
            "depends_on": [],
            "impact_ids": [i["id"] for i in imps],
            "source_ref": source["ref"],
        }

    policy_tasks = sorted(
        [t for t in tasks.values() if t["asset_type"] == "policy"],
        key=lambda t: ({"P1": 0, "P2": 1, "P3": 2}[t["priority"]], t["due"]),
    )
    for task in tasks.values():
        if task["asset_type"] in ("process", "system") and policy_tasks:
            task["depends_on"] = [policy_tasks[0]["id"]]

    order = {"P1": 0, "P2": 1, "P3": 2}
    return sorted(tasks.values(), key=lambda t: (order[t["priority"]], t["due"], -t["effort_days"]))
