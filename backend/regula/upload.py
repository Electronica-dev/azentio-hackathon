"""Manual upload: a file in, a related and analysed repository source out.

The hard part is not reading the file, it is deciding what the file should be
compared against. That decision lives in :mod:`regula.relate`; this module
supplies the text, the metadata and the side effects (store the text, link it,
backfill any successor, run the pipeline).

TXT and DOCX are extracted properly. PDF is best-effort because the project is
stdlib-only: FlateDecode streams are inflated and text-showing operators are
read. When that yields nothing usable the source is accepted with an honest
``needs_ocr`` quality flag rather than failing.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import html
import io
import re
import zipfile
import zlib
from pathlib import Path

from . import audit, pipeline, relate, rss
from .ingest import parse_document

DATA = Path(__file__).resolve().parent.parent / "data"
UPLOADS = DATA / "uploads"
MAX_BYTES = 8 * 1024 * 1024
# The ledger keeps the extracted body so the database alone can reconstruct an
# upload if the text file is lost. Bounded so one huge file cannot bloat the DB.
LEDGER_TEXT_LIMIT = 500_000
MIN_TEXT = 40

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
DATE_RE = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),\s*(\d{4})\b", re.I)
TITLE_RE = re.compile(
    r"\b(circular|master direction|direction|guideline|framework|regulation|notification)\b", re.I
)
# Letterhead lines that are not the document title.
HEADER_RE = re.compile(
    r"^(reserve bank|department of|central office|saudi central bank|central bank of|"
    r"securities and exchange board|banking supervision|rulebook)", re.I
)
# A subtitle worth appending to the title.
SUBTITLE_RE = re.compile(
    r"^(amendment|circular|notification|corrigendum|guidelines?|master direction)\b", re.I
)
REF_RE = re.compile(
    r"\b(?:RBI/\d{4}-\d{2}/\d+|SEBI/[A-Za-z0-9/\-]{6,60}|"
    r"(?:CBUAE\s+)?Circular\s+No\.?\s*\d+\s*/\s*\d{4}|SAMA/[A-Za-z0-9/\-]{3,40})",
    re.I,
)


# ---------------------------------------------------------------------------
# Decoding and text extraction
# ---------------------------------------------------------------------------
def decode(content_base64: str) -> bytes:
    if not content_base64:
        raise ValueError("content_base64 is required")
    try:
        raw = base64.b64decode(content_base64, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"content_base64 is not valid base64: {exc}") from exc
    if not raw:
        raise ValueError("uploaded file is empty")
    if len(raw) > MAX_BYTES:
        raise ValueError("uploaded file is larger than 8 MB")
    return raw


def extract(filename: str, raw: bytes) -> tuple[str, str]:
    """Return (text, kind). ``kind`` is text|docx|pdf|needs_ocr|html."""
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".docx":
        text = _docx(raw)
        return text, ("docx" if len(text) >= MIN_TEXT else "needs_ocr")
    if suffix == ".pdf":
        text = _pdf(raw)
        return text, ("pdf" if len(text) >= 200 else "needs_ocr")
    if suffix in (".html", ".htm"):
        return rss.extract_text(raw), "html"
    return _plain(raw), "text"


def _plain(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
        if text.count("\ufffd") < len(text) * 0.02:
            return _normalise(text)
    return _normalise(raw.decode("utf-8", errors="replace"))


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    lines = [re.sub(r"[ \t]+", " ", line).rstrip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _docx(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError, ValueError):
        return ""
    xml = re.sub(r"<w:br[^>]*/>", "\n", xml)
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab[^>]*/>", " ", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    return _normalise(html.unescape(xml))


# Text-showing operators in a PDF content stream.
_PDF_TJ = re.compile(rb"\((?:\\.|[^\\()])*\)\s*Tj", re.S)
_PDF_TJ_ARRAY = re.compile(rb"\[(?:[^\[\]]|\\.)*\]\s*TJ", re.S)
_PDF_STRING = re.compile(rb"\((?:\\.|[^\\()])*\)", re.S)


def _pdf(raw: bytes) -> str:
    """Best-effort PDF text: inflate streams, then read text operators."""
    chunks: list[bytes] = [raw]
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", raw, re.S):
        body = match.group(1).strip(b"\r\n")
        try:
            chunks.append(zlib.decompress(body))
        except zlib.error:
            continue

    pieces: list[str] = []
    for chunk in chunks:
        for match in _PDF_TJ_ARRAY.finditer(chunk):
            for literal in _PDF_STRING.finditer(match.group(0)):
                pieces.append(_pdf_literal(literal.group(0)))
        for match in _PDF_TJ.finditer(chunk):
            literal = _PDF_STRING.match(match.group(0))
            if literal:
                pieces.append(_pdf_literal(literal.group(0)))
    text = " ".join(p for p in pieces if p.strip())
    text = re.sub(r"[ \t]{2,}", " ", text)
    return _normalise(text)[:200_000]


def _pdf_literal(token: bytes) -> str:
    body = token[1:-1]
    body = re.sub(rb"\\([nrtbf()\\])", lambda m: {
        b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f",
        b"(": b"(", b")": b")", b"\\": b"\\",
    }.get(m.group(1), m.group(1)), body)
    body = re.sub(rb"\\[0-7]{1,3}", lambda m: bytes([int(m.group(0)[1:], 8) & 0x7F]), body)
    return body.decode("latin-1", errors="replace")


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------
def _ref(text: str) -> str:
    match = REF_RE.search(text or "")
    return match.group(0).strip() if match else ""


def _published(text: str) -> str:
    match = DATE_RE.search(text or "")
    if not match:
        return ""
    from datetime import date

    try:
        return date(int(match.group(3)), MONTHS[match.group(1).lower()], int(match.group(2))).isoformat()
    except (ValueError, KeyError):
        return ""


def _title(text: str, filename: str) -> str:
    """Pick the instrument title, not the letterhead and not the reference."""
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    candidates = [
        line for line in lines[:20]
        if 10 <= len(line) <= 220
        and not HEADER_RE.match(line)
        and not REF_RE.search(line)
        and not (DATE_RE.search(line) and len(line) < 30)
    ]
    for index, line in enumerate(candidates):
        if TITLE_RE.search(line):
            subtitle = ""
            if index + 1 < len(candidates) and SUBTITLE_RE.match(candidates[index + 1]):
                subtitle = " " + candidates[index + 1]
            return (line + subtitle)[:200]
    if candidates:
        return candidates[0][:200]
    return Path(filename or "upload").stem[:200]


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
def ingest(state: dict, payload: dict, actor: str = "Manual upload") -> dict:
    """Accept a base64 file, relate it, store it and analyse it."""
    filename = str(payload.get("filename") or "upload.txt")
    raw = decode(str(payload.get("content_base64") or ""))
    text, kind = extract(filename, raw)

    if len(text) < MIN_TEXT:
        raise ValueError(
            f"no readable text found in {filename} ({kind}). "
            "If this is a scanned PDF it needs OCR before upload."
        )

    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

    # Duplicate before relationship: re-uploading a document must not create a
    # second version of itself, and must not be diffed against its own twin.
    for document in state.get("documents", []):
        if document.get("hash") == digest:
            return {
                "duplicate": True,
                "source": next((s for s in state.get("sources", [])
                                if s.get("id") == document.get("source_id")), None),
                "document": document,
                "relationship": None,
                "message": "This document is already in the repository; no diff was run.",
            }

    clauses = parse_document(text)
    # "needs_ocr" means the *text* could not be read. A readable document with
    # few or no numbered clauses is still a valid publication; it is analysed
    # with fewer obligations rather than being rejected.
    quality = kind
    if quality != "needs_ocr" and not clauses:
        quality = "unstructured"

    source_id = "src-up-" + digest[:10]
    relative = f"uploads/{source_id}.txt"
    target = DATA / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")

    authority = str(payload.get("authority") or "").strip() or relate.guess_authority(text)
    region = str(payload.get("region") or "").strip().upper() or relate.guess_region(authority)
    title = str(payload.get("title") or "").strip() or _title(text, filename)

    source = {
        "id": source_id,
        "regulator": authority or "Unspecified",
        "ref": str(payload.get("ref") or "").strip() or _ref(text),
        "title": title,
        "short_title": title[:60],
        "published": str(payload.get("published") or "").strip() or _published(text),
        "effective": str(payload.get("effective") or "").strip(),
        "status": "new",
        "risk": "medium",
        "owner": "Unassigned",
        "region": region,
        "authority": authority or "Unspecified",
        "jurisdiction": "",
        "doc_type": "circular",
        "url": "",
        "doc": relative,
        "prior_doc": None,
        "summary": text[:280].replace("\n", " "),
        "tags": [],
        "transport": "upload",
        "quality": quality,
        "filename": filename,
        "size_bytes": len(raw),
        "hash": digest,
    }

    verdict: dict = {"status": "standalone", "rationale": "Not analysed (low text quality).", "confidence": 0.0}
    if quality != "needs_ocr":
        verdict = relate.assist(relate.relate_state(state, source), source)
        relate.apply_relationship(state, source, verdict)

    # An upload can be older than what we already hold. If so it becomes the
    # predecessor of an existing document, and that document must be re-diffed.
    edges = relate.backfill(source, relate.corpus(state)) if quality != "needs_ocr" else []

    now = audit.now_iso()
    state.setdefault("sources", []).append(source)
    state.setdefault("documents", []).append({
        "id": source_id,
        "doc": relative,
        "feed_id": None,
        "authority": source["authority"],
        "region": region,
        "title": title,
        "ref": source["ref"],
        "published": source["published"],
        "effective": source["effective"],
        "hash": digest,
        "transport": "upload",
        "first_seen": now,
        "last_seen": now,
        "processed_at": now,
        "status": "uploaded",
        "source_id": source_id,
    })

    # Durable record of the upload itself, not just the derived source. This is
    # what makes an upload survive a seed rebuild and lets the API lean.
    ledger = {
        "id": source_id,
        "filename": filename,
        "bytes": len(raw),
        "sha256": digest,
        "chars": len(text),
        "text": text[:LEDGER_TEXT_LIMIT],
        "text_truncated": len(text) > LEDGER_TEXT_LIMIT,
        "quality": quality,
        "actor": actor,
        "uploaded_at": now,
        "source_id": source_id,
        "doc": relative,
        "title": title,
        "ref": source["ref"],
        "authority": source["authority"],
        "region": region,
        "published": source["published"],
        "relationship": source.get("relationship"),
    }
    state.setdefault("uploads", []).append(ledger)

    audit.add(state, actor, "source.uploaded", source["ref"] or source_id,
              f"{filename} · {len(text)} chars · {quality} · {len(clauses)} clauses")
    if verdict["status"] != "standalone":
        audit.add(state, actor, f"relationship.{verdict['status']}", source["ref"] or source_id,
                  f"{verdict.get('prior_source_id') or 'unresolved'} · {verdict['rationale'][:160]}")

    run = None
    if quality != "needs_ocr":
        run = pipeline.run_source(state, source, {}, {})["run"]

    applied: list[dict] = []
    for edge in edges:
        successor = next((s for s in state["sources"] if s["id"] == edge["source_id"]), None)
        if not successor:
            continue
        successor["prior_doc"] = relative
        successor["relationship"] = {
            **(successor.get("relationship") or {}),
            "status": "linked",
            "prior_source_id": source_id,
            "prior_document_id": source_id,
            "confidence": edge["confidence"],
            "rationale": edge["rationale"],
            "pinned": False,
            "signals": [{"name": "backfill", "value": edge["confidence"],
                         "detail": f"{title} is now the closest earlier version"}],
        }
        try:
            pipeline.run_source(state, successor, {}, {})
        except Exception as exc:  # noqa: BLE001 - one successor must not fail the upload
            edge["error"] = str(exc)[:160]
        audit.add(state, actor, "relationship.backfilled", successor.get("ref") or successor["id"],
                  f"prior → {source_id} · {edge['rationale'][:140]}")
        applied.append(edge)

    ledger["backfilled"] = [e["source_id"] for e in applied]
    ledger["relationship"] = source.get("relationship")
    prior_id = (source.get("relationship") or {}).get("prior_source_id")
    prior = next((s for s in state["sources"] if s["id"] == prior_id), None)
    verdict["prior_title"] = prior.get("title") if prior else None

    return {
        "duplicate": False,
        "source": source,
        "relationship": verdict,
        "run": run,
        "backfilled": applied,
        "quality": quality,
    }
