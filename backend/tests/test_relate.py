"""Relationship inference and upload tests.

The point of these tests is precision, not coverage: a wrong link fabricates a
whole change program, so the engine is allowed to abstain but not to guess.

Run: python backend/tests/test_relate.py
"""
from __future__ import annotations

import base64
import io
import os
import sys
import unittest
import zipfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import extract_api, relate, store, upload  # noqa: E402

DL_2022 = """1. Short title and commencement
These Guidelines may be called the Digital Lending Guidelines, 2022.
2. Default loss guarantee
The default loss guarantee shall not exceed five per cent of the loan portfolio.
3. Cooling off period
The borrower shall be allowed to exit the loan within three days."""

DL_2024 = DL_2022 + """
4. Data storage
Every lending service provider shall store the data of Indian borrowers in India."""

DL_2026 = """1. Short title and commencement
This Direction may be called the Digital Lending (Amendment) Direction, 2026.
2. Amendment to Section 7 - default loss guarantee
In Section 7 of the Directions, for the words "five per cent", the words "ten per cent" shall be substituted."""

KYC_2026 = """1. Short title and commencement
This Direction may be called the Know Your Customer (Amendment) Direction, 2026.
2. Amendment to Section 16 - periodic updation of KYC
Every Regulated Entity shall carry out periodic updation of KYC records once every twelve months."""

CYBER_2026 = """1. Short title and commencement
This Framework may be called the Cyber Security and Cyber Resilience Framework, 2026.
2. Security operations
Every regulated entity shall operate a security operations centre on a twenty-four by seven basis."""


def doc(doc_id, title, published, text, authority="RBI", ref=""):
    return {
        "id": doc_id,
        "title": title,
        "published": published,
        "authority": authority,
        "ref": ref,
        "text": text,
    }


class GateTests(unittest.TestCase):
    def test_different_authority_is_never_diffed(self):
        candidate = doc("sebi-1", "Cyber Security and Cyber Resilience Framework", "2024-01-01", CYBER_2026, authority="SEBI")
        new = doc("rbi-1", "Cyber Security and Cyber Resilience Framework", "2026-01-01", CYBER_2026, authority="RBI")
        result = relate.decide(new, [candidate])
        self.assertEqual(result["status"], "standalone")
        self.assertIsNone(result["prior_source_id"])

    def test_newer_candidate_cannot_be_a_predecessor(self):
        candidate = doc("c-2027", "Digital Lending Directions", "2027-01-01", DL_2024)
        new = doc("c-2026", "Digital Lending Directions", "2026-01-01", DL_2026)
        self.assertEqual(relate.decide(new, [candidate])["status"], "standalone")

    def test_duplicate_hash_is_rejected(self):
        candidate = doc("c-1", "Digital Lending Directions", "2025-01-01", DL_2024)
        new = doc("c-1", "Digital Lending Directions", "2026-01-01", DL_2026)
        new["hash"] = "abc"
        candidate["hash"] = "abc"
        self.assertEqual(relate.decide(new, [candidate])["status"], "standalone")

    def test_topical_siblings_are_not_diffed(self):
        lending = doc("dl-2025", "Reserve Bank of India (Digital Lending) Directions, 2025", "2025-05-08", DL_2024)
        result = relate.decide(doc("kyc-2026", "Master Direction - Know Your Customer (KYC) Direction, 2026", "2026-10-30", KYC_2026), [lending])
        self.assertEqual(result["status"], "standalone")
        self.assertIsNone(result["prior_source_id"])


class DecisionTests(unittest.TestCase):
    def test_citation_is_decisive(self):
        candidate = doc("dl-2022", "Guidelines on Digital Lending", "2022-09-02", DL_2022, ref="RBI/2022-23/111")
        new = doc(
            "dl-2025", "Digital Lending Directions, 2025", "2025-05-08",
            "1. Short title\n2. Repeal\nWith the issuance of these Directions, the instructions in "
            "RBI/2022-23/111 stand repealed.",
            ref="RBI/2025-26/36",
        )
        result = relate.decide(new, [candidate])
        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["prior_source_id"], "dl-2022")
        self.assertGreaterEqual(result["confidence"], relate.DECISIVE)
        names = [s["name"] for s in result["signals"]]
        self.assertIn("cites_reference", names)

    def test_amendment_links_to_nearest_consolidated_version(self):
        older = doc("dl-2022", "Digital Lending Directions", "2022-01-01", DL_2022)
        newer = doc("dl-2024", "Digital Lending Directions", "2024-01-01", DL_2024)
        new = doc("dl-2026", "Digital Lending Directions, 2025 - Amendment 2026", "2026-01-01", DL_2026)
        result = relate.decide(new, [older, newer])
        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["prior_source_id"], "dl-2024", "must pick the immediately preceding version")
        self.assertGreaterEqual(result["confidence"], 0.75)

    def test_grey_band_asks_a_human_instead_of_guessing(self):
        shared = (
            "1. Scope\nThis framework applies to every regulated entity and to the governance "
            "of consumer protection across all retail products.\n"
            "2. Governance\nThe board shall approve a consumer protection policy every year."
        )
        candidate = doc("cp-2022", "Consumer Protection Framework", "2022-01-01", shared)
        new = doc(
            "cp-2026", "Consumer Protection Framework - Liquidity Addendum", "2026-01-01",
            shared + "\n3. Liquidity\nThe entity shall hold a liquidity buffer at all times.",
        )
        result = relate.decide(new, [candidate])
        self.assertEqual(result["status"], "proposed")
        self.assertIsNone(result["prior_source_id"])
        self.assertTrue(result["alternatives"])

    def test_manual_pin_beats_inference(self):
        candidate = doc("dl-2024", "Digital Lending Directions", "2024-01-01", DL_2024)
        pinned = doc("dl-2026", "Digital Lending Directions, 2025 - Amendment 2026", "2026-01-01", DL_2026)
        pinned["prior_doc"] = "some-pinned-file.txt"
        result = relate.decide(pinned, [candidate])
        self.assertTrue(result["pinned"])
        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["confidence"], 1.0)
        self.assertEqual(result["prior_doc"], "some-pinned-file.txt")

    def test_backfill_repoints_the_successor(self):
        old = doc("dl-2022", "Digital Lending Directions", "2022-01-01", DL_2022)
        successor = doc("dl-2026", "Digital Lending Directions, 2025 - Amendment 2026", "2026-01-01", DL_2026)
        inserted = doc("dl-2024", "Digital Lending Directions", "2024-01-01", DL_2024)

        edges = relate.backfill(inserted, [old, successor])
        self.assertEqual(len(edges), 1)
        edge = edges[0]
        self.assertEqual(edge["source_id"], "dl-2026")
        self.assertEqual(edge["new_prior_source_id"], "dl-2024")

    def test_backfill_never_moves_a_pin(self):
        old = doc("dl-2022", "Digital Lending Directions", "2022-01-01", DL_2022)
        successor = doc("dl-2026", "Digital Lending Directions, 2025 - Amendment 2026", "2026-01-01", DL_2026)
        successor["prior_doc"] = "pinned.txt"
        inserted = doc("dl-2024", "Digital Lending Directions", "2024-01-01", DL_2024)
        self.assertEqual(relate.backfill(inserted, [old, successor]), [])

    def test_chain_orders_versions_oldest_first(self):
        docs = [
            doc("dl-2024", "Digital Lending Directions", "2024-01-01", DL_2024),
            doc("dl-2022", "Digital Lending Directions", "2022-01-01", DL_2022),
        ]
        new = doc("dl-2026", "Digital Lending Directions, 2025 - Amendment 2026", "2026-01-01", DL_2026)
        ids = [d["id"] for d in relate.chain(docs, new)]
        self.assertEqual(ids, ["dl-2022", "dl-2024", "dl-2026"])


class ExtractTests(unittest.TestCase):
    def test_docx_text_is_extracted(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "word/document.xml",
                '<w:document><w:body><w:p><w:r><w:t>Master Direction - KYC</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>Amendments to periodic updation requirements apply.</w:t></w:r></w:p></w:body></w:document>',
            )
        text, kind = upload.extract("circular.docx", buffer.getvalue())
        self.assertEqual(kind, "docx")
        self.assertIn("Master Direction - KYC", text)

    def test_title_skips_letterhead_and_reference(self):
        text = (
            "RESERVE BANK OF INDIA\nDepartment of Regulation\nRBI/2027-28/12\n"
            "Master Direction - Know Your Customer (KYC) Direction, 2016\n"
            "Amendment - 2027\n\n1. Short title and commencement"
        )
        self.assertEqual(
            upload._title(text, "upload.txt"),
            "Master Direction - Know Your Customer (KYC) Direction, 2016 Amendment - 2027",
        )

    def test_preview_links_against_the_repository(self):
        text = (
            "RESERVE BANK OF INDIA\nDepartment of Regulation\n\n"
            "RBI/2028-29/04\n\n"
            "Master Direction - Know Your Customer (KYC) Direction, 2016\n"
            "Amendment - 2028\n\n"
            "1. Short title and commencement\n"
            "(1) This Direction may be called the KYC (Amendment) Direction, 2028.\n\n"
            "2. Amendment to Section 16 - periodic updation of KYC\n"
            "Every Regulated Entity shall update KYC records once every three months."
        )
        out = extract_api.extract_document({"text": text}, store.build_state())
        self.assertEqual(out["relationship"]["status"], "linked")
        self.assertEqual(out["relationship"]["prior_source_id"], "src-kyc-2026")
        self.assertEqual(out["source"]["ref"], "RBI/2028-29/04")

    def test_title_prefers_the_filename_over_a_mentioned_act(self):
        text = (
            "COPYRIGHT:\nThis work has been transmitted to you as a subscriber.\n\n"
            "MUTUAL BANKS ACT 124 OF 1993\n\n"
            "Financial Sector Regulation Act 9 of 2017\n"
        )
        self.assertEqual(
            upload._title(text, "mutual-banks-act-124-of-1993-v3.pdf"),
            "MUTUAL BANKS ACT 124 OF 1993",
        )

    def test_pdf_falls_back_when_the_library_is_unavailable(self):
        raw = b"%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT /F1 12 Tf (Digital Lending Amendment 2026) Tj ET\nendstream\n%%EOF"
        original = upload._pdf_with_pypdf
        upload._pdf_with_pypdf = lambda _raw: ""
        try:
            text, kind = upload.extract("amendment.pdf", raw)
        finally:
            upload._pdf_with_pypdf = original
        self.assertIn("Digital Lending", text)
        self.assertIn(kind, ("pdf", "needs_ocr"))

    def test_scanned_pdf_yields_a_friendly_error(self):
        raw = b"%PDF-1.4\n1 0 obj\n<<>>\nstream\nnot compressed\nendstream\n%%EOF"
        with self.assertRaises(ValueError) as ctx:
            upload.ingest(store.build_state(), {"filename": "scan.pdf", "content_base64": base64.b64encode(raw).decode()})
        self.assertIn("needs OCR", str(ctx.exception))

    def test_oversized_upload_is_rejected(self):
        with self.assertRaises(ValueError):
            upload.decode(base64.b64encode(b"x" * (upload.MAX_BYTES + 1)).decode())


class UploadTests(unittest.TestCase):
    """Integration on the real repository; cleans up the file it writes."""

    TEXT = """RESERVE BANK OF INDIA
Department of Regulation

RBI/2027-28/12

Master Direction - Know Your Customer (KYC) Direction, 2016
Amendment - 2027

1. Short title and commencement
(1) This Direction may be called the Know Your Customer (KYC) (Amendment) Direction, 2027.

2. Amendment to Section 16 - periodic updation of KYC
In the Master Direction, for Section 16, the following section shall be substituted, namely:
16. Periodic updation of KYC
(1) Every Regulated Entity shall carry out periodic updation of KYC records at the following
intervals:
(a) high-risk customers - at least once every six months;
(b) medium-risk customers - at least once every twelve months.

3. Amendment to Section 17 - beneficial ownership
The natural person who owns or controls more than five per cent of the shares shall be
identified as the beneficial owner.
"""

    def _upload(self, state, text, filename="kyc-2027.txt"):
        payload = {"filename": filename, "content_base64": base64.b64encode(text.encode()).decode()}
        return upload.ingest(state, payload)

    def _cleanup(self, result):
        source = result.get("source") or {}
        name = source.get("doc")
        if not name:
            return
        target = upload.DATA / name
        if target.exists():
            target.unlink()
        parent = target.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

    def test_txt_upload_is_related_extracted_and_analysed(self):
        state = store.build_state()
        result = self._upload(state, self.TEXT)
        try:
            self.assertFalse(result["duplicate"])
            self.assertEqual(result["quality"], "text")
            self.assertIsNotNone(result["run"])
            self.assertGreater(result["run"]["stats"]["obligations"], 0)
            self.assertIn(result["relationship"]["status"], ("linked", "proposed"))
            self.assertEqual(
                [s["id"] for s in state["sources"]][-1],
                result["source"]["id"],
            )
        finally:
            self._cleanup(result)

    def test_reupload_is_reported_as_duplicate(self):
        state = store.build_state()
        first = self._upload(state, self.TEXT)
        try:
            second = self._upload(state, self.TEXT)
            self.assertTrue(second["duplicate"])
            self.assertIsNone(second["relationship"])
        finally:
            self._cleanup(first)

    def test_upload_is_recorded_in_the_ledger(self):
        state = store.build_state()
        result = self._upload(state, self.TEXT)
        try:
            ledger = state["uploads"][-1]
            self.assertEqual(ledger["filename"], "kyc-2027.txt")
            self.assertEqual(ledger["source_id"], result["source"]["id"])
            self.assertEqual(ledger["bytes"], len(self.TEXT.encode()))
            self.assertEqual(ledger["sha256"], result["source"]["hash"])
            self.assertIn("Periodic updation", ledger["text"])
            self.assertFalse(ledger["text_truncated"])
            self.assertEqual(ledger["relationship"]["status"], result["relationship"]["status"])
        finally:
            self._cleanup(result)

    def test_uploads_pin_the_database_across_a_date_rollover(self):
        state = store.build_state()
        result = self._upload(state, self.TEXT)
        original = store.DB_PATH
        test_db = store.DATA_DIR / f"db-selftest-{os.getpid()}.json"
        try:
            state["meta"]["as_of"] = "2000-01-01"
            store.DB_PATH = test_db
            store.save(state)
            loaded = store.load_or_build()
            self.assertIn(result["source"]["id"], [s["id"] for s in loaded["sources"]])
            self.assertTrue(loaded["uploads"])
        finally:
            store.DB_PATH = original
            test_db.unlink(missing_ok=True)
            self._cleanup(result)

    def test_pdf_text_operators_are_read_best_effort(self):
        body = b"BT /F1 12 Tf (Digital Lending Amendment 2026) Tj ET"
        raw = b"%PDF-1.4\n1 0 obj\n<<>>\nstream\n" + body + b"\nendstream\n%%EOF"
        text, kind = upload.extract("amendment.pdf", raw)
        self.assertIn("Digital Lending", text)
        self.assertIn(kind, ("pdf", "needs_ocr"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
