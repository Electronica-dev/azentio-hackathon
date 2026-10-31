"""Deterministic chunking for internal documents — stdlib only.

Workstream A stores an internal document's metadata in
``data/org/documents.json`` and its extracted text beside the uploaded file
(``data/org/files/<file>.txt``). This module turns that text into the
``InternalChunk`` records the Level 2 contract expects:

    normalize -> drop page furniture -> detect headings -> segment
    -> split oversized sections -> merge undersized ones -> assign ids/offsets

The structure is preserved so a gap can quote the exact paragraph it came from
(``§3.2``), not just name the policy. Chunking is deterministic: the same text
and version always produce the same ids, so evidence never silently moves.

Cache: ``data/org/chunks.json`` keyed by document id, invalidated when the text
hash or the chunker version changes.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
from pathlib import Path

from . import org

CHUNKER_VERSION = "v1"
ORG = Path(__file__).resolve().parent.parent / "data" / "org"
CACHE = ORG / "chunks.json"

TARGET_WORDS = 500      # preferred upper bound for a section chunk
MAX_WORDS = 1200        # hard split above this
MIN_WORDS = 60          # merge below this when a sibling allows it
PREAMBLE_MIN = 30       # drop a preamble shorter than this

_HEADING_THRESHOLD = 0.6
_MD = re.compile(r"^\s*(#{1,6})\s+(.+)$")
_KEYWORD = re.compile(
    r"^\s*(section|article|clause|part|annex(?:ure)?|appendix|schedule)\s+"
    r"([A-Z0-9][\w.\-]*)\b[\s:.\-]*(.*)$",
    re.I,
)
_NUMBERED = re.compile(r"^\s*(\d+(?:\.\d+){0,3})\.?\s+(\S.*)$")
_PAGE = re.compile(r"^\s*(?:page\s*)?\d+\s*(?:of\s*\d+)?\s*$", re.I)
_TOC = re.compile(r"\.{2,}\s*\d+\s*$")
_TOC_HEADING = re.compile(r"^\s*(table of contents|contents|index)\s*$", re.I)
_SENTENCE = re.compile(r"(?<=[.!?;])\s+")

_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def document_text(doc: dict) -> str:
    """The extracted text A stored beside the uploaded file."""
    name = str(doc.get("file") or "")
    if not name:
        return ""
    path = org.FILES / f"{name}.txt"
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def chunk_document(doc: dict, text: str) -> list[dict]:
    """Turn one document's text into contract-shaped chunks. Pure and deterministic."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        return []

    doc_id = str(doc.get("id") or "doc")
    lines = _clean_lines(text)

    if sum(1 for _, _, raw in lines if (_heading(raw) or (0,))[0] >= _HEADING_THRESHOLD) < 2:
        chunks = _by_paragraphs(lines)
    else:
        chunks = _by_headings(lines)

    chunks = _split_large(chunks)
    chunks = _merge_small(chunks)
    _assign_identity(doc_id, doc, chunks)
    return chunks


def load_chunks(document_id: str | None = None, refresh: bool = False) -> list[dict]:
    """Chunks for one document, or for all indexed documents.

    Reads the cache when the text hash and chunker version still match; otherwise
    re-chunks and rewrites the cache.
    """
    docs = org.snapshot().get("documents", [])
    if document_id:
        docs = [d for d in docs if d.get("id") == document_id]

    with _lock:
        cache = _read_cache()
        changed = False
        for doc in docs:
            text = document_text(doc)
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            entry = cache.get(doc["id"])
            fresh = (
                entry
                and not refresh
                and entry.get("text_sha") == digest
                and entry.get("chunker_version") == CHUNKER_VERSION
            )
            if not fresh:
                cache[doc["id"]] = {
                    "text_sha": digest,
                    "chunker_version": CHUNKER_VERSION,
                    "chunks": chunk_document(doc, text),
                }
                changed = True

        known = {d.get("id") for d in org.snapshot().get("documents", [])}
        for stale in [key for key in cache if key not in known]:
            del cache[stale]
            changed = True

        if changed:
            _write_cache(cache)

        out: list[dict] = []
        for doc in docs:
            out.extend(cache.get(doc["id"], {}).get("chunks", []))
        return out


def counts() -> dict[str, int]:
    """Chunk count per document, for list views."""
    chunks = load_chunks()
    out: dict[str, int] = {}
    for chunk in chunks:
        out[chunk["document_id"]] = out.get(chunk["document_id"], 0) + 1
    return out


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def _read_cache() -> dict:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write_cache(cache: dict) -> None:
    ORG.mkdir(parents=True, exist_ok=True)
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(CACHE)


# ---------------------------------------------------------------------------
# Cleaning: page furniture and text normalisation
# ---------------------------------------------------------------------------
def _clean_lines(text: str) -> list[tuple[int, int, str]]:
    """Return (start, end, raw) for the lines worth chunking, offsets preserved."""
    raw_lines = text.splitlines(keepends=True)
    spans: list[tuple[int, int, str]] = []
    pos = 0
    for line in raw_lines:
        end = pos + len(line)
        spans.append((pos, end, line.rstrip("\r\n")))
        pos = end

    counts: dict[str, int] = {}
    for _, _, raw in spans:
        key = raw.strip()
        if key:
            counts[key] = counts.get(key, 0) + 1

    repeated = {key for key, count in counts.items() if count >= 3 and len(key) <= 100}
    seen_repeated: set[str] = set()
    kept: list[tuple[int, int, str]] = []
    for start, end, raw in spans:
        stripped = raw.strip()
        if stripped and _drop_line(stripped):
            continue
        # A line repeated on many pages is a running header or footer: keep its
        # first occurrence (usually the document title) and drop the rest.
        if stripped in repeated:
            if stripped in seen_repeated:
                continue
            seen_repeated.add(stripped)
        kept.append((start, end, raw))
    return kept


def _drop_line(line: str) -> bool:
    if _PAGE.match(line):
        return True
    if _TOC_HEADING.match(line):
        return True
    return bool(_TOC.search(line))


# ---------------------------------------------------------------------------
# Heading detection
# ---------------------------------------------------------------------------
def _heading(line: str) -> tuple[float, str, str] | None:
    """Return (confidence, ref, title) for a heading candidate."""
    text = line.strip()
    if not text or len(text) > 140:
        return None

    markdown = _MD.match(text)
    if markdown:
        title = markdown.group(2).strip()
        return 1.0, _ref_from_title(title), title

    keyword = _KEYWORD.match(text)
    if keyword:
        ref = f"{keyword.group(1).title()} {keyword.group(2)}"
        title = (keyword.group(3) or "").strip() or ref
        return 0.95, ref, title

    numbered = _NUMBERED.match(text)
    if numbered:
        number, title = numbered.group(1), numbered.group(2).strip()
        # Reject prose and unit-led lines ("24 months ..."), keep real headings.
        if title[:1].islower() or title.endswith((".", ";", ",")):
            return None
        if len(title.split()) > 14 or not re.search(r"[A-Za-z]", title):
            return None
        score = 0.9 if "." in number else 0.75
        return score, number, title

    if text.isupper() and 3 <= len(text.split()) <= 12 and not text.endswith((".", ";", ":")):
        return 0.6, _ref_from_title(text), text.title()

    return None


def _ref_from_title(title: str) -> str:
    numbered = re.match(r"^(\d+(?:\.\d+)*)\.?\s+", title)
    return numbered.group(1) if numbered else ""


# ---------------------------------------------------------------------------
# Segmentation
# ---------------------------------------------------------------------------
def _by_headings(lines: list[tuple[int, int, str]]) -> list[dict]:
    chunks: list[dict] = []
    current: dict | None = None

    for start, end, raw in lines:
        found = _heading(raw)
        if found and found[0] >= _HEADING_THRESHOLD:
            if current is not None:
                chunks.append(current)
            current = {
                "ref": found[1],
                "heading": found[2],
                "lines": [(start, end, raw)],
                "char_start": start,
                "char_end": end,
            }
        else:
            if current is None:
                current = {"ref": "", "heading": "", "lines": [], "char_start": start, "char_end": end, "preamble": True}
            current["lines"].append((start, end, raw))
            current["char_end"] = end

    if current is not None:
        chunks.append(current)

    out: list[dict] = []
    for chunk in chunks:
        body = "\n".join(raw for _, _, raw in chunk["lines"]).strip()
        words = _words(body)
        if chunk.get("preamble") and not chunk["heading"] and words < PREAMBLE_MIN:
            continue
        if not body:
            continue
        kind = "table" if _is_table(chunk["lines"]) else "section"
        # A bare parent heading ("3. Model governance" with nothing under it
        # before 3.1) asserts no requirement; keep the structure in the child's
        # heading_path instead of emitting an empty chunk.
        if kind != "table" and chunk["heading"] and words <= len(chunk["heading"].split()) + 1:
            continue
        chunk["text"] = body
        chunk["words"] = words
        chunk["kind"] = kind
        out.append(chunk)
    return out


def _by_paragraphs(lines: list[tuple[int, int, str]]) -> list[dict]:
    """Fallback for documents with no detectable headings."""
    blocks: list[dict] = []
    current: list[tuple[int, int, str]] = []
    for start, end, raw in lines + [(0, 0, "")]:
        if not raw.strip() and current:
            blocks.append(_paragraph(current))
            current = []
        elif raw.strip():
            current.append((start, end, raw))
    if current:
        blocks.append(_paragraph(current))

    chunks: list[dict] = []
    buffer: list[dict] = []
    for block in blocks:
        buffer.append(block)
        if sum(b["words"] for b in buffer) >= TARGET_WORDS:
            chunks.append(_join_blocks(buffer))
            buffer = []
    if buffer:
        chunks.append(_join_blocks(buffer))

    for index, chunk in enumerate(chunks, start=1):
        chunk["ref"] = f"block-{index}"
        chunk["heading"] = ""
    return chunks


def _paragraph(lines: list[tuple[int, int, str]]) -> dict:
    text = "\n".join(raw for _, _, raw in lines).strip()
    return {
        "lines": lines,
        "text": text,
        "words": _words(text),
        "char_start": lines[0][0],
        "char_end": lines[-1][1],
        "kind": "table" if _is_table(lines) else "block",
        "ref": "",
        "heading": "",
    }


def _join_blocks(blocks: list[dict]) -> dict:
    text = "\n\n".join(b["text"] for b in blocks)
    lines = [line for b in blocks for line in b["lines"]]
    return {
        "lines": lines,
        "text": text,
        "words": sum(b["words"] for b in blocks),
        "char_start": blocks[0]["char_start"],
        "char_end": blocks[-1]["char_end"],
        "kind": "table" if all(b["kind"] == "table" for b in blocks) else "block",
        "ref": "",
        "heading": "",
    }


# ---------------------------------------------------------------------------
# Size normalisation
# ---------------------------------------------------------------------------
def _split_large(chunks: list[dict]) -> list[dict]:
    out: list[dict] = []
    for chunk in chunks:
        if chunk["words"] <= MAX_WORDS or chunk.get("kind") == "table":
            out.append(chunk)
            continue
        parts = _split_text(chunk["text"])
        for index, part in enumerate(parts):
            piece = dict(chunk)
            piece["text"] = part
            piece["words"] = _words(part)
            piece["_part"] = index
            piece["_parts"] = len(parts)
            if index:
                piece["heading"] = ""
                piece["char_start"] = chunk["char_start"] + sum(len(p) + 1 for p in parts[:index])
                piece["char_end"] = piece["char_start"] + len(part)
            out.append(piece)
    return out


def _split_text(text: str) -> list[str]:
    sentences = [s.strip() for s in _SENTENCE.split(text) if s.strip()]
    parts: list[str] = []
    current: list[str] = []
    count = 0
    for sentence in sentences:
        words = _words(sentence)
        if count and count + words > TARGET_WORDS:
            parts.append(" ".join(current))
            current, count = [], 0
        current.append(sentence)
        count += words
    if current:
        parts.append(" ".join(current))
    if len(parts) == 1 and _words(parts[0]) > MAX_WORDS:
        words = parts[0].split()
        return [" ".join(words[i:i + TARGET_WORDS]) for i in range(0, len(words), TARGET_WORDS)]
    return parts or [text]


def _merge_small(chunks: list[dict]) -> list[dict]:
    """Fold tiny *untitled* fragments into the previous chunk.

    Titled sections are never merged: the section ref is the evidence anchor a
    gap quotes, so structure wins over uniform chunk size.
    """
    out: list[dict] = []
    for chunk in chunks:
        if (
            chunk["words"] < MIN_WORDS
            and not chunk.get("heading")
            and out
            and out[-1]["words"] + chunk["words"] <= TARGET_WORDS
            and _same_parent(out[-1], chunk)
        ):
            previous = out[-1]
            previous["text"] = f"{previous['text']}\n{chunk['text']}".strip()
            previous["words"] += chunk["words"]
            previous["char_end"] = chunk["char_end"]
            if chunk["kind"] == "table":
                previous["kind"] = "table"
            continue
        out.append(chunk)
    return out


def _same_parent(a: dict, b: dict) -> bool:
    return _parent_ref(a.get("ref", "")) == _parent_ref(b.get("ref", ""))


def _parent_ref(ref: str) -> str:
    return ref.rsplit(".", 1)[0] if "." in ref else ref


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------
def _assign_identity(doc_id: str, doc: dict, chunks: list[dict]) -> None:
    seen: dict[str, int] = {}

    for index, chunk in enumerate(chunks, start=1):
        ref = str(chunk.get("ref") or f"block-{index}")
        slug = _slug(ref)
        base = f"{doc_id}#{slug}"
        seen[base] = seen.get(base, 0) + 1

        if chunk.get("_parts", 1) > 1:
            if chunk.get("_part", 0) == 0:
                chunk_id = base
            else:
                chunk_id = f"{base}-p{chunk['_part'] + 1}"
                chunk["parent_id"] = base
        else:
            chunk_id = base if seen[base] == 1 else f"{base}-{seen[base]}"

        chunk["id"] = chunk_id
        chunk["document_id"] = doc_id
        chunk["ref"] = ref
        chunk["heading"] = chunk.get("heading", "")
        chunk["heading_path"] = _heading_path(ref, chunk["heading"])
        chunk["page"] = None
        chunk["derived"] = True
        chunk["chunker_version"] = CHUNKER_VERSION
        chunk["document_version"] = str(doc.get("version") or "")
        chunk.pop("lines", None)
        chunk.pop("preamble", None)
        chunk.pop("_part", None)
        chunk.pop("_parts", None)
        chunk.pop("words", None)


def _heading_path(ref: str, heading: str) -> list[str]:
    if re.fullmatch(r"\d+(?:\.\d+)*", ref or ""):
        parts = ref.split(".")
        return [".".join(parts[: i + 1]) for i in range(len(parts))]
    if ref:
        return [ref]
    return [heading] if heading else []


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value).strip()).strip("-")
    return slug[:60] or "part"


def _words(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def _is_table(lines: list[tuple[int, int, str]]) -> bool:
    rows = [raw for _, _, raw in lines if raw.strip()]
    if len(rows) < 3:
        return False
    table_rows = sum(1 for raw in rows if raw.count("|") >= 2 or "\t" in raw)
    return table_rows / len(rows) >= 0.6
