"""Dummy extraction endpoint.

The real contract arrives later. This module keeps a stable response shape so the
AI pipeline and the UI can integrate against it now and swap the internals later.
Nothing here is final: the payload is explicitly flagged ``dummy: true``.
"""
from __future__ import annotations

import hashlib

from .extract import extract_obligations
from .ingest import build_clauses

DUMMY = True
CONTRACT_VERSION = "pending"
REGION = "INDIA"


def _pseudo_source(payload: dict, text: str) -> dict:
    """Build the minimum source dict extract_obligations() needs."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
    title = (payload.get("title") or "").strip() or "Uploaded regulatory document"
    authority = (payload.get("authority") or "Unknown authority").strip()
    return {
        "id": payload.get("id") or f"src-extract-{digest}",
        "regulator": authority,
        "region": (payload.get("region") or REGION).strip().upper(),
        "authority": authority,
        "title": title,
        "short_title": title[:60],
        "ref": (payload.get("ref") or "").strip(),
        "published": (payload.get("published") or "").strip(),
        "effective": (payload.get("effective") or "").strip(),
        "status": "new",
        "risk": "medium",
        "owner": "",
        "doc": "",
        "prior_doc": None,
        "summary": "",
        "tags": [],
        "hash": digest,
    }


def extract_document(payload: dict) -> dict:
    """Text in, structured obligations out. Dummy but stable."""
    text = (payload.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")

    source = _pseudo_source(payload, text)
    clauses = build_clauses(source, text, None)
    obligations = extract_obligations(source, clauses)

    return {
        "dummy": DUMMY,
        "contract_version": CONTRACT_VERSION,
        "source": source,
        "clauses": [
            {
                "id": c["id"],
                "document_id": c.get("document_id", source["id"]),
                "num": c["num"],
                "heading": c["heading"],
                "section_ref": c["section_ref"],
                "change_type": c["change_type"],
            }
            for c in clauses
        ],
        "obligations": [
            {
                "id": o["id"],
                "document_id": o.get("document_id", source["id"]),
                "clause_id": o["clause_id"],
                "section_ref": o["section_ref"],
                "statement": o["statement"],
                "quote": o["quote"],
                "kind": o["kind"],
                "modality": o["modality"],
                "deadline": o["deadline"],
                "params": o["params"],
                "tags": o["tags"],
                "confidence": o["confidence"],
            }
            for o in obligations
        ],
        "stats": {
            "clauses": len(clauses),
            "obligations": len(obligations),
            "evidenced": sum(1 for o in obligations if o.get("quote")),
        },
    }
