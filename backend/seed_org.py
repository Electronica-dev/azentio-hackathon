"""Seed a demo internal corpus and org chart, then run a Level 2 assessment.

    python backend/seed_org.py            # seed once, assess KYC
    python backend/seed_org.py --force    # replace the demo documents
    python backend/seed_org.py --all      # analyse every regulatory source

The corpus lives in ``backend/data/org_demo/corpus.json`` (committed); the
generated documents, people and assessment live under ``backend/data/org/`` and
``backend/data/level2.json`` (gitignored, like the database). Owners are matched
from the people directory, so the matrix shows real assignments instead of
flags.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from regula import assignment, chunks, level2, org, pipeline, store  # noqa: E402

CORPUS = ROOT / "data" / "org_demo" / "corpus.json"


def document_text(doc: dict) -> str:
    return "\n\n".join(
        f'{section["ref"]} {section["heading"]}\n{section["text"]}'
        for section in doc["sections"]
    )


def seed_documents(corpus: dict, force: bool) -> int:
    existing = org.snapshot()["documents"]
    if existing and not force:
        print(f"internal documents already present ({len(existing)}); keeping them")
        return 0
    if force:
        for doc in existing:
            org.delete_document(doc["id"])
        if level2.DB.exists():
            level2.DB.unlink()
        print(f"removed {len(existing)} existing internal documents and prior assessments")

    for doc in corpus["documents"]:
        text = document_text(doc)
        org.add_documents({
            "title": doc["title"],
            "category": doc["category"],
            "department": doc["department"],
            "owner": doc["owner"],
            "version": doc["version"],
            "files": [{
                "filename": doc["filename"],
                "content_base64": base64.b64encode(text.encode("utf-8")).decode(),
            }],
        }, actor="Demo seed")
    print(f"seeded {len(corpus['documents'])} internal documents")
    return len(corpus["documents"])


def seed_people(corpus: dict) -> int:
    existing = org.snapshot()["people"]
    emails = {p["email"].lower() for p in existing if p.get("email")}
    missing = [p for p in corpus["people"] if p["email"].lower() not in emails]
    if missing:
        org.add_people({"items": missing})
    print(f"people directory: {len(existing) + len(missing)} ({len(missing)} added)")
    return len(missing)


def ensure_obligations(state: dict, all_sources: bool) -> None:
    sources = state["sources"] if all_sources else [
        s for s in state["sources"] if s["id"] == "src-kyc-2026"
    ]
    for source in sources:
        has = any(o["source_id"] == source["id"] for o in state["obligations"])
        if has:
            continue
        try:
            pipeline.run_source(state, source, {}, {}, actor="Demo seed")
            print(f"analysed {source['id']} ({source['title'][:50]})")
        except Exception as exc:  # noqa: BLE001 - one source must not stop the seed
            print(f"could not analyse {source['id']}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="replace existing demo documents")
    parser.add_argument("--all", action="store_true", help="analyse every regulatory source")
    args = parser.parse_args()

    if not CORPUS.exists():
        print(f"corpus not found: {CORPUS}")
        return 1
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    seed_documents(corpus, force=args.force)
    seed_people(corpus)

    state = store.build_state()
    ensure_obligations(state, all_sources=args.all)

    payload = {} if args.all else {"regulatory_source_id": "src-kyc-2026"}
    analysis = level2.analyse(
        state, payload, actor="Demo seed",
        documents=org.snapshot()["documents"],
        chunk_corpus=chunks.load_chunks(),
        use_llm=False,
    )
    owners = assignment.apply_register(analysis["id"])
    store.save(state)

    analysis = level2.get_analysis(analysis["id"])
    gaps = analysis["counts"]["gaps"]
    assigned = sum(
        1 for rec in analysis["recommendations"]
        if rec["assignment"]["status"] in ("assigned", "confirmed")
    )
    print()
    print(f"analysis {analysis['id']} · {analysis['counts']['obligations']} obligations "
          f"· {analysis['counts']['mappings']} mappings")
    print(f"gaps: {gaps}")
    print(f"drafts: {analysis['counts']['recommendations']} · owners assigned: {assigned} "
          f"(register: {owners['assigned']} matched, {owners['flagged']} flagged)")
    print("open http://localhost:3000/assessments and http://localhost:3000/impact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
