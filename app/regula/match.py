"""Map obligations to the bank's policy, process, system and control inventory."""
from __future__ import annotations

import math
import re
from collections import Counter

STOP = set("""a an the and or of to in for on by with from is are was were be been being shall must
may should such any every all any where which who whom whose this that these those it its as at
not no than then there their they them we our you your more most other into within without
period direction directions section clause sub regulation entity entities regulated customer customers
provided however namely case persons person""".split())

TOKEN_RE = re.compile(r"[a-z][a-z0-9\-]+")

TAG_BOOST: dict[str, list[str]] = {
    "kyc": ["pol-kyc", "sys-cif", "prc-onboarding", "ctl-cdd", "sys-onboarding"],
    "beneficial ownership": ["pol-kyc", "prc-bo", "ctl-bo", "sys-cif", "sys-onboarding"],
    "periodic updation": ["prc-periodic", "prc-highrisk", "ctl-review", "sys-cif", "pol-kyc"],
    "high-risk": ["prc-highrisk", "ctl-cdd", "sys-aml", "pol-kyc"],
    "pan": ["sys-onboarding", "prc-onboarding"],
    "aadhaar": ["sys-onboarding", "prc-onboarding"],
    "ckyc": ["sys-ckyc", "prc-onboarding"],
    "crilc": ["sys-crilc", "prc-crilc", "ctl-recon", "pol-aml"],
    "reporting": ["sys-crilc", "prc-crilc", "pol-aml"],
    "exceptions": ["prc-crilc", "sys-crilc", "pol-aml", "ctl-recon"],
    "retention": ["sys-dms", "prc-records", "pol-privacy", "ctl-retention"],
    "records": ["sys-dms", "prc-records", "ctl-retention"],
    "retrieval": ["sys-dms", "prc-records"],
    "consent": ["sys-consent", "prc-consent", "pol-privacy", "ctl-consent"],
    "account aggregator": ["prc-consent", "sys-consent"],
    "data sharing": ["prc-consent", "sys-consent", "pol-privacy"],
    "v-cip": ["sys-vcip", "prc-vcip"],
    "liveness": ["sys-vcip", "prc-vcip"],
    "board": ["pol-governance"],
    "governance": ["pol-governance", "pol-kyc"],
    "committee": ["pol-governance"],
    "policy review": ["pol-governance", "pol-kyc"],
    "digital lending": ["pol-dl", "sys-lms", "prc-kfs", "sys-kfs"],
    "default loss guarantee": ["pol-dl", "sys-lms"],
    "cooling off": ["prc-cooling", "sys-lms", "pol-dl"],
    "kfs": ["sys-kfs", "prc-kfs", "ctl-kfs", "pol-dl"],
    "language": ["sys-kfs", "prc-kfs"],
    "third party": ["pol-outsourcing", "prc-vendor", "sys-vendor"],
    "vendor": ["prc-vendor", "sys-vendor", "pol-outsourcing"],
    "cyber": ["pol-cyber", "sys-soc", "prc-vendor", "sys-vendor"],
    "soc": ["sys-soc", "pol-cyber"],
    "incident reporting": ["prc-incident", "sys-soc", "pol-cyber"],
    "logs": ["sys-soc", "pol-cyber"],
    "risk rating": ["ctl-cdd", "sys-aml", "prc-highrisk"],
    "screening": ["sys-aml"],
}

LIMITS = {"policy": 2, "process": 1, "system": 2, "control": 1}
MIN_SCORE = {"policy": 0.30, "process": 0.30, "system": 0.30, "control": 0.34}


def tokens(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall(text.lower()) if t not in STOP and len(t) > 2]


def asset_text(asset: dict) -> str:
    return " ".join([asset["name"], asset.get("state", ""), asset.get("gap", ""), " ".join(asset.get("tags", []))])


class Matcher:
    def __init__(self, assets: list[dict]):
        self.assets = assets
        self.docs = {a["id"]: Counter(tokens(asset_text(a))) for a in assets}
        n = len(assets)
        df: Counter = Counter()
        for counter in self.docs.values():
            df.update(set(counter))
        self.idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}

    def _vec(self, counter: Counter) -> dict[str, float]:
        vec = {t: (1 + math.log(c)) * self.idf.get(t, 1.0) for t, c in counter.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    def _cosine(self, a: Counter, b: Counter) -> float:
        va, vb = self._vec(a), self._vec(b)
        if len(va) > len(vb):
            va, vb = vb, va
        return sum(v * vb.get(t, 0.0) for t, v in va.items())

    def score(self, obligation: dict, asset: dict) -> tuple[float, dict]:
        ot = set(obligation.get("tags", []))
        at = set(asset.get("tags", []))
        overlap = ot & at
        tag = len(overlap) / max(1, min(len(ot), 4))
        cos = self._cosine(Counter(tokens(obligation["statement"] + " " + " ".join(ot))), self.docs[asset["id"]])
        boost = 0.0
        for t in ot:
            if asset["id"] in TAG_BOOST.get(t, []):
                boost += 0.10
        boost = min(boost, 0.26)
        total = 0.52 * tag + 0.34 * cos + boost
        if not overlap:
            total *= 0.82
        return total, {"tag": round(tag, 2), "semantic": round(cos, 2), "prior": round(boost, 2)}

    def match(self, obligation: dict) -> list[dict]:
        scored = []
        for asset in self.assets:
            total, parts = self.score(obligation, asset)
            scored.append((total, asset, parts))
        picked: list[dict] = []
        for atype, limit in LIMITS.items():
            pool = sorted([s for s in scored if s[1]["type"] == atype], key=lambda x: -x[0])
            above = [s for s in pool if s[0] >= MIN_SCORE[atype]]
            if not above and atype == "policy" and pool and pool[0][0] >= 0.18:
                above = pool[:1]
            for total, asset, parts in above[:limit]:
                picked.append({
                    "asset_id": asset["id"],
                    "asset_type": atype,
                    "match_score": round(total, 3),
                    "match_parts": parts,
                    "shared_tags": sorted(set(obligation.get("tags", [])) & set(asset.get("tags", []))),
                })
        picked.sort(key=lambda p: -p["match_score"])
        return picked
