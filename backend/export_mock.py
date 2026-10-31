"""Regenerate the committed offline fixtures from the seed.

The dashboard reads `GET /api/state` when the API is up and falls back to
`frontend/mock/state.json` when it is not. This script rebuilds exactly the
document the API would serve and writes both committed copies:

    python backend/export_mock.py

Run it after changing sources.json, a seeded document or the engine, so the
offline fallback never drifts from the live payload. It does not touch
`backend/data/db.json`, so the API still builds its own cache on next start.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from regula import store  # noqa: E402

# The UI reads one document; these are the keys the dashboard actually uses.
UI_KEYS = (
    "meta",
    "summary",
    "sources",
    "clauses",
    "obligations",
    "assets",
    "impacts",
    "tasks",
    "runs",
    "audit",
    "audit_chain",
)
TARGETS = (
    (ROOT.parent / "frontend" / "mock" / "state.json", UI_KEYS),
    (ROOT / "web" / "mock" / "state.json", None),
)


def main() -> None:
    document = store.serialize(store.build_state())
    for path, keys in TARGETS:
        payload = document if keys is None else {key: document[key] for key in keys}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        regions = sorted({(source.get("region") or "INDIA") for source in document["sources"]})
        print(f"  wrote {path.relative_to(ROOT.parent)} · {len(document['sources'])} sources · regions {', '.join(regions)}")


if __name__ == "__main__":
    main()
