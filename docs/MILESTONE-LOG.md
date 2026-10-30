# Milestone log

The event unlocks briefs sequentially: *“The next brief unlocks only after you clear the current one.”*
Every unlock gets 10 minutes of re-scope, not 10 minutes of coding.

## Protocol

1. **Read aloud.** Highlight verbs (what must happen) and nouns (what it applies to).
2. **Map.** Which of the six extension points does it touch? `INGEST / EXTRACT / INVENTORY / SCORE / VIEW / EXPORT`.
3. **Decide.**
   - **Absorb** — ≤30 minutes, demo-visible. Do it now.
   - **Fake** — seed the data, label it as demo data. Acceptable for a prototype.
   - **Defer** — say “next adapter” in Q&A. Do not build.
4. **Log** below. Commit tag `m1`, `m2`, …
5. **Re-run the demo path** after the change. If it breaks, revert.

## Log

### Milestone 1 — time: ____

- Brief (verbatim):
- New requirement:
- Extension point:
- Decision: absorb / fake / defer
- Owner:
- Demo impact:
- Commit:

### Milestone 2 — time: ____

- Brief (verbatim):
- New requirement:
- Extension point:
- Decision: absorb / fake / defer
- Owner:
- Demo impact:
- Commit:

### Milestone 3 — time: ____

- Brief (verbatim):
- New requirement:
- Extension point:
- Decision: absorb / fake / defer
- Owner:
- Demo impact:
- Commit:

## Guardrails

- Never change the `GET /api/state` shape mid-milestone without a version bump.
- Never let a milestone change the demo story after 15:30. Add a slide instead.
- Never refactor the engine to satisfy a milestone. Add a rule or an asset.
- If a milestone contradicts the current demo, the demo wins; mention the milestone in “what’s next”.
