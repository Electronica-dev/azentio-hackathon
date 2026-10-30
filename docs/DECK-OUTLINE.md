# Deck outline â€” 9 slides

16:9. Azentio palette: navy `#0C1929`, green `#16915C`, mint `#2FD08B`, off-white `#F2F5F8`.
One idea per slide. â‰¤25 words of body text. One screenshot or diagram. Numbers must match the app at 17:30.

---

## 1. Title

**Regula**
*Regulatory change, resolved.*

Track the change. Assess policy, process and system impact. Prove it.

`Azentio.ai Build Labs Â· 31 October 2026 Â· Challenge 02`

---

## 2. The problem

**A circular is not a to-do list.**

Three numbers, big:

- **47** pages in a typical master-direction amendment
- **31** days from publication to effective date
- **0** traceable links between clause, control and change ticket

Body: Compliance reads it. Operations interprets it. Technology discovers it late. Audit asks who approved it.

Speaker note: â€œThe expensive part isnâ€™t reading the circular. Itâ€™s proving what it changed, and who owns the change.â€

---

## 3. The insight

**Impact is a graph, not a summary.**

Diagram: `clause â†’ obligation â†’ policy / process / system / control â†’ task â†’ evidence`

Body: A summary tells you what the regulator said. A graph tells you what must move, who owns it, and why.

Speaker note: â€œEvery chatbot can summarise. Almost none can answer: which system, which field, which owner, which clause?â€

---

## 4. The product

**One run. Five artefacts.**

Five columns with icons:

1. **Redline** â€” what changed, word by word
2. **Obligations** â€” what must be done, with the quote
3. **Impact** â€” which asset, what gap, how severe
4. **Plan** â€” who does what, by when, in what order
5. **Evidence** â€” a hash-chained record

Footer: Deterministic Â· sub-30 ms Â· no model call required

---

## 5. Demo storyboard

Three screenshots, left to right:

1. **Redline** â€” â€œ24 months â†’ 12 monthsâ€
2. **Impact** â€” â€œCIF hard-codes 25% BO; amendment requires 10%â€
3. **Plan** â€” â€œ25 tasks Â· 297 effort-days Â· owner + due dateâ€

Caption: â€œFrom clause to change ticket in three clicks.â€

---

## 6. Why itâ€™s trustworthy

**The agent proposes. The human approves. The chain proves.**

Four quadrants:

- **Evidence-linked** â€” every obligation has a verbatim quote and clause reference
- **Deterministic** â€” same document in, same assessment out; reproducible in the demo
- **Human-in-the-loop** â€” approval is an explicit act, never auto-execution
- **Tamper-evident** â€” SHA-256 chain over every extraction, score and approval

Speaker note: â€œBanks donâ€™t buy magic. They buy defensibility.â€

---

## 7. Architecture

**Six extension points. One spine.**

Diagram:

```
INGEST â†’ EXTRACT â†’ INVENTORY â†’ SCORE â†’ PLAN â†’ AUDIT
   â†‘         â†‘          â†‘          â†‘       â†‘       â†‘
  PDF      rules      assets     weights  owners  export
```

Sidebar: â€œSwappable domain pack: KYC Â· digital lending Â· cyber. Same engine.â€

Speaker note: â€œThis is why we can absorb the next brief without a rewrite.â€

---

## 8. Impact

**What changes on Monday.**

- **sub-30 ms** to assess a circular vs **2â€“3 weeks** of manual impact analysis
- **100%** of obligations evidence-linked in the demo
- **25** change tasks and **297** effort-days surfaced before the first meeting
- **0** untraceable approvals

Footer: Pilot target â€” one regulator, one business line, 90 days.

Speaker note: â€œWeâ€™re not claiming production accuracy. Weâ€™re claiming the workflow is now traceable end to end.â€

---

## 9. Team + ask

**Three people. Six hours. One spine.**

- [Name] â€” backend, impact engine
- [Name] â€” frontend, product design
- [Name] â€” narrative, data, QA

**The ask:** a 90-day pilot with one compliance team and one control library.

Footer: `github.com/<org>/regula` Â· demo video Â· contact

---

## Build notes

- Use the screenshots in `misc/shot-*.png`; regenerate after the final UI freeze.
- Fonts: Segoe UI / system sans. No custom font downloads.
- Charts: no 3D, no gradients on data, no pie charts.
- Export to PDF before submission; embed fonts.
- Rehearse to 4 minutes for the 5-minute slot, leaving 1 minute for the live demo transition.
