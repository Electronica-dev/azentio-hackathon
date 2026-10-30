# Deck outline — 9 slides

16:9. Azentio palette: navy `#0C1929`, green `#16915C`, mint `#2FD08B`, off-white `#F2F5F8`.
One idea per slide. ≤25 words of body text. One screenshot or diagram. Numbers must match the app at 17:30.

---

## 1. Title

**Regula**
*Regulatory change, resolved.*

Track the change. Assess policy, process and system impact. Prove it.

`Azentio.ai Build Labs · 31 October 2026 · Challenge 02`

---

## 2. The problem

**A circular is not a to-do list.**

Three numbers, big:

- **47** pages in a typical master-direction amendment
- **31** days from publication to effective date
- **0** traceable links between clause, control and change ticket

Body: Compliance reads it. Operations interprets it. Technology discovers it late. Audit asks who approved it.

Speaker note: “The expensive part isn’t reading the circular. It’s proving what it changed, and who owns the change.”

---

## 3. The insight

**Impact is a graph, not a summary.**

Diagram: `clause → obligation → policy / process / system / control → task → evidence`

Body: A summary tells you what the regulator said. A graph tells you what must move, who owns it, and why.

Speaker note: “Every chatbot can summarise. Almost none can answer: which system, which field, which owner, which clause?”

---

## 4. The product

**One run. Five artefacts.**

Five columns with icons:

1. **Redline** — what changed, word by word
2. **Obligations** — what must be done, with the quote
3. **Impact** — which asset, what gap, how severe
4. **Plan** — who does what, by when, in what order
5. **Evidence** — a hash-chained record

Footer: Deterministic · sub-30 ms · no model call required

---

## 5. Demo storyboard

Three screenshots, left to right:

1. **Redline** — “24 months → 12 months”
2. **Impact** — “CIF hard-codes 25% BO; amendment requires 10%”
3. **Plan** — “25 tasks · 297 effort-days · owner + due date”

Caption: “From clause to change ticket in three clicks.”

---

## 6. Why it’s trustworthy

**The agent proposes. The human approves. The chain proves.**

Four quadrants:

- **Evidence-linked** — every obligation has a verbatim quote and clause reference
- **Deterministic** — same document in, same assessment out; reproducible in the demo
- **Human-in-the-loop** — approval is an explicit act, never auto-execution
- **Tamper-evident** — SHA-256 chain over every extraction, score and approval

Speaker note: “Banks don’t buy magic. They buy defensibility.”

---

## 7. Architecture

**Six extension points. One spine.**

Diagram:

```
INGEST → EXTRACT → INVENTORY → SCORE → PLAN → AUDIT
   ↑         ↑          ↑          ↑       ↑       ↑
  PDF      rules      assets     weights  owners  export
```

Sidebar: “Swappable domain pack: KYC · digital lending · cyber. Same engine.”

Speaker note: “This is why we can absorb the next brief without a rewrite.”

---

## 8. Impact

**What changes on Monday.**

- **sub-30 ms** to assess a circular vs **2–3 weeks** of manual impact analysis
- **100%** of obligations evidence-linked in the demo
- **25** change tasks and **297** effort-days surfaced before the first meeting
- **0** untraceable approvals

Footer: Pilot target — one regulator, one business line, 90 days.

Speaker note: “We’re not claiming production accuracy. We’re claiming the workflow is now traceable end to end.”

---

## 9. Team + ask

**Three people. Six hours. One spine.**

- [Name] — backend, impact engine
- [Name] — frontend, product design
- [Name] — narrative, data, QA

**The ask:** a 90-day pilot with one compliance team and one control library.

Footer: `github.com/<org>/regula` · demo video · contact

---

## Build notes

- Use the screenshots in `misc/shot-*.png`; regenerate after the final UI freeze.
- Fonts: Segoe UI / system sans. No custom font downloads.
- Charts: no 3D, no gradients on data, no pie charts.
- Export to PDF before submission; embed fonts.
- Rehearse to 4 minutes for the 5-minute slot, leaving 1 minute for the live demo transition.
