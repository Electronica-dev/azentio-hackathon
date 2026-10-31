"""Seed the internal document pack and org chart, then run a Level 2 assessment.

    python backend/seed_org.py            # seed once, assess KYC
    python backend/seed_org.py --force    # replace the seeded documents
    python backend/seed_org.py --all      # analyse every regulatory source

Documents come from the docx pack in ``backend/org_seed/`` (committed), with the
people directory in ``org_seed/people.json``. The generated documents, people and
assessment live under ``backend/data/org/`` and ``backend/data/level2.json``
(gitignored, like the database). Owners are matched from the people directory, so
the matrix shows real assignments instead of flags.
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

SEED = ROOT / "org_seed"
MANIFEST = SEED / "documents.json"
PEOPLE = SEED / "people.json"
CORPUS = ROOT / "data" / "org_demo" / "corpus.json"


def _corpus_text(document: dict) -> str:
    return "\n\n".join(
        f'{section["ref"]} {section["heading"]}\n{section["text"]}'
        for section in document["sections"]
    )


def seed_documents(documents: list[dict], force: bool) -> None:
    existing = org.snapshot()["documents"]
    if existing and not force:
        print(f"internal documents already present ({len(existing)}); keeping them")
        return
    if force:
        for doc in existing:
            org.delete_document(doc["id"])
        if level2.DB.exists():
            level2.DB.unlink()
        print(f"removed {len(existing)} existing internal documents and prior assessments")

    for document in documents:
        path = SEED / "files" / document["file"]
        if not path.exists():
            print(f"missing seed file: {path}")
            continue
        raw = path.read_bytes()
        org.add_documents({
            "title": document["title"],
            "category": document["category"],
            "department": document["department"],
            "owner": document.get("owner", ""),
            "version": document.get("version", ""),
            "review_date": document.get("review_date", ""),
            "files": [{
                "filename": document["filename"],
                "content_base64": base64.b64encode(raw).decode(),
            }],
        }, actor="Demo seed")

    corpus_added = 0
    if CORPUS.exists():
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        for document in corpus["documents"]:
            org.add_documents({
                "title": document["title"],
                "category": document["category"],
                "department": document["department"],
                "owner": document.get("owner", ""),
                "version": document.get("version", ""),
                "files": [{
                    "filename": document["filename"],
                    "content_base64": base64.b64encode(_corpus_text(document).encode("utf-8")).decode(),
                }],
            }, actor="Demo seed")
            corpus_added += 1

    print(f"seeded {len(documents)} docx + {corpus_added} text documents")


def seed_people(people: list[dict]) -> int:
    existing = org.snapshot()["people"]
    emails = {p["email"].lower() for p in existing if p.get("email")}
    missing = [p for p in people if p["email"].lower() not in emails]
    if missing:
        org.add_people({"items": missing})
    print(f"people directory: {len(existing) + len(missing)} ({len(missing)} added)")
    return len(missing)


def ensure_obligations(state: dict, all_sources: bool) -> None:
    sources = state["sources"] if all_sources else [
        s for s in state["sources"] if s["id"] == "src-kyc-2026"
    ]
    for source in sources:
        if any(o["source_id"] == source["id"] for o in state["obligations"]):
            continue
        try:
            pipeline.run_source(state, source, {}, {}, actor="Demo seed")
            print(f"analysed {source['id']} ({source['title'][:50]})")
        except Exception as exc:  # noqa: BLE001 - one source must not stop the seed
            print(f"could not analyse {source['id']}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="replace existing seeded documents")
    parser.add_argument("--all", action="store_true", help="analyse every regulatory source")
    args = parser.parse_args()

    if not MANIFEST.exists():
        print(f"seed manifest not found: {MANIFEST}")
        return 1
    documents = json.loads(MANIFEST.read_text(encoding="utf-8"))
    people = json.loads(PEOPLE.read_text(encoding="utf-8")) if PEOPLE.exists() else []

    seed_documents(documents, force=args.force)
    seed_people(people)

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
    assigned = sum(
        1 for rec in analysis["recommendations"]
        if rec["assignment"]["status"] in ("assigned", "confirmed")
    )
    print()
    print(f"analysis {analysis['id']} · {analysis['counts']['obligations']} obligations "
          f"· {analysis['counts']['mappings']} mappings")
    print(f"gaps: {analysis['counts']['gaps']}")
    print(f"drafts: {analysis['counts']['recommendations']} · owners assigned: {assigned} "
          f"(register: {owners['assigned']} matched, {owners['flagged']} flagged)")
    print("open http://localhost:3000/assessments and http://localhost:3000/impact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
