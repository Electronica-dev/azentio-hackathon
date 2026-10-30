"""Regenerate the frontend mock fixture from the same seed the API uses."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from regula import store  # noqa: E402


def main() -> None:
    state = store.build_state()
    payload = store.serialize(state)
    target = ROOT.parent / "web" / "mock" / "state.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {target} · {len(payload['obligations'])} obligations · {len(payload['impacts'])} impacts · {len(payload['tasks'])} tasks")


if __name__ == "__main__":
    main()
