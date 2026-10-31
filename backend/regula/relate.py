"""Relationship inference: does this document have a predecessor worth diffing?

The decision is deliberately two-stage.

``recall``
    Gate on authority, date order, language and duplicate status, then keep only
    documents that look like the same instrument. This is cheap and generous.

``warrant``
    Decide whether a surviving candidate is the version this document amends or
    replaces -- and at what confidence. This is strict and evidence-bound.

A topical match is **not** a warrant. Two circulars about KYC are siblings, not
versions of each other; diffing siblings fabricates a change program (every
clause reads ``modified``, every impact is false). So the auto-link band is
precision-first and the grey band parks the pair for a human, optionally with a
model-written rationale.

Public API::

    decide(doc, corpus, index=None)      -> relationship dict
    relate_state(state, entry)           -> relationship dict, corpus from state
    backfill(doc, corpus)                -> edges that should now point at `doc`
    chain(docs, doc)                     -> ordered version chain (oldest first)

A ``doc``/``corpus`` entry is any dict with ``id``, ``title`` and optionally
``authority``/``regulator``, ``ref``, ``published``, ``effective``, ``doc_type``,
``doc`` (file name under ``backend/data``) and ``text``.
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from datetime import date
from pathlib import Path

from .ingest import parse_document
from .text import extract_params, sentences

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ---------------------------------------------------------------------------
# Tunables. Exposed so a reviewer can see exactly what moves a decision.
# ---------------------------------------------------------------------------
AUTO_LINK = 0.70         # weak score at or above which a link is automatic
PROPOSE_FLOOR = 0.45     # below this the document is standalone, not "unresolved"
AMBIGUITY_MARGIN = 0.06  # two candidates closer than this -> always ask a human
DECISIVE = 0.85          # confidence floor for an evidence-backed link
DUPLICATE_SIM = 0.995    # above this the upload is a re-publication, not a version

# Words that carry no instrument identity. Regulatory prose is full of them.
BOILER = set("""
master direction directions circular circulars guideline guidelines regulation
regulations framework notification notifications amendment amendments office
department central reserve bank india rbi sebi sama cbuae cbn authority
consolidated updated revised version part chapter section para clause annex
annexure appendix schedule general specific relevant applicable extant
""".split())

STOP = set("""
a an the and or of to in for on by with from is are was were be been being shall
must may should such any every all where which who whom whose this that these
those it its as at not no than then there their they them we our you your more
most other into within without under over between during after before upon
period person persons entity entities regulated customer customers bank banks
provided however namely case said same other such herein hereof thereto
know your
""".split())

TOKEN_RE = re.compile(r"[a-z][a-z0-9\-]{2,}")

# Reference identifiers by authority. Normalised for comparison, so
# "RBI/2022-23/111" and "RBI/ 2022-23 / 111" both fold to "rbi202223111".
REF_PATTERNS = (
    re.compile(r"RBI/\d{4}-\d{2}/\d+"),
    re.compile(r"SEBI/[A-Za-z0-9/\-]{6,60}"),
    re.compile(r"(?:CBUAE\s+)?Circular\s+No\.?\s*\d+\s*/\s*\d{4}", re.I),
    re.compile(r"\b[A-Z]{2,6}/[A-Za-z0-9][A-Za-z0-9/\-]{4,50}"),
)

# Language that presupposes an earlier instrument. The weight is confidence that
# this phrase *establishes a predecessor relationship*, before we check whether
# it points at a specific candidate.
SUPERSESSION = (
    (re.compile(r"in\s+supersession\s+of", re.I), 1.00),
    (re.compile(r"hereby\s+(?:repealed|rescinded|withdrawn)", re.I), 1.00),
    (re.compile(r"shall\s+stand\s+repealed", re.I), 1.00),
    (re.compile(r"stand\s+repealed", re.I), 0.95),
    (re.compile(r"in\s+partial\s+modification\s+of", re.I), 0.90),
    (re.compile(r"shall\s+be\s+substituted", re.I), 0.55),
    (re.compile(r"\bin\s+section\s+\d+[a-z]?\s+of\s+the\s+"
                r"(?:directions|master\s+direction|guidelines|circular)", re.I), 0.50),
    (re.compile(r"read\s+with", re.I), 0.35),
)

ARABIC_RE = re.compile(r"[\u0600-\u06ff]")
YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _now_year() -> int:
    return date.today().year


def _tokens(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall((text or "").lower())
            if t not in STOP and t not in BOILER]


def _norm_ref(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _refs(text: str) -> set[str]:
    found: set[str] = set()
    for pattern in REF_PATTERNS:
        for match in pattern.finditer(text or ""):
            norm = _norm_ref(match.group(0))
            if len(norm) >= 10:
                found.add(norm)
    return found


def refs_of(entry: dict) -> set[str]:
    """Reference identifiers a document carries: in its body *or* its metadata."""
    found = _refs(text_of(entry))
    declared = _norm_ref(str(entry.get("ref") or ""))
    if len(declared) >= 10:
        found.add(declared)
    return found


def _date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _order_date(entry: dict) -> date | None:
    """Date used for ordering. Falls back to the year in the reference number.

    "RBI/2027-28/12" is fiscal year 2027-28, so the document cannot predate
    2027. That is enough to order it in a chain without inventing a day.
    """
    stated = _date(str(entry.get("published") or ""))
    if stated:
        return stated
    ref_year = YEAR_RE.search(str(entry.get("ref") or ""))
    if ref_year:
        return date(int(ref_year.group(0)), 1, 1)
    # Amendments append their year: "KYC Direction, 2016 - Amendment 2028" is
    # a 2028 document, so the *last* year is the version year.
    years = YEAR_RE.findall(str(entry.get("title") or ""))
    if years:
        return date(int(years[-1]), 1, 1)
    return None


def _arabic_ratio(text: str) -> float:
    text = text or ""
    if not text:
        return 0.0
    return len(ARABIC_RE.findall(text)) / max(1, len(text))


def _authority(entry: dict) -> str:
    return str(entry.get("authority") or entry.get("regulator") or "").strip().upper()


AUTHORITY_HINTS = (
    ("RESERVE BANK OF INDIA", "RBI"),
    ("SECURITIES AND EXCHANGE BOARD", "SEBI"),
    ("SAUDI CENTRAL BANK", "SAMA"),
    ("CENTRAL BANK OF THE UAE", "CBUAE"),
    ("CENTRAL BANK OF THE UNITED ARAB EMIRATES", "CBUAE"),
    ("SOUTH AFRICAN RESERVE BANK", "SARB"),
    ("SAMA", "SAMA"),
    ("SARB", "SARB"),
)

REGION_OF = {
    "RBI": "INDIA", "SEBI": "INDIA", "SAMA": "KSA",
    "CBUAE": "UAE", "SARB": "SOUTH_AFRICA", "CBN": "AFRICA",
}


def guess_authority(text: str) -> str:
    """Read the authority off the letterhead. Empty when it is not obvious."""
    head = (text or "")[:600].upper()
    for needle, authority in AUTHORITY_HINTS:
        if needle in head:
            return authority
    return ""


def guess_region(authority: str) -> str:
    return REGION_OF.get(str(authority or "").strip().upper(), "")


def text_of(entry: dict) -> str:
    """Resolve a document's text: explicit ``text`` first, then its file."""
    if entry.get("text"):
        return str(entry["text"])
    name = entry.get("doc")
    if name:
        path = DATA_DIR / str(name)
        try:
            if path.exists():
                return path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
    return ""


def _bigrams(text: str) -> set[str]:
    words = _tokens(text)[:24]
    return {" ".join(pair) for pair in zip(words, words[1:])}


# ---------------------------------------------------------------------------
# Corpus index: TF-IDF over the repository, not over the asset inventory.
# ---------------------------------------------------------------------------
class Index:
    """IDF over document text, plus cached clause vectors for similarity."""

    def __init__(self, texts: list[str]):
        self.n = len(texts)
        df: Counter = Counter()
        for text in texts:
            df.update(set(_tokens(text)))
        self.idf = {w: math.log((self.n + 1) / (c + 1)) + 1 for w, c in df.items()}
        self._vectors: dict[str, dict[str, float]] = {}

    def idf_of(self, word: str) -> float:
        # An unseen word is maximally distinctive -- it cannot be boilerplate.
        return self.idf.get(word, math.log(self.n + 1) + 1)

    def vec(self, text: str) -> dict[str, float]:
        cached = self._vectors.get(text)
        if cached is not None:
            return cached
        counter = Counter(_tokens(text))
        raw = {t: (1 + math.log(c)) * self.idf_of(t) for t, c in counter.items()}
        norm = math.sqrt(sum(v * v for v in raw.values())) or 1.0
        vector = {t: v / norm for t, v in raw.items()}
        self._vectors[text] = vector
        return vector

    def cosine(self, a: dict[str, float], b: dict[str, float]) -> float:
        if len(a) > len(b):
            a, b = b, a
        return sum(v * b.get(t, 0.0) for t, v in a.items())

    def unit_bests(self, new_text: str, old_text: str) -> list[float]:
        """Best-match similarity for each unit of the new document.

        Whole-document cosine is the wrong tool here: an amendment is often a
        fifth the length of the consolidated instrument it amends, so a global
        cosine is diluted to noise. Comparing the new clauses against their best
        counterpart in the old document is asymmetric in the right direction.
        """
        new_units = _units(new_text)
        old_units = _units(old_text)
        if not new_units or not old_units:
            return []
        if len(new_units) * len(old_units) > 6000:  # pathological upload, sample
            new_units = new_units[:80]
            old_units = old_units[:200]
        old_vectors = [self.vec(u) for u in old_units]
        return [max(self.cosine(self.vec(u), ov) for ov in old_vectors) for u in new_units]

    def content_score(self, new_text: str, old_text: str) -> float:
        best = self.unit_bests(new_text, old_text)
        return sum(best) / len(best) if best else 0.0


def _units(text: str) -> list[str]:
    """Clause-level units, falling back to sentences then the whole text."""
    clauses = parse_document(text)
    if len(clauses) >= 2:
        return [c["text"] for c in clauses]
    found = sentences(text)
    return found or ([text.strip()] if text.strip() else [])


# ---------------------------------------------------------------------------
# Identity: what instrument is this, and what does it say it replaces?
# ---------------------------------------------------------------------------
def family_terms(entry: dict, index: Index) -> set[str]:
    """The few title words that identify the instrument, ranked by rareness.

    Always keeps the top terms rather than applying a hard rareness cut: on a
    two-document corpus every term looks common, and dropping the shared ones
    would erase the very identity we are trying to compare.
    """
    tokens = list(dict.fromkeys(_tokens(entry.get("title", ""))))
    if not tokens:
        tokens = list(dict.fromkeys(_tokens(text_of(entry)[:400])))
    if not tokens:
        return set()
    scored = sorted(((index.idf_of(t), t) for t in tokens), reverse=True)
    return {t for _, t in scored[:4]}


def same_family(a: set[str], b: set[str]) -> bool:
    if not a or not b:
        return False
    shared = a & b
    if len(shared) >= 2:
        return True
    if len(shared) == 1 and (len(a) <= 2 or len(b) <= 2):
        return True
    return len(shared) / len(a | b) >= 0.5


def supersession(text: str) -> tuple[float, str, int, int]:
    """Best supersession phrase in ``text``: (weight, phrase, start, end)."""
    best = (0.0, "", -1, -1)
    for pattern, weight in SUPERSESSION:
        match = pattern.search(text or "")
        if match and weight > best[0]:
            best = (weight, match.group(0), match.start(), match.end())
    return best


def _points_at(text: str, start: int, end: int, needles: list[str], radius: int = 260) -> bool:
    window = (text or "")[max(0, start - radius): end + radius].lower()
    return any(n and n.lower() in window for n in needles)


def _candidate_needles(cand: dict, terms: set[str]) -> list[str]:
    needles = list(terms)
    ref = str(cand.get("ref") or "")
    if ref:
        needles.append(ref)
    for year in YEAR_RE.findall(str(cand.get("title") or "")):
        needles.append(year)
    return [n for n in needles if len(n) > 2]


# ---------------------------------------------------------------------------
# Gates: cheap reasons to stop before scoring
# ---------------------------------------------------------------------------
def gates(doc: dict, cand: dict, doc_terms: set[str], cand_terms: set[str]) -> tuple[bool, str]:
    """Return (passes, reason-if-rejected)."""
    if doc.get("id") and doc.get("id") == cand.get("id"):
        return False, "same document"

    authority, other = _authority(doc), _authority(cand)
    if authority and other and authority != other:
        # A cross-authority edge is only credible when the new text cites the
        # other authority's reference explicitly; that is checked in scoring.
        cited = bool(refs_of(doc) & refs_of(cand))
        if not cited:
            return False, f"different authority ({authority} vs {other})"

    left, right = _order_date(doc), _order_date(cand)
    if left and right and right > left:
        return False, "candidate is newer than the document"

    a_ar, b_ar = _arabic_ratio(text_of(doc)), _arabic_ratio(text_of(cand))
    if (a_ar > 0.08) != (b_ar > 0.08):
        return False, "different language"

    if doc.get("hash") and doc.get("hash") == cand.get("hash"):
        return False, "duplicate content hash"

    if not (same_family(doc_terms, cand_terms) or refs_of(doc) & refs_of(cand)):
        return False, "different instrument"

    return True, ""


# ---------------------------------------------------------------------------
# The decision
# ---------------------------------------------------------------------------
IDENTITY_AUTO = 0.99        # distinctive title terms are identical
IDENTITY_CONTENT_FLOOR = 0.15  # ...and the text overlaps at all


def _adjacency(doc: dict, cand: dict) -> tuple[float, int | None]:
    """Recency in the chain, plus the raw gap for predecessor preference."""
    left = _order_date(doc)
    right = _order_date(cand)
    if not left or not right:
        return 0.35, None  # unknown date never argues for a link
    gap = max(0, (left - right).days)
    if gap <= 200:
        return 1.00, gap
    if gap <= 400:
        return 0.85, gap
    if gap <= 800:
        return 0.65, gap
    if gap <= 1600:
        return 0.40, gap
    return 0.20, gap


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _containment(a: set, b: set) -> float:
    """How much of the smaller set is covered -- robust to uneven verbosity."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def score_pair(doc: dict, cand: dict, index: Index,
               doc_terms: set[str] | None = None,
               cand_terms: set[str] | None = None) -> dict | None:
    """Features for one candidate. Returns None when a gate rejects it.

    This function does not decide anything: it reports evidence, so every
    threshold lives in one place (``decide``).
    """
    doc_terms = family_terms(doc, index) if doc_terms is None else doc_terms
    cand_terms = family_terms(cand, index) if cand_terms is None else cand_terms
    passed, _reason = gates(doc, cand, doc_terms, cand_terms)
    if not passed:
        return None

    doc_text, cand_text = text_of(doc), text_of(cand)

    # --- decisive evidence -------------------------------------------------
    cited = bool(refs_of(doc) & refs_of(cand))
    weight, phrase, start, end = supersession(doc_text)
    targeted = _points_at(doc_text, start, end, _candidate_needles(cand, cand_terms)) if weight else False

    # --- supporting features ----------------------------------------------
    identity = _jaccard(doc_terms, cand_terms)
    bests = index.unit_bests(doc_text, cand_text)
    content = sum(bests) / len(bests) if bests else 0.0
    strong = sum(1 for b in bests if b >= 0.45) / len(bests) if bests else 0.0
    params = _containment(set(extract_params(doc_text, set(doc_terms))),
                          set(extract_params(cand_text, set(cand_terms))))
    headings = _containment(
        {c["heading"].lower() for c in parse_document(doc_text)},
        {c["heading"].lower() for c in parse_document(cand_text)},
    )
    adjacency, gap = _adjacency(doc, cand)

    weak = round(
        0.42 * identity + 0.24 * content + 0.10 * strong
        + 0.12 * params + 0.04 * headings + 0.08 * adjacency,
        3,
    )

    decisive = cited or (weight >= 0.90 and targeted)
    if not decisive and weak < PROPOSE_FLOOR:
        return None

    signals: list[dict] = []
    if cited:
        signals.append({"name": "cites_reference", "value": 1.0,
                        "detail": "the document cites this candidate's reference number"})
    if weight:
        signals.append({"name": "supersession_language", "value": weight,
                        "detail": f'"{phrase}"' + (" pointing at this candidate" if targeted else "")})
    signals += [
        {"name": "instrument_match", "value": round(identity, 2),
         "detail": "shared distinctive title terms: "
                   + (", ".join(sorted(doc_terms & cand_terms)) or "none")},
        {"name": "clause_similarity", "value": round(content, 2),
         "detail": "mean best-match of the new clauses against this document"},
        {"name": "clause_coverage", "value": round(strong, 2),
         "detail": "share of new clauses with a plausible counterpart"},
        {"name": "parameter_overlap", "value": round(params, 2),
         "detail": "shared machine-comparable thresholds"},
        {"name": "adjacency", "value": round(adjacency, 2),
         "detail": "recency in the version chain"},
    ]

    return {
        "document_id": cand.get("id"),
        "title": cand.get("title", ""),
        "ref": cand.get("ref", ""),
        "published": cand.get("published", ""),
        "authority": _authority(cand),
        "decisive": decisive,
        "cited": cited,
        "supersession": weight,
        "targeted": targeted,
        "phrase": phrase,
        "identity": identity,
        "shared_terms": sorted(doc_terms & cand_terms),
        "content": content,
        "strong": strong,
        "params": params,
        "headings": headings,
        "adjacency": adjacency,
        "gap_days": gap,
        "weak_score": weak,
        "signals": signals,
    }


def _index_for(corpus: list[dict], index: Index | None = None) -> Index:
    return index if index is not None else Index([text_of(e) for e in corpus])


def decide(doc: dict, corpus: list[dict], index: Index | None = None) -> dict:
    """Decide the relationship for one document against a repository corpus.

    Order of precedence:
      1. a manual pin always wins (returns ``pinned``);
      2. decisive evidence (citation, or targeted supersession) auto-links;
      3. a strong weak-score auto-links, unless two candidates are close;
      4. the grey band returns ``proposed`` -- the caller must ask a human;
      5. otherwise ``standalone``.
    """
    pinned = doc.get("prior_pinned") or (doc.get("prior_doc") and not doc.get("relationship"))
    if pinned:
        return {
            "status": "linked",
            "prior_source_id": doc.get("prior_source_id"),
            "prior_document_id": None,
            "prior_doc": doc.get("prior_doc"),
            "confidence": 1.0,
            "pinned": True,
            "rationale": "Manual pin: an operator declared this predecessor.",
            "signals": [{"name": "manual_pin", "value": 1.0,
                         "detail": "prior_doc set by an operator; inference is skipped"}],
            "alternatives": [],
        }

    corpus = [e for e in corpus if str(e.get("id")) != str(doc.get("id"))]
    index = _index_for(corpus + [doc], index)
    doc = dict(doc)
    doc["text"] = text_of(doc)
    terms = family_terms(doc, index)

    scored = [s for s in (score_pair(doc, c, index, terms, family_terms(c, index)) for c in corpus) if s]

    if not scored:
        return {
            "status": "standalone",
            "prior_source_id": None,
            "prior_document_id": None,
            "confidence": 0.0,
            "pinned": False,
            "rationale": "No earlier document in the repository looks like this instrument.",
            "signals": [],
            "alternatives": [],
        }

    return _adjudicate(scored)


def _verdict(cand: dict) -> tuple[str, float]:
    """Turn features into (status, confidence) for one candidate."""
    if cand["decisive"]:
        return "linked", (DECISIVE if cand["cited"] else 0.88)
    # An amendment that names the instrument identically and sits immediately
    # after it in the chain is a version, even though its short clauses cannot
    # look lexically similar to a consolidated instrument. A near-identical
    # name also counts when the revision gap is short -- regulators routinely
    # abbreviate ("Know Your Customer" vs "KYC") without changing the
    # instrument. The content floor stops a similarly-titled but unrelated
    # document from riding this rule.
    same_name = cand["identity"] >= IDENTITY_AUTO or (
        cand["identity"] >= 0.5 and cand["gap_days"] is not None and cand["gap_days"] <= 400
    )
    if same_name and cand["nearest"] and cand["content"] >= IDENTITY_CONTENT_FLOOR:
        return "linked", 0.78
    if cand["score"] >= AUTO_LINK:
        return "linked", min(0.84, cand["score"])
    return "proposed", cand["score"]


def _rationale(cand: dict) -> str:
    if cand["cited"]:
        return f"Cites {cand.get('ref') or cand.get('title')} directly."
    if cand["supersession"] >= 0.90 and cand["targeted"]:
        return f'Uses "{cand["phrase"]}", pointing at {cand.get("title")}.'
    if cand["identity"] >= IDENTITY_AUTO and cand["nearest"]:
        return (f"Same instrument ({', '.join(cand['shared_terms'])}) and the "
                f"immediately preceding version; clause similarity {cand['content']:.2f}.")
    return (f"Same instrument ({', '.join(cand['shared_terms']) or 'shared topic'}); "
            f"clause similarity {cand['content']:.2f}, "
            f"parameter overlap {cand['params']:.2f}.")


def _adjudicate(scored: list[dict]) -> dict:
    """Pick one candidate, or hand the decision to a human."""
    dated = [s for s in scored if s["gap_days"] is not None and s["identity"] > 0]
    nearest = min(dated, key=lambda s: s["gap_days"]) if dated else None
    for cand in scored:
        cand["nearest"] = bool(nearest and cand["document_id"] == nearest["document_id"])
        cand["score"] = round(min(1.0, cand["weak_score"] + (0.07 if cand["nearest"] else 0.0)), 3)
        cand["status"], cand["confidence"] = _verdict(cand)

    scored.sort(key=lambda s: (s["status"] == "linked", s["decisive"], s["score"]), reverse=True)
    top = scored[0]
    runner_up = scored[1] if len(scored) > 1 else None

    ambiguous = bool(
        runner_up
        and top["status"] == "linked"
        and runner_up["status"] == "linked"
        and abs(top["score"] - runner_up["score"]) < AMBIGUITY_MARGIN
    )

    if ambiguous:
        # A near-tie is never resolved by a dice roll: two versions of the same
        # instrument are exactly where a wrong pick fabricates the most change.
        status = "proposed"
        rationale = (f"Two earlier documents are within {int(AMBIGUITY_MARGIN * 100)} points -- "
                     f"{top['title']} and {runner_up['title']}. A human should choose.")
    else:
        status = top["status"]
        rationale = _rationale(top)

    return {
        "status": status,
        "prior_source_id": top["document_id"] if status == "linked" else None,
        "prior_document_id": None,
        "confidence": round(top["confidence"], 2),
        "pinned": False,
        "rationale": rationale,
        "signals": top["signals"],
        "alternatives": [
            {"document_id": s["document_id"], "title": s["title"], "ref": s["ref"],
             "confidence": s["confidence"], "score": s["score"],
             "rationale": _rationale(s)}
            for s in scored[:3]
        ],
    }


def assist(result: dict, source: dict) -> dict:
    """Attach a model opinion to a grey-band decision -- advice, not a link.

    The model may only choose from ``result['alternatives']``. A pick never
    changes the status: a ``proposed`` decision still needs a human, it just
    arrives with a second opinion and the phrase the model relied on.
    """
    if result.get("status") != "proposed" or not result.get("alternatives"):
        return result
    from . import enrich  # local import: enrichment is optional and heavier

    if not enrich.is_configured():
        return result
    opinion = enrich.adjudicate_relationship(source, result["alternatives"])
    if opinion:
        result["model_opinion"] = opinion
    return result


# ---------------------------------------------------------------------------
# Repository-level helpers
# ---------------------------------------------------------------------------
def _descriptor(entry: dict) -> dict:
    item = dict(entry)
    item["text"] = text_of(entry)
    item["authority"] = _authority(entry)
    return item


def corpus(state: dict, exclude_id: str | None = None) -> list[dict]:
    """The publications a new document may legitimately be compared against.

    Sources are preferred because they carry the dates and references that the
    gates need. ``status == "prior"`` document records are excluded: a prior
    version is an artifact of an earlier diff, not a separate publication, and
    including it lets one instrument vote twice.
    """
    out: list[dict] = []
    seen_files: set[str] = set()
    source_ids = {str(s.get("id")) for s in state.get("sources", [])}

    for source in state.get("sources", []):
        if str(source.get("id")) == str(exclude_id):
            continue
        entry = _descriptor(source)
        out.append(entry)
        if entry.get("doc"):
            seen_files.add(str(entry["doc"]))

    for doc in state.get("documents", []):
        if str(doc.get("id")) == str(exclude_id):
            continue
        if doc.get("status") == "prior":
            continue
        if str(doc.get("source_id") or "") in source_ids:
            continue
        if doc.get("doc") and str(doc["doc"]) in seen_files:
            continue
        out.append(_descriptor(doc))

    return out


def relate_state(state: dict, entry: dict, exclude: set[str] | None = None) -> dict:
    """Run :func:`decide` with the corpus built from the repository."""
    exclude = (exclude or set()) | {str(entry.get("id"))}
    candidates = [e for e in corpus(state) if str(e.get("id")) not in exclude]
    result = decide(_descriptor(entry), candidates)

    # ``decide`` works in document ids; the rest of the app needs both the
    # owning source (to open it) and the file (to read the prior text).
    document_id = result.get("prior_source_id")
    result["prior_document_id"] = document_id
    if document_id:
        source_id, doc_file = _locate(state, document_id)
        result["prior_source_id"] = source_id
        result["prior_doc"] = doc_file
    elif result.get("prior_doc"):
        # A pin is expressed as a file name; resolve it back to a source so the
        # UI has something to open.
        result["prior_source_id"] = _source_for_file(state, result["prior_doc"])
    return result


def _source_for_file(state: dict, doc_file: str) -> str | None:
    for source in state.get("sources", []):
        if str(source.get("doc")) == str(doc_file):
            return str(source.get("id"))
    for doc in state.get("documents", []):
        if str(doc.get("doc")) == str(doc_file):
            return str(doc.get("source_id") or doc.get("id"))
    return None


def _locate(state: dict, document_id: str) -> tuple[str, str | None]:
    """Map a document id to (owning source id, file name)."""
    for doc in state.get("documents", []):
        if str(doc.get("id")) == str(document_id):
            return str(doc.get("source_id") or doc.get("id")), doc.get("doc")
    return str(document_id), None


def apply_relationship(state: dict, source: dict, result: dict) -> dict:
    """Persist a decision on a source in the shape the rest of the app reads."""
    prior_document_id = result.get("prior_document_id")
    prior_doc = result.get("prior_doc")
    if prior_document_id and not prior_doc:
        _, prior_doc = _locate(state, prior_document_id)

    source["relationship"] = {
        "status": result.get("status", "standalone"),
        "prior_source_id": result.get("prior_source_id"),
        "prior_document_id": prior_document_id,
        "confidence": result.get("confidence", 0.0),
        "rationale": result.get("rationale", ""),
        "pinned": bool(result.get("pinned")),
        "signals": result.get("signals", []),
        "alternatives": result.get("alternatives", []),
    }
    if prior_doc and not source.get("prior_pinned"):
        source["prior_doc"] = prior_doc
    return source["relationship"]


def chain(docs: list[dict], doc: dict, index: Index | None = None) -> list[dict]:
    """The version chain containing ``doc``, oldest first."""
    index = _index_for(docs, index)
    terms = family_terms(doc, index)
    members = [d for d in docs if same_family(terms, family_terms(d, index))]
    members.append(doc)
    unique = {str(d.get("id")): d for d in members}
    return sorted(unique.values(), key=lambda d: (str(d.get("published") or ""), str(d.get("id"))))


def backfill(doc: dict, corpus: list[dict], index: Index | None = None) -> list[dict]:
    """Edges to re-point after inserting an *older* document.

    Uploading a 2024 circular into a repository that already holds the 2026
    amendment changes the 2026 document's predecessor: it should now diff
    against the 2024 text, not against 2025. Each affected document is returned
    with the edge it should adopt. Manual pins are never overridden.
    """
    index = _index_for(corpus + [doc], index)
    older = _date(str(doc.get("published") or ""))
    out: list[dict] = []

    for entry in corpus:
        if str(entry.get("id")) == str(doc.get("id")):
            continue
        if entry.get("prior_pinned") or (entry.get("prior_doc") and not entry.get("relationship")):
            continue  # a human pinned this edge; inference must not move it
        newer = _date(str(entry.get("published") or ""))
        if older and newer and newer <= older:
            continue
        result = decide(_descriptor(entry), [*corpus, doc], index)
        if result.get("status") != "linked":
            continue
        if str(result.get("prior_source_id")) != str(doc.get("id")):
            continue
        current = (entry.get("relationship") or {}).get("prior_source_id")
        if str(current) == str(doc.get("id")):
            continue
        out.append({
            "source_id": entry.get("id"),
            "title": entry.get("title", ""),
            "previous_prior_source_id": current,
            "new_prior_source_id": str(doc.get("id")),
            "confidence": result.get("confidence", 0.0),
            "rationale": f"Backfill: {doc.get('title')} is now the closest earlier version.",
        })
    return out


def fingerprint(entry: dict) -> str:
    """Stable content hash used by the duplicate gate."""
    return hashlib.sha256(text_of(entry).encode("utf-8")).hexdigest()
