"""Automated scraper for the India regulatory sources.

Fetches the official RBI notification pages, extracts the document body from the
HTML, normalises the mixed encoding, and writes plain text into backend/data/.

    python backend/scrape.py            # refresh every configured source
    python backend/scrape.py --check    # fetch + extract, do not write
    python backend/scrape.py --source rbi-digital-lending-2025

The committed text files are the extraction output; this script is how they are
reproduced. rbidocs PDFs are not downloaded (the host blocks automated clients);
the notification pages are the authoritative HTML and link to the PDFs.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MANIFEST = DATA / "scrape-manifest.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

# Configured India sources. `ref` anchors the extraction on the circular number.
SOURCES: list[dict] = [
    {
        "id": "rbi-digital-lending-2025",
        "authority": "RBI",
        "ref": "RBI/2025-26/36",
        "title": "Reserve Bank of India (Digital Lending) Directions, 2025",
        "page_url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848&Mode=0",
        "out": "rbi_digital_lending_2025.txt",
        "drop_index": True,
    },
    {
        "id": "rbi-digital-lending-2022",
        "authority": "RBI",
        "ref": "RBI/2022-23/111",
        "title": "Guidelines on Digital Lending, 2022",
        "page_url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382&Mode=0",
        "out": "rbi_digital_lending_2022.txt",
        "drop_index": False,
    },
]

# RBI numeric character entities decode to C1 controls; map them back to punctuation.
ENTITY_FIX = {0x91: "'", 0x92: "'", 0x93: '"', 0x94: '"', 0x96: "\u2013", 0x97: "\u2014", 0x85: " "}


def decode_mixed(raw: bytes) -> str:
    """Decode UTF-8 with stray cp1252 bytes without losing either."""
    text = raw.decode("utf-8", errors="surrogateescape")
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xDC80 <= code <= 0xDCFF:
            out.append(bytes([code - 0xDC00]).decode("cp1252", errors="replace"))
        else:
            out.append(ch)
    return "".join(out)


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = value.translate(ENTITY_FIX)
    return value.replace("\ufffd", " ")


def extract(raw: bytes, ref: str, drop_index: bool) -> str:
    text = decode_mixed(raw)
    start = text.find(ref)
    if start < 0:
        raise ValueError(f"reference {ref} not found in the page")
    end = text.find("More Links", start)
    segment = text[start:end if end > start else len(text)]

    segment = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", segment, flags=re.S | re.I)
    segment = re.sub(r"<br\s*/?>", "\n", segment, flags=re.I)
    segment = re.sub(r"</(p|div|tr|li|h[1-6]|table)>", "\n", segment, flags=re.I)
    segment = re.sub(r"<[^>]+>", "", segment)
    segment = clean_text(segment)

    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in segment.splitlines()]
    lines = [line for line in lines if line]

    if drop_index:
        # The 2025 page repeats the section list before the body; keep the body.
        try:
            start_index = lines.index("Index")
            first_chapter = lines.index("Chapter I: Preliminary", start_index)
            second_chapter = lines.index("Chapter I: Preliminary", first_chapter + 1)
            lines = lines[:start_index] + lines[second_chapter:]
        except ValueError:
            pass

    return "\n".join(lines) + "\n"


def fetch(url: str, timeout: int = 45) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def run(source: dict, write: bool) -> dict:
    raw = fetch(source["page_url"])
    text = extract(raw, source["ref"], source["drop_index"])
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    target = DATA / source["out"]
    previous = target.read_text(encoding="utf-8") if target.exists() else ""
    changed = previous.replace("\r\n", "\n").strip() != text.strip()
    if write:
        target.write_text(text, encoding="utf-8", newline="\n")
    return {
        "id": source["id"],
        "authority": source["authority"],
        "ref": source["ref"],
        "page_url": source["page_url"],
        "out": source["out"],
        "sha256": digest,
        "words": len(text.split()),
        "changed": changed,
        "written": write,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch and extract RBI publications")
    parser.add_argument("--source", help="only this source id")
    parser.add_argument("--check", action="store_true", help="extract but do not write")
    args = parser.parse_args(argv)

    selected = [s for s in SOURCES if not args.source or s["id"] == args.source]
    if not selected:
        print(f"unknown source: {args.source}", file=sys.stderr)
        return 2

    results: list[dict] = []
    failures = 0
    for source in selected:
        try:
            result = run(source, write=not args.check)
            results.append(result)
            state = "written" if result["written"] else "checked"
            change = "changed" if result["changed"] else "unchanged"
            print(f"{source['id']}: {result['words']} words · {change} · {state}")
        except Exception as exc:  # noqa: BLE001 - report, keep other sources going
            failures += 1
            print(f"{source['id']}: FAILED — {exc}", file=sys.stderr)

    if results and not args.check:
        manifest = [
            {k: v for k, v in result.items() if k not in ("changed", "written")}
            for result in results
        ]
        MANIFEST.write_text(json.dumps({"sources": manifest}, indent=2) + "\n", encoding="utf-8")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
