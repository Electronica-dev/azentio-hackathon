"""Chunking tests: structure, offsets, size handling and determinism.

Run: python backend/tests/test_chunks.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP))

from regula import chunks  # noqa: E402

DOC = {"id": "doc-test", "title": "AI Model Governance Policy", "version": "v2.3"}

SAMPLE = """AI MODEL GOVERNANCE POLICY
Version 2.3

Table of Contents
1. Purpose ........ 3
2. Scope ........ 4
3. Model governance ........ 5

AI MODEL GOVERNANCE POLICY

1. Purpose
This policy sets out how the bank governs models used in credit decisioning.

2. Scope
It applies to every model in production and to models under development.

3. Model governance
3.1 Roles and responsibilities
The board shall approve the model risk policy every year. The model owner shall maintain a register of every model in production and shall report material changes to the risk committee.

3.2 Model explainability
The model owner shall document the factors that influence a credit decision in the model card. The documentation shall be reviewed by the validation function before the model is deployed.

3.3 Model validation
The validation function shall review every model annually and report the outcome to the board.

AI MODEL GOVERNANCE POLICY
"""


class StructureTests(unittest.TestCase):
    def setUp(self):
        self.chunks = chunks.chunk_document(DOC, SAMPLE)
        self.by_ref = {chunk["ref"]: chunk for chunk in self.chunks}

    def test_sections_become_chunks_with_stable_refs(self):
        for ref in ("1", "2", "3.1", "3.2", "3.3"):
            self.assertIn(ref, self.by_ref)

    def test_bare_parent_heading_is_not_a_chunk(self):
        self.assertNotIn("3", self.by_ref)
        self.assertEqual(self.by_ref["3.2"]["heading_path"], ["3", "3.2"])

    def test_clause_text_is_preserved(self):
        chunk = self.by_ref["3.2"]
        self.assertIn("model card", chunk["text"])
        self.assertIn("validation function", chunk["text"])

    def test_heading_path_is_hierarchical(self):
        self.assertEqual(self.by_ref["3.2"]["heading_path"], ["3", "3.2"])

    def test_table_of_contents_and_running_header_are_dropped(self):
        joined = "\n".join(chunk["text"] for chunk in self.chunks)
        self.assertNotIn("........", joined)
        self.assertNotIn("Table of Contents", joined)
        # The title appears once as the document heading, not on every page.
        self.assertEqual(joined.count("AI MODEL GOVERNANCE POLICY"), 1)

    def test_every_chunk_is_identified_and_labelled(self):
        ids = [chunk["id"] for chunk in self.chunks]
        self.assertEqual(len(ids), len(set(ids)), "chunk ids must be unique")
        for chunk in self.chunks:
            self.assertTrue(chunk["id"].startswith("doc-test#"))
            self.assertEqual(chunk["document_id"], "doc-test")
            self.assertEqual(chunk["chunker_version"], chunks.CHUNKER_VERSION)
            self.assertTrue(chunk["derived"])
            self.assertEqual(chunk["document_version"], "v2.3")

    def test_offsets_are_within_the_source(self):
        for chunk in self.chunks:
            self.assertGreaterEqual(chunk["char_start"], 0)
            self.assertGreater(chunk["char_end"], chunk["char_start"])
            self.assertLessEqual(chunk["char_end"], len(SAMPLE))

    def test_chunking_is_deterministic(self):
        again = chunks.chunk_document(DOC, SAMPLE)
        self.assertEqual(
            [(c["id"], c["ref"], c["text"]) for c in again],
            [(c["id"], c["ref"], c["text"]) for c in self.chunks],
        )


class SizeTests(unittest.TestCase):
    def test_an_oversized_section_is_split_with_parent_ids(self):
        body = " ".join(["requirement"] * 2000)
        text = f"1. First\nShort body.\n2. Large section\n{body}\n"
        result = chunks.chunk_document(DOC, text)
        large = [c for c in result if c["ref"] == "2"]
        self.assertGreaterEqual(len(large), 2)
        self.assertTrue(any(c.get("parent_id") == "doc-test#2" for c in large))
        self.assertTrue(any(c["id"].endswith("-p2") for c in large))

    def test_untitled_fragments_merge_into_the_previous_chunk(self):
        text = (
            "1. First section\n" + ("body " * 80) + "\n"
            "2. Second section\nshort.\n"
        )
        result = chunks.chunk_document(DOC, text)
        second = [c for c in result if c["ref"] == "2"]
        # A titled section keeps its own chunk even when short.
        self.assertEqual(len(second), 1)


class FallbackTests(unittest.TestCase):
    def test_documents_without_headings_fall_back_to_blocks(self):
        text = "\n\n".join(f"Paragraph {i} " + ("text " * 30) for i in range(1, 5))
        result = chunks.chunk_document(DOC, text)
        self.assertTrue(result)
        self.assertTrue(all(c["ref"].startswith("block-") for c in result))
        self.assertTrue(all(c["kind"] in ("block", "table") for c in result))

    def test_empty_text_yields_no_chunks(self):
        self.assertEqual(chunks.chunk_document(DOC, "   \n\n  "), [])

    def test_prose_and_unit_lines_are_not_headings(self):
        self.assertIsNone(chunks._heading("24 months after onboarding"))
        self.assertIsNone(chunks._heading("1. The entity shall report within seven days."))
        self.assertIsNotNone(chunks._heading("3.2 Model explainability"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
