"""Text utilities: sentence splitting, numeric words, redlines, parameter extraction."""
from __future__ import annotations

import re
import difflib

SENT_RE = re.compile(r"(?<=[.;:])\s+(?=[A-Z0-9(])")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]+")

_UNITS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}


def words_to_int(value: str) -> int | None:
    """Convert 'twenty-four', 'one hundred and eighty', '10' to an int."""
    value = value.strip().lower().replace(",", "")
    if value.isdigit():
        return int(value)
    total, current = 0, 0
    for part in re.split(r"[\s\-]+", value):
        if part in ("and", ""):
            continue
        if part in _UNITS:
            current += _UNITS[part]
        elif part == "hundred":
            current = max(1, current) * 100
        elif part == "thousand":
            total += max(1, current) * 1000
            current = 0
        else:
            return None
    return total + current if (total or current) else None


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for para in text.splitlines():
        para = para.strip()
        if not para:
            continue
        for sent in SENT_RE.split(para):
            sent = re.sub(r"\s+", " ", sent).strip()
            if len(sent) > 20:
                out.append(sent)
    return out


def word_tokens(text: str) -> list[str]:
    return re.findall(r"\S+\s*", text)


def redline(before: str, after: str) -> list[dict]:
    """Word-level diff as display segments. Capped for payload size."""
    if not before:
        return [{"t": "add", "v": after}]
    a, b = word_tokens(before), word_tokens(after)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    segs: list[dict] = []

    def push(t: str, v: str) -> None:
        if not v:
            return
        if segs and segs[-1]["t"] == t:
            segs[-1]["v"] += v
        else:
            segs.append({"t": t, "v": v})

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            push("same", "".join(b[j1:j2]))
        elif tag == "replace":
            push("del", "".join(a[i1:i2]))
            push("add", "".join(b[j1:j2]))
        elif tag == "delete":
            push("del", "".join(a[i1:i2]))
        elif tag == "insert":
            push("add", "".join(b[j1:j2]))
    return segs[:220]


def similarity(before: str, after: str) -> float:
    return difflib.SequenceMatcher(None, before.split(), after.split(), autojunk=False).ratio()


SUB_RE = re.compile(r'for the words\s+"([^"]+)"\s*,?\s*the words\s+"([^"]+)"\s*shall be substituted', re.I)


def substitution_pair(text: str) -> tuple[str, str] | None:
    m = SUB_RE.search(text)
    return (m.group(1), m.group(2)) if m else None


PARAM_LABELS = {
    "review_cycle_months": "re-KYC cycle (months)",
    "risk_review_months": "risk re-rating cycle (months)",
    "bo_threshold_pct": "beneficial ownership threshold (%)",
    "bo_refresh_months": "beneficial ownership refresh (months)",
    "retention_years": "record retention (years)",
    "vcip_retention_years": "V-CIP recording retention (years)",
    "crilc_reporting_days": "CRILC exception reporting (days)",
    "high_value_txn_limit": "high-value transaction limit (INR)",
    "board_review_months": "board policy review (months)",
    "committee_review_months": "committee review (months)",
    "liveness_check": "liveness detection",
    "geo_tag": "geo-tagging",
    "consent_revocable": "revocable consent",
    "consent_purpose_bound": "purpose-bound consent",
    "dlg_cap_pct": "default loss guarantee cap (%)",
    "cooling_off_days": "cooling-off period (days)",
    "kfs_languages": "KFS languages",
    "kfs_ack": "explicit KFS acknowledgement",
    "soc_hours": "SOC monitoring coverage (hours/day)",
    "log_retention_days": "log retention (days)",
    "incident_report_hours": "incident reporting SLA (hours)",
    "cyber_assessment": "pre-onboarding cyber assessment",
    "retrieval_hours": "record retrieval SLA (hours)",
}


def _num(pattern: str, text: str) -> int | None:
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    return words_to_int(m.group(1))


def extract_params(text: str, tags: set[str], pair: tuple[str, str] | None = None) -> dict:
    """Map regulatory prose to machine-comparable parameters.

    Substitution pairs win, because they express the new value unambiguously.
    """
    params: dict[str, int] = {}
    low = text.lower()
    after = pair[1] if pair else ""

    if pair:
        if re.search(r"per cent|%", after):
            if "default loss" in low or "dlg" in tags:
                params["dlg_cap_pct"] = _num(r"([\w\-]+)\s+per cent", after)
            elif "shares" in low or "capital" in low or "beneficial" in tags:
                params["bo_threshold_pct"] = _num(r"([\w\-]+)\s+per cent", after)
        if "cooling" in low:
            params["cooling_off_days"] = _num(r"([\w\-]+)\s+days", after)
        if "record" in low or "retention" in tags:
            params["retention_years"] = _num(r"([\w\-]+)\s+years", after)

    if "beneficial owner" in low or "beneficial ownership" in tags:
        v = _num(r"(?:more than|exceeding|at least)\s+([\w\-]+)\s+per cent", text)
        if v:
            params.setdefault("bo_threshold_pct", v)
        v = _num(r"(?:refresh|review).*?every\s+([\w\-]+)\s+months", text)
        if v:
            params.setdefault("bo_refresh_months", v)

    if "high-risk" in low or "high risk" in low:
        v = _num(r"every\s+([\w\-]+)\s+months", text)
        if v:
            params.setdefault("review_cycle_months", v)
    if "risk categor" in low:
        v = _num(r"once\s+every\s+([\w\-]+)\s+months", text)
        if v:
            params.setdefault("risk_review_months", v)

    if "video" in low or "v-cip" in tags:
        if "retain" in low or "retention" in low:
            v = _num(r"(?:for a period of|for)\s+([\w\-]+)\s+years", text)
            if v:
                params.setdefault("vcip_retention_years", v)
        if "liveness" in low:
            params["liveness_check"] = 1
        if "geo-tag" in low or "geotag" in low:
            params["geo_tag"] = 1

    if "crilc" in low:
        v = _num(r"within\s+([\w\-]+)\s+(?:calendar\s+)?days", text)
        if v:
            params["crilc_reporting_days"] = v

    if "high-value transaction" in low:
        v = _num(r"rupees\s+([\w\-]+)\s+lakh", text)
        if v:
            params["high_value_txn_limit"] = v * 100000

    if "board" in low and "review" in low:
        v = _num(r"every\s+([\w\-]+)\s+months", text)
        if v:
            params.setdefault("board_review_months", v)
    if "audit committee" in low:
        if "quarter" in low:
            params["committee_review_months"] = 3

    if "consent" in low:
        if "revocable" in low or "revocation" in low:
            params["consent_revocable"] = 1
        if "purpose-bound" in low or "purpose bound" in low:
            params["consent_purpose_bound"] = 1

    if "key fact statement" in low or "kfs" in tags:
        if "language" in low:
            v = _num(r"([\w\-]+)\s+language", text)
            params.setdefault("kfs_languages", v or 2)
        if "acknowledg" in low:
            params["kfs_ack"] = 1

    if "cooling" in low:
        v = _num(r"([\w\-]+)[\s\-]+days", text)
        if v:
            params.setdefault("cooling_off_days", v)

    if "security operations" in low or "soc" in tags:
        if "twenty-four by seven" in low or "24x7" in low or "24 by 7" in low:
            params["soc_hours"] = 24
    if "log" in low and ("retain" in low or "retention" in low):
        v = _num(r"(?:period of|for)\s+([\w\-]+)\s+days", text)
        if v:
            params.setdefault("log_retention_days", v)

    if "incident" in low and "report" in low:
        v = _num(r"within\s+([\w\-]+)\s+hours", text)
        if v:
            params["incident_report_hours"] = v

    if "third party service provider" in low or ("vendor" in low and "cyber" in low):
        params["cyber_assessment"] = 1

    if "retriev" in low:
        v = _num(r"within\s+([\w\-]+)[\s\-]+hours", text)
        if v:
            params["retrieval_hours"] = v

    if "record" in low and "retention" not in params:
        v = _num(r"(?:period of|for)\s+([\w\-]+)\s+years", text)
        if v:
            params.setdefault("retention_years", v)

    return {k: v for k, v in params.items() if v is not None}


BOOL_KEYS = {
    "liveness_check", "geo_tag", "consent_revocable", "consent_purpose_bound",
    "kfs_ack", "cyber_assessment", "pan_aadhaar_check",
}


def fmt_param(key: str, value) -> str:
    if key == "high_value_txn_limit" and isinstance(value, int):
        return f"INR {value / 100000:.0f} lakh"
    if key in BOOL_KEYS:
        return "yes" if value else "no"
    if value == 0:
        return "not defined"
    return str(value)
