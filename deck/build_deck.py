"""Build the Regula pitch deck (9 slides, 16:9, editable)."""
from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deck" / "Regula-Deck.pptx"

NAVY = RGBColor(0x0C, 0x19, 0x29)
NAVY2 = RGBColor(0x10, 0x24, 0x38)
INK = RGBColor(0x0F, 0x1F, 0x2E)
MUTED = RGBColor(0x64, 0x78, 0x8B)
FAINT = RGBColor(0x8F, 0xA0, 0xB1)
LINE = RGBColor(0xE2, 0xE9, 0xF0)
BG = RGBColor(0xF7, 0xF9, 0xFB)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN = RGBColor(0x16, 0x91, 0x5C)
MINT = RGBColor(0x2F, 0xD0, 0x8B)
RED = RGBColor(0xCF, 0x3F, 0x57)
AMBER = RGBColor(0xC9, 0x7A, 0x1C)
VIOLET = RGBColor(0x70, 0x50, 0xD8)
BLUE = RGBColor(0x3B, 0x6F, 0xD4)
PALE = RGBColor(0xB9, 0xCB, 0xD9)
FONT = "Segoe UI"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def rgb(hex_value: str) -> RGBColor:
    h = hex_value.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def strip_style(shp):
    """Remove the theme style so LibreOffice/PowerPoint do not add default shadows."""
    style = shp._element.find(qn("p:style"))
    if style is not None:
        shp._element.remove(style)
    shp.shadow.inherit = False


def rect(slide, x, y, w, h, fill=None, line=None, radius=0.06, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    shp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(0.8)
    strip_style(shp)
    return shp


def text(slide, value, x, y, w, h, size=14, color=INK, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=1.0, italic=False, font=FONT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = str(value).split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = line
        r.font.name = font
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.bold = bold
        r.font.italic = italic
    return box


def line(slide, x1, y1, x2, y2, color=LINE, width=1.0):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(width)
    strip_style(c)
    return c


def bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def notes(slide, value):
    slide.notes_slide.notes_text_frame.text = value


def footer(slide, page, label="Regula · Azentio Build Labs 2026", dark=False):
    c = PALE if dark else FAINT
    text(slide, label, 0.65, 7.08, 8, 0.25, 8, c, False)
    text(slide, f"{page:02d}", 11.9, 7.08, 0.8, 0.25, 8, c, False, PP_ALIGN.RIGHT)


def content_slide(kicker, title, page, subtitle=None):
    s = prs.slides.add_slide(BLANK)
    bg(s, WHITE)
    rect(s, 0, 0, 13.333, 0.055, GREEN, None, 0, MSO_SHAPE.RECTANGLE)
    text(s, kicker.upper(), 0.65, 0.42, 9, 0.28, 9.5, GREEN, True)
    text(s, title, 0.65, 0.78, 12.0, 0.72, 30, INK, True, spacing=0.95)
    if subtitle:
        text(s, subtitle, 0.65, 1.52, 11.4, 0.4, 12.5, MUTED)
    footer(s, page)
    return s


# ---------------------------------------------------------------- 1. title
s = prs.slides.add_slide(BLANK)
bg(s, NAVY)
rect(s, 0, 0, 13.333, 7.5, None, None, 0, MSO_SHAPE.RECTANGLE)

# faint graph motif, right
nodes = [(10.35, 1.25, 0.30, MINT), (11.75, 2.05, 0.22, GREEN), (10.15, 3.05, 0.24, GREEN),
         (11.65, 3.85, 0.28, MINT), (10.55, 4.85, 0.20, GREEN)]
for i in range(len(nodes) - 1):
    line(s, nodes[i][0] + 0.12, nodes[i][1] + 0.12, nodes[i + 1][0] + 0.12, nodes[i + 1][1] + 0.12, rgb("1C4438"), 1.2)
labels = ["clause", "obligation", "policy", "task", "evidence"]
for (x, y, r, col), lab in zip(nodes, labels):
    rect(s, x, y, r, r, col, None, 0.5, MSO_SHAPE.OVAL)
    text(s, lab, x + r + 0.12, y + 0.01, 1.3, 0.2, 7.5, rgb("6E9484"))

# logo
rect(s, 0.85, 0.72, 0.55, 0.55, rgb("132A40"), None, 0.22)
text(s, "R", 0.85, 0.77, 0.55, 0.45, 22, MINT, True, PP_ALIGN.CENTER)
text(s, "regula", 1.52, 0.78, 3, 0.42, 21, WHITE, True)
text(s, "by Azentio Bank", 1.54, 1.12, 3, 0.22, 8.5, rgb("7F98AD"))

text(s, "AZENTIO.AI  BUILD LABS  ·  CHALLENGE 02", 0.85, 2.0, 8, 0.3, 10, MINT, True)
text(s, "Regulatory change,\nresolved.", 0.85, 2.4, 8.3, 1.9, 54, WHITE, True, spacing=0.92)
text(s, "Track the change. Assess policy, process and system impact. Prove it.",
     0.87, 4.55, 7.6, 0.6, 17, rgb("B9CBD9"), False, spacing=1.05)

chips = ["Clause redline", "Impact graph", "Audit chain"]
cx = 0.87
for chip in chips:
    w = 0.22 + len(chip) * 0.085
    rect(s, cx, 5.55, w, 0.38, rgb("122A3E"), rgb("23445A"), 0.5)
    text(s, chip, cx, 5.61, w, 0.26, 9, rgb("CFE6DA"), False, PP_ALIGN.CENTER)
    cx += w + 0.16

line(s, 0.87, 6.55, 7.4, 6.55, rgb("1D3547"), 0.75)
text(s, "31 October 2026", 0.87, 6.68, 3, 0.25, 9, rgb("6E8699"))
text(s, "Three people · six hours · one spine", 4.0, 6.68, 4.5, 0.25, 9, rgb("6E8699"))
footer(s, 1, "Regula · Regulatory Change Impact Agent", True)
notes(s, "Open with the deadline, not the product. A circular landed on Friday. Thirty-one days. "
         "The bank has to find every policy, process and system it touches before the effective date. "
         "Regula does that in one run, and proves every decision afterwards.")

# ---------------------------------------------------------------- 2. problem
s = content_slide("The problem", "A circular is not a to-do list.", 2)
stats = [
    ("47", "pages", "in a typical master-direction amendment"),
    ("31", "days", "from publication to effective date"),
    ("0", "traceable links", "between clause, control and change ticket"),
]
for i, (num, unit, desc) in enumerate(stats):
    x = 0.65 + i * 4.15
    text(s, num, x, 2.0, 2.2, 1.05, 58, GREEN if i < 2 else RED, True, spacing=0.9)
    text(s, unit, x + 1.55, 2.32, 2.2, 0.35, 13, INK, True)
    text(s, desc, x, 3.15, 3.45, 0.8, 11, MUTED, False, spacing=1.15)
    if i < 2:
        line(s, x + 3.85, 2.05, x + 3.85, 3.85, LINE, 0.75)

text(s, "Compliance reads it. Operations interprets it.\nTechnology discovers it late. Audit asks who approved it.",
     0.65, 4.35, 11.8, 0.9, 17, INK, False, spacing=1.2)

# broken chain
boxes = [(0.65, "Clause", RED), (5.05, "Control", AMBER), (9.45, "Change ticket", MUTED)]
for x, label, col in boxes:
    rect(s, x, 5.75, 2.55, 0.85, WHITE, LINE, 0.12)
    rect(s, x, 5.75, 0.07, 0.85, col, None, 0, MSO_SHAPE.RECTANGLE)
    text(s, label, x + 0.2, 5.98, 2.2, 0.3, 13, INK, True)
for x in (3.35, 7.75):
    line(s, x, 6.18, x + 1.55, 6.18, rgb("C9D5E0"), 1.2)
    text(s, "?", x + 0.55, 5.93, 0.4, 0.3, 16, RED, True, PP_ALIGN.CENTER)
text(s, "The link is a person’s memory — until it isn’t.", 0.65, 6.78, 8, 0.25, 9, FAINT, False, True)
text(s, "Illustrative figures, typical master-direction amendment.", 9.0, 6.78, 3.65, 0.25, 8, FAINT, False, PP_ALIGN.RIGHT)
notes(s, "The expensive part is not reading the circular. It is proving what it changed and who owns the change. "
         "Today that link lives in someone's memory or a spreadsheet. When they leave, the evidence leaves too.")

# ---------------------------------------------------------------- 3. insight
s = content_slide("The insight", "Impact is a graph, not a summary.", 3)
nodes = [
    ("CLAUSE", "Section 16", "24 → 12 months", RED),
    ("OBLIGATION", "Annual re-KYC", "quoted + referenced", GREEN),
    ("IMPACT", "3 assets", "CIF · policy · control", BLUE),
    ("TASK", "Vikram Nair", "25 days · due 24 Nov", AMBER),
    ("EVIDENCE", "SHA-256", "hash-chained event", VIOLET),
]
w, gap = 2.12, 0.36
for i, (kind, head, sub, col) in enumerate(nodes):
    x = 0.72 + i * (w + gap)
    rect(s, x, 2.15, w, 2.05, WHITE, LINE, 0.09)
    rect(s, x, 2.15, w, 0.07, col, None, 0, MSO_SHAPE.RECTANGLE)
    text(s, kind, x + 0.18, 2.38, w - 0.3, 0.22, 8.5, col, True)
    text(s, head, x + 0.18, 2.68, w - 0.3, 0.4, 14, INK, True)
    text(s, sub, x + 0.18, 3.13, w - 0.3, 0.6, 9.5, MUTED, False, spacing=1.15)
    if i < len(nodes) - 1:
        ax = x + w + 0.06
        text(s, "→", ax, 2.9, gap - 0.1, 0.35, 17, FAINT, False, PP_ALIGN.CENTER)

text(s, "A summary tells you what the regulator said.\nA graph tells you what must move, who owns it, and why.",
     0.72, 4.85, 11.6, 0.95, 19, INK, False, spacing=1.18)
rect(s, 0.72, 6.12, 11.9, 0.02, LINE, None, 0)
text(s, "Every edge is a piece of evidence: a clause quote, a parameter, an owner, an audit event.",
     0.72, 6.3, 11.6, 0.3, 10.5, MUTED)
notes(s, "This is the core claim. A summariser stops at the first box. The value is in the edges: which obligation, "
         "which asset, which field, which owner, which evidence. That is what makes the output actionable and defensible.")

# ---------------------------------------------------------------- 4. product
s = content_slide("The product", "One run. Five artefacts.", 4)
cards = [
    ("01", "Redline", "What changed, word by word", "amended · added · omitted", RED),
    ("02", "Obligations", "What must be done, with the quote", "21 extracted · 100% evidenced", GREEN),
    ("03", "Impact", "Which asset, what gap, how severe", "101 impacts · 19 critical", BLUE),
    ("04", "Plan", "Who does what, by when, in what order", "25 tasks · 297 effort-days", AMBER),
    ("05", "Evidence", "A hash-chained record of every decision", "SHA-256 · append-only", VIOLET),
]
w, gap = 2.31, 0.24
for i, (num, title, desc, metric, col) in enumerate(cards):
    x = 0.65 + i * (w + gap)
    rect(s, x, 2.05, w, 3.15, WHITE, LINE, 0.08)
    text(s, num, x + 0.2, 2.24, 0.6, 0.3, 10, col, True)
    text(s, title, x + 0.2, 2.58, w - 0.35, 0.4, 15, INK, True)
    text(s, desc, x + 0.2, 3.02, w - 0.35, 0.85, 10, MUTED, False, spacing=1.2)
    line(s, x + 0.2, 4.12, x + w - 0.2, 4.12, LINE, 0.75)
    text(s, metric, x + 0.2, 4.28, w - 0.35, 0.55, 8.8, col, True, spacing=1.15)

rect(s, 0.65, 5.6, 12.0, 0.72, rgb("F0F8F4"), None, 0.1)
text(s, "Deterministic", 0.9, 5.78, 2, 0.3, 11, GREEN, True)
text(s, "·", 2.35, 5.78, 0.2, 0.3, 11, FAINT)
text(s, "sub-30 ms per circular", 2.6, 5.78, 2.6, 0.3, 11, INK)
text(s, "·", 5.05, 5.78, 0.2, 0.3, 11, FAINT)
text(s, "no model call required", 5.3, 5.78, 3.2, 0.3, 11, INK)
text(s, "Optional LLM adapter for extraction — the audit path stays deterministic.", 8.6, 5.77, 3.9, 0.35, 8.5, MUTED, False, PP_ALIGN.RIGHT)
notes(s, "Five artefacts, one run. The important thing is that they are not five separate features: "
         "each one is derived from the one before, and all of them point back to the clause.")

# ---------------------------------------------------------------- 5. demo
s = content_slide("The demo", "From clause to change ticket in three clicks.", 5)
shots = [
    ("misc/shot-source.png", "01", "The redline", "The old 24-month cycle is struck through; 12 months is inserted."),
    ("misc/shot-graph.png", "02", "The impact graph", "Clause → obligation → asset → task. Every edge is evidence."),
    ("misc/shot-plan.png", "03", "The plan", "25 tasks, 297 effort-days, every one owned and dated."),
]
iw = 3.87
for i, (path, num, head, cap) in enumerate(shots):
    x = 0.65 + i * (iw + 0.3)
    pic = s.shapes.add_picture(str(ROOT / path), Inches(x), Inches(1.72), width=Inches(iw))
    pic.line.color.rgb = LINE
    pic.line.width = Pt(0.75)
    text(s, num, x, 4.28, 0.4, 0.25, 9, GREEN, True)
    text(s, head, x + 0.38, 4.26, iw - 0.4, 0.3, 12, INK, True)
    text(s, cap, x, 4.62, iw, 0.62, 9.3, MUTED, False, spacing=1.15)
    if i < 2:
        text(s, "→", x + iw + 0.02, 3.9, 0.28, 0.3, 15, FAINT, False, PP_ALIGN.CENTER)
line(s, 0.65, 5.55, 12.65, 5.55, LINE, 0.75)
text(s, "The judge’s question is not “what does it say?” It is “what do we change, and who owns it?”",
     0.65, 5.72, 11.8, 0.35, 12, INK, False, True)
text(s, "Live run: 21 obligations → 101 impacts → 25 tasks · sub-30 ms", 0.65, 6.2, 8, 0.3, 9.5, GREEN, True)
notes(s, "This is the storyboard for the three-minute demo. Do not walk through every screen. "
         "Show the redline, the numeric gap, and the owned task. Those three clicks carry the whole product.")

# ---------------------------------------------------------------- 6. trust
s = content_slide("Why it’s trustworthy", "The agent proposes. The human approves. The chain proves.", 6)
quads = [
    ("01", "Evidence-linked", "Every obligation carries a verbatim quote and a clause reference. No quote, no impact.", GREEN),
    ("02", "Deterministic", "Same document in, same assessment out. Reproducible on stage and in an audit.", BLUE),
    ("03", "Human-in-the-loop", "Approval is an explicit act. The agent never executes a change on its own.", AMBER),
    ("04", "Tamper-evident", "SHA-256 chain over every extraction, score, approval and status change.", VIOLET),
]
for i, (num, head, body, col) in enumerate(quads):
    x = 0.65 + (i % 2) * 6.2
    y = 2.0 + (i // 2) * 1.95
    rect(s, x, y, 5.9, 1.68, WHITE, LINE, 0.07)
    rect(s, x, y, 0.06, 1.68, col, None, 0, MSO_SHAPE.RECTANGLE)
    text(s, num, x + 0.25, y + 0.18, 0.45, 0.25, 9, col, True)
    text(s, head, x + 0.72, y + 0.16, 4.7, 0.32, 14, INK, True)
    text(s, body, x + 0.72, y + 0.6, 4.85, 0.85, 9.8, MUTED, False, spacing=1.18)

line(s, 0.65, 6.2, 12.65, 6.2, LINE, 0.75)
text(s, "“Banks don’t buy magic. They buy defensibility.”", 0.65, 6.38, 11.8, 0.4, 14, INK, False, True)
notes(s, "Judges will ask whether a bank can trust this. The answer is not 'the model is good'. "
         "It is: every output has evidence, the process is reproducible, a human approves, and the record is tamper-evident.")

# ---------------------------------------------------------------- 7. architecture
s = content_slide("Architecture", "Six extension points. One spine.", 7)
steps = [
    ("INGEST", "PDF / text / API"),
    ("EXTRACT", "rules + optional LLM"),
    ("ASSETS", "41 assets, owners"),
    ("SCORE", "weighted, explained"),
    ("PLAN", "tasks + dependencies"),
    ("AUDIT", "hash chain + export"),
]
for i, (name, sub) in enumerate(steps):
    x = 0.55 + i * 2.08
    shp = s.shapes.add_shape(MSO_SHAPE.CHEVRON, Inches(x), Inches(2.05), Inches(2.02), Inches(0.95))
    shp.fill.solid()
    shp.fill.fore_color.rgb = NAVY if i < 4 else GREEN
    shp.line.fill.background()
    shp.shadow.inherit = False
    tf = shp.text_frame
    tf.margin_left = Inches(0.18)
    tf.margin_right = Inches(0.1)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = name
    r.font.name = FONT
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = WHITE
    text(s, sub, x + 0.15, 3.12, 1.8, 0.3, 8.2, MUTED, False, PP_ALIGN.CENTER)

rect(s, 0.65, 3.85, 12.0, 1.72, BG, None, 0.06)
text(s, "DOMAIN PACK", 0.9, 4.0, 2, 0.25, 8.5, FAINT, True)
domains = [("KYC / AML", GREEN), ("Digital lending", BLUE), ("Cyber resilience", VIOLET)]
for i, (name, col) in enumerate(domains):
    x = 0.9 + i * 2.7
    rect(s, x, 4.32, 2.35, 0.52, WHITE, LINE, 0.4)
    rect(s, x + 0.15, 4.49, 0.14, 0.14, col, None, 0.5, MSO_SHAPE.OVAL)
    text(s, name, x + 0.4, 4.42, 1.85, 0.3, 10, INK, True)
text(s, "Same engine. Swap the regulatory corpus and the asset inventory; keep the evidence chain.",
     0.9, 5.02, 11.4, 0.3, 9.5, MUTED, False)

text(s, "ZERO DEPENDENCIES", 0.65, 5.82, 3, 0.25, 8.5, FAINT, True)
text(s, "Python standard library + native ES modules.", 0.65, 6.1, 6.2, 0.3, 12, INK, True)
text(s, "Runs offline. No npm, no pip, no API key.", 0.65, 6.44, 6.2, 0.3, 10, MUTED)
text(s, "Add a regulator = one text file.\nAdd a control = one JSON object.",
     8.4, 5.98, 4.2, 0.8, 9.5, MUTED, False, spacing=1.2)
notes(s, "This slide is for the technical judge. The point is not that we built a monolith; "
         "it is that every new brief lands on one of six extension points. That is how three people "
         "can absorb a new problem statement in six hours without a rewrite.")

# ---------------------------------------------------------------- 8. impact
s = content_slide("Impact", "What changes on Monday.", 8)
metrics = [
    ("<30 ms", "to assess a circular", "versus 2–3 weeks of manual impact analysis", GREEN),
    ("100%", "of obligations evidence-linked", "every claim anchored to a clause", BLUE),
    ("25", "change tasks surfaced", "297 effort-days on one circular, before the first meeting", AMBER),
    ("0", "untraceable approvals", "every decision hash-chained", VIOLET),
]
for i, (num, head, sub, col) in enumerate(metrics):
    x = 0.65 + (i % 2) * 6.2
    y = 1.95 + (i // 2) * 1.72
    rect(s, x, y, 5.9, 1.5, WHITE, LINE, 0.07)
    text(s, num, x + 0.25, y + 0.2, 2.2, 0.75, 30, col, True, spacing=0.9)
    text(s, head, x + 2.55, y + 0.22, 3.2, 0.55, 12, INK, True, spacing=1.1)
    text(s, sub, x + 2.55, y + 0.82, 3.2, 0.45, 9, MUTED, False, spacing=1.1)

rect(s, 0.65, 5.55, 12.0, 0.85, NAVY, None, 0.08)
text(s, "90-day pilot: one regulator · one business line · one control library.", 0.92, 5.76, 8.6, 0.4, 12, WHITE, True)
text(s, "Success = every obligation owned, every impact approved, every approval evidenced.", 8.9, 5.79, 3.45, 0.4, 8.3, PALE, False, PP_ALIGN.RIGHT)
text(s, "Prototype metrics from the demo corpus; not a production accuracy claim.", 0.65, 6.6, 11, 0.25, 8.5, FAINT, False, True)
notes(s, "Be careful here. These are demo-corpus metrics, not a benchmark. Say that before a judge does. "
         "The credible claim is workflow coverage: every obligation has an owner, every impact has evidence.")

# ---------------------------------------------------------------- 9. team
s = prs.slides.add_slide(BLANK)
bg(s, NAVY)
rect(s, 0, 0, 13.333, 0.06, GREEN, None, 0, MSO_SHAPE.RECTANGLE)
text(s, "THREE PEOPLE. SIX HOURS. ONE SPINE.", 0.85, 1.0, 8, 0.3, 10, MINT, True)
text(s, "Built to survive\nthe next brief.", 0.85, 1.4, 8.2, 1.9, 44, WHITE, True, spacing=0.95)

team = [
    ("[Your name]", "Impact engine · API · integration"),
    ("[Teammate]", "Frontend · product design"),
    ("[Teammate]", "Narrative · data · QA"),
]
for i, (name, role) in enumerate(team):
    y = 3.85 + i * 0.78
    line(s, 0.85, y, 7.4, y, rgb("1E3A4E"), 0.75)
    text(s, name, 0.85, y + 0.14, 3.4, 0.3, 12, WHITE, True)
    text(s, role, 4.1, y + 0.16, 3.3, 0.3, 9.5, PALE, False)

rect(s, 8.6, 3.7, 3.95, 2.15, rgb("102A3D"), rgb("1E4356"), 0.08)
text(s, "THE ASK", 8.85, 3.9, 2, 0.25, 9, MINT, True)
text(s, "A 90-day pilot with one compliance team and one control library.", 8.85, 4.25, 3.45, 1.0, 13, WHITE, True, spacing=1.15)
text(s, "github.com/<org>/regula\n<contact>", 8.85, 5.38, 3.4, 0.4, 8.5, PALE, False, spacing=1.3)

rect(s, 0.85, 6.55, 0.4, 0.4, rgb("132A40"), None, 0.2)
text(s, "R", 0.85, 6.59, 0.4, 0.3, 15, MINT, True, PP_ALIGN.CENTER)
text(s, "regula", 1.35, 6.6, 2, 0.3, 14, WHITE, True)
text(s, "Regulatory change, resolved.", 8.4, 6.66, 4.2, 0.25, 9, PALE, False, PP_ALIGN.RIGHT)
footer(s, 9, "Regula · Azentio Build Labs 2026", True)
notes(s, "Close on the team and the ask, not on a feature list. Three people, six hours, one spine. "
         "The next brief lands on the same spine. The ask is a pilot, not a prize.")

prs.save(OUT)
print(f"saved {OUT} · {len(prs.slides)} slides")
