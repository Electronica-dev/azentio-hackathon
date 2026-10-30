"""Extract structured, evidence-backed obligations from amended clauses."""
from __future__ import annotations

import re

from .text import extract_params, sentences, substitution_pair

TAG_PATTERNS: list[tuple[str, str]] = [
    ("kyc", r"know your customer|\bkyc\b"),
    ("aml", r"anti[- ]money|\baml\b|money laundering"),
    ("onboarding", r"onboard|commence.*relationship|open(?:ing)? .{0,12}account"),
    ("periodic updation", r"periodic updation|periodic review|re-kyc|refresh"),
    ("high-risk", r"high[- ]risk"),
    ("beneficial ownership", r"beneficial owner|beneficial ownership"),
    ("threshold", r"per cent|threshold|more than|exceeding"),
    ("pan", r"\bpan\b|permanent account number"),
    ("aadhaar", r"aadhaar"),
    ("ckyc", r"ckyc"),
    ("v-cip", r"video based|v-cip|video"),
    ("liveness", r"liveness"),
    ("crilc", r"crilc|central repository"),
    ("reporting", r"report|filing|submit"),
    ("exceptions", r"exception"),
    ("retention", r"retain|retention|record management|maintain.*records"),
    ("records", r"\brecord"),
    ("retrieval", r"retriev"),
    ("consent", r"consent"),
    ("account aggregator", r"account aggregator"),
    ("data sharing", r"shar(?:e|ing).{0,20}data"),
    ("privacy", r"privacy|data protection"),
    ("board", r"\bboard\b"),
    ("governance", r"governance"),
    ("committee", r"audit committee|committee"),
    ("policy review", r"policy shall be reviewed|reviewed by the board"),
    ("digital lending", r"digital lending"),
    ("default loss guarantee", r"default loss|guarantee"),
    ("cooling off", r"cooling[- ]off"),
    ("kfs", r"key fact statement|\bkfs\b"),
    ("third party", r"third party|lending service provider|service provider"),
    ("outsourcing", r"outsourc"),
    ("vendor", r"vendor"),
    ("cyber", r"cyber"),
    ("soc", r"security operations|\bsoc\b"),
    ("incident reporting", r"incident"),
    ("logs", r"\blogs?\b"),
    ("risk rating", r"risk categor|risk rating"),
    ("screening", r"screen"),
    ("grievance", r"grievance"),
    ("language", r"language"),
]

SKIP = (
    "may be called",
    "shall come into force",
    "in the master direction",
    "in the directions",
    "after section",
    "in section",
    "the following section shall",
    "the following shall be substituted",
    "consequent to the omission",
    "shall be substituted, namely",
    "shall be inserted, namely",
)

DEADLINE_RE = [
    re.compile(r"within\s+([\w\-]+)\s+(?:calendar\s+)?(days?|hours?)", re.I),
    re.compile(r"every\s+([\w\-]+)\s+(months?|years?|days?)", re.I),
    re.compile(r"once\s+every\s+([\w\-]+)\s+(months?|years?)", re.I),
    re.compile(r"at least once every\s+([\w\-]+)\s+(months?|years?)", re.I),
    re.compile(r"\bevery (quarter|month|year)\b", re.I),
]

THRESHOLD_RE = re.compile(
    r"((?:more than|exceeding|at least)\s+[\w\-]+\s+(?:per cent|lakh|crore)|rupees\s+[\w\-]+\s+lakh|"
    r"not exceeding\s+[\w\-]+\s+[\w\-]+)",
    re.I,
)


def tags_for(text: str) -> list[str]:
    low = text.lower()
    return [name for name, pat in TAG_PATTERNS if re.search(pat, low)]


def modality_of(sentence: str) -> str:
    low = sentence.lower()
    if "shall not" in low or "may not" in low:
        return "prohibited"
    if "shall" in low:
        return "mandatory"
    if "must" in low:
        return "mandatory"
    if "should" in low:
        return "recommended"
    if "may" in low:
        return "permitted"
    return "statement"


def kind_of(statement: str, tags: list[str], params: dict | None = None) -> str:
    low = statement.lower()
    params = params or {}
    if "is omitted" in low:
        return "removal"
    if "shall not" in low:
        return "prohibition"
    if "crilc" in tags or re.search(r"\breport", low):
        return "reporting"
    if "liveness_check" in params or "geo_tag" in params:
        return "verification"
    if "bo_threshold_pct" in params or "dlg_cap_pct" in params:
        return "threshold"
    if "review_cycle_months" in params or "risk_review_months" in params:
        return "periodic"
    if "pan" in tags or "aadhaar" in tags or "verification" in low or "verify" in low:
        return "verification"
    if "retention" in tags or "records" in tags:
        return "recordkeeping"
    if "consent" in tags:
        return "consent"
    if "board" in tags or "committee" in tags:
        return "governance"
    if "periodic updation" in tags:
        return "periodic"
    if "threshold" in tags and re.search(r"\d|per cent", low):
        return "threshold"
    return "requirement"


def deadline_of(text: str) -> str:
    for pat in DEADLINE_RE:
        m = pat.search(text)
        if m:
            if len(m.groups()) == 2:
                return f"{m.group(1)} {m.group(2)}"
            return m.group(1)
    return ""


def _clean(sentence: str) -> str:
    s = re.sub(r"^(?:\((?:\d+|[a-z])\)|\d+\([0-9A-Za-z]+\))\s*", "", sentence).strip()
    return re.sub(r"\s+", " ", s)


SUBITEM = re.compile(r"^\((?:[a-z]|[ivx]+)\)")


def units_for(body: str) -> list[str]:
    """Keep (a)/(b)/(c) sub-clauses attached to the sentence that introduces them."""
    units: list[str] = []
    for sent in sentences(body):
        if units and SUBITEM.match(sent) and (units[-1].rstrip().endswith(":") or re.search(r"\((?:a|i|1)\)", units[-1])):
            units[-1] = units[-1].rstrip() + " " + sent
        else:
            units.append(sent)
    return units


def extract_obligations(source: dict, clauses: list[dict]) -> list[dict]:
    short = source["id"].replace("src-", "").replace("-2026", "")
    out: list[dict] = []
    seen: set[str] = set()

    def add(clause: dict, statement: str, quote: str, context: str) -> None:
        statement = _clean(statement)
        if len(statement) < 30:
            return
        key = re.sub(r"[^a-z0-9]", "", statement.lower())[:70]
        if key in seen:
            return
        seen.add(key)
        tags = tags_for(context)
        pair = substitution_pair(clause["text"])
        param_text = context if pair else statement
        params = extract_params(param_text, set(tags), pair if clause["substitution"] else None)
        kind = kind_of(statement, tags, params)
        nth = sum(1 for o in out if o["clause_num"] == clause["num"]) + 1
        conf = 0.74
        conf += 0.06 if params else 0.0
        conf += 0.05 if len(quote) < 220 else 0.0
        conf += 0.04 if len(tags) >= 3 else 0.0
        conf += 0.03 if clause["change_type"] in ("modified", "removed") else 0.0
        out.append({
            "id": f"obl-{short}-{clause['num']}-{nth}",
            "source_id": source["id"],
            "clause_id": clause["id"],
            "clause_num": clause["num"],
            "clause_heading": clause["heading"],
            "subject": clause["subject"],
            "section_ref": clause["section_ref"],
            "statement": statement[:320],
            "quote": quote[:600],
            "change_type": clause["change_type"],
            "kind": kind,
            "modality": modality_of(statement),
            "deadline": deadline_of(param_text),
            "threshold": (THRESHOLD_RE.search(param_text).group(1) if THRESHOLD_RE.search(param_text) else ""),
            "params": params,
            "tags": tags,
            "confidence": round(min(conf, 0.97), 2),
            "status": "extracted",
        })

    for clause in clauses:
        if clause["num"] == "1":
            continue
        start = len(out)
        context = f"{clause['heading']} {clause['subject']} {clause['body']}"
        clause_tags = tags_for(context)
        pair = clause["substitution"]
        if pair:
            subject = clause["subject"]
            statement = f"{subject[:1].upper() + subject[1:]}: “{pair[0]}” is replaced by “{pair[1]}”."
            add(clause, statement, f'For the words "{pair[0]}", the words "{pair[1]}" shall be substituted.', context)

        for sent in units_for(clause["body"]):
            low = sent.lower()
            if any(low.startswith(p) or p in low for p in SKIP):
                continue
            if re.match(r"^\d+[A-Z]?\.\s", sent):
                continue
            if "shall" not in low and "must" not in low and "is omitted" not in low:
                continue
            add(clause, sent, sent, context)

        # Clause-level numbers (headers/definitions) still bind every obligation.
        clause_params = extract_params(context, set(clause_tags), pair if pair else None)
        if clause_params:
            for obl in out[start:]:
                for key, value in clause_params.items():
                    obl["params"].setdefault(key, value)
                obl["kind"] = kind_of(obl["statement"], obl["tags"], obl["params"])

    return out
