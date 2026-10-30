import { store, refresh } from "../state.js";
import { api, isMock } from "../api.js";
import {
  icon, esc, fmtDate, dayLabel, sevLabel, typeChip, avatar, confBar, paramLabel, toast, short,
} from "../ui.js";

const CHANGE = { added: ["New", "added"], modified: ["Amended", "modified"], removed: ["Omitted", "removed"], unchanged: ["Restated", "unchanged"] };

function context(params) {
  const d = store.data;
  const src = d.sources.find((s) => s.id === params.id) || d.sources[0];
  if (!src) return null;
  if (store.sel.sourceId !== src.id) {
    store.sel = { sourceId: src.id, clauseId: null, obligationId: null, filter: "all" };
  }
  if (!store.sel.filter) store.sel.filter = "all";

  const clauses = d.clauses.filter((c) => c.source_id === src.id);
  const obls = d.obligations.filter((o) => o.source_id === src.id);
  const impacts = d.impacts.filter((i) => i.source_id === src.id);
  const tasks = d.tasks.filter((t) => t.source_id === src.id);

  const scoreOf = (o) => Math.max(0, ...impacts.filter((i) => i.obligation_id === o.id).map((i) => i.score));
  if (!store.sel.obligationId && !store.sel.clauseId && obls.length) {
    const top = [...impacts].sort((a, b) => b.score - a.score)[0];
    store.sel.obligationId = top ? top.obligation_id : [...obls].sort((a, b) => scoreOf(b) - scoreOf(a))[0].id;
  }
  const selObl = obls.find((o) => o.id === store.sel.obligationId) || null;
  const activeClauseId = selObl ? selObl.clause_id : store.sel.clauseId;
  return { src, clauses, obls, impacts, tasks, selObl, activeClauseId, scoreOf };
}

function clauseHtml(c, ctx) {
  const [label, cls] = CHANGE[c.change_type] || CHANGE.unchanged;
  const sel = c.id === ctx.activeClauseId;
  const related = ctx.obls.filter((o) => o.clause_id === c.id).length;
  const body = c.body.replace(/\n+/g, "\n");
  const showRedline = sel && c.redline && c.redline.length && c.change_type !== "added";
  const redline = showRedline
    ? `<div class="redline">${c.redline.map((s) => s.t === "add" ? `<ins>${esc(s.v)}</ins>` : s.t === "del" ? `<del>${esc(s.v)}</del>` : esc(s.v)).join("")}</div>`
    : "";
  return `<article class="clause ${sel ? "sel" : ""} ${sel ? "open" : ""}" data-clause="${esc(c.id)}">
    <div class="c-top">
      <span class="c-num">${esc(c.section_ref)}</span>
      <span class="c-head">${esc(c.subject)}</span>
      <span class="change ${cls}">${label}</span>
    </div>
    ${showRedline ? "" : `<div class="c-body ${sel ? "" : "short"}">${esc(body)}</div>`}
    ${redline}
    ${sel && related ? `<div style="margin-top:6px;font-size:9px;color:var(--faint)">${related} obligation${related > 1 ? "s" : ""} extracted</div>` : ""}
  </article>`;
}

function obligationHtml(o, ctx) {
  const imps = ctx.impacts.filter((i) => i.obligation_id === o.id);
  const score = ctx.scoreOf(o);
  const approved = imps.length && imps.every((i) => i.status === "approved");
  const sel = o.id === store.sel.obligationId;
  const params = Object.entries(o.params || {}).slice(0, 2).map(([k, v]) =>
    `<span class="param">${esc(paramLabel(k))} ${esc(String(v))}</span>`).join("");
  return `<article class="obl ${sel ? "sel" : ""} ${approved ? "approved" : ""}" data-obl="${esc(o.id)}">
    <div class="o-top">
      <span class="o-ref">${esc(o.section_ref)}</span>
      <span class="chip slate">${esc(o.kind)}</span>
      <span class="chip ${o.change_type === "added" ? "green" : o.change_type === "removed" ? "red" : "amber"}">${(CHANGE[o.change_type] || CHANGE.unchanged)[0]}</span>
      <span class="o-state">${approved ? "approved" : o.modality}</span>
    </div>
    <p>${esc(short(o.statement, 186))}</p>
    <div class="o-foot">
      ${params}
      <span class="conf">${Math.round(o.confidence * 100)}% ${confBar(o.confidence)}</span>
    </div>
  </article>`;
}

function impactHtml(i, ctx) {
  const deltas = (i.deltas || []).slice(0, 1).map((d) => `
    <div class="i-delta"><span>${esc(d.label)}</span><b>${esc(d.current_text)}</b><span>→</span><b class="ok">${esc(d.required_text)}</b></div>`).join("");
  const approved = i.status === "approved";
  const actions = approved
    ? `<span class="approved-tag">${icon("check")} approved · ${esc(i.reviewed_by || "")}</span>`
    : `<div class="i-actions">
        <button class="icon-btn ok" title="Approve impact" data-approve="${esc(i.id)}">${icon("check")}</button>
        <button class="icon-btn" title="Reject impact" data-reject="${esc(i.id)}">${icon("x")}</button>
      </div>`;
  return `<article class="imp ${i.severity} ${approved ? "approved" : ""}">
    <div class="i-top">
      ${sevLabel(i.severity)}
      ${typeChip(i.asset_type)}
      <span class="i-score">${i.score}</span>
    </div>
    <div class="i-asset">${esc(i.asset_name)}</div>
    <div class="i-why">${esc(i.rationale)}</div>
    ${deltas}
    <div class="i-foot">
      <span class="i-owner">${avatar(i.owner)}${esc(i.owner)}</span>
      <span style="font-size:8.6px;color:#a4b4c2">${i.effort_days}d effort</span>
      ${actions}
    </div>
  </article>`;
}

function docPane(ctx) {
  if (!ctx.clauses.length) return `<div class="empty">${icon("doc")}<div>No clauses parsed yet.</div></div>`;
  return ctx.clauses.map((c) => clauseHtml(c, ctx)).join("");
}

function oblPane(ctx) {
  if (!ctx.obls.length) {
    return `<div class="empty">${icon("bolt")}<div><b>Not analysed yet.</b><br/>Run the agent to extract obligations and map impact.</div><br/><button class="btn btn-primary btn-sm" data-run="${esc(ctx.src.id)}">${icon("play")} Run agent</button></div>`;
  }
  let list = [...ctx.obls].sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a));
  if (store.sel.filter === "critical") {
    list = list.filter((o) => ctx.impacts.some((i) => i.obligation_id === o.id && i.severity === "critical"));
  } else if (store.sel.filter === "low") {
    list = list.filter((o) => o.confidence < 0.82);
  }
  if (!list.length) return `<div class="empty">${icon("check")}<div>No obligations in this filter.</div></div>`;
  return list.map((o) => obligationHtml(o, ctx)).join("");
}

function impPane(ctx) {
  let list = ctx.selObl
    ? ctx.impacts.filter((i) => i.obligation_id === ctx.selObl.id)
    : [...ctx.impacts];
  list = list.sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.severity] - { critical: 0, high: 1, medium: 2, low: 3 }[b.severity]) || b.score - a.score);
  if (!list.length) return `<div class="empty">${icon("graph")}<div>Select an obligation to see its impact.</div></div>`;
  return list.map((i) => impactHtml(i, ctx)).join("");
}

function statStrip(ctx) {
  const assets = new Set(ctx.impacts.map((i) => i.asset_id)).size;
  const critical = ctx.impacts.filter((i) => i.severity === "critical").length;
  const effort = ctx.tasks.reduce((n, t) => n + t.effort_days, 0);
  return `<div class="stat-strip">
    <div class="strip-item"><b>${ctx.obls.length}</b><span>obligations</span></div>
    <div class="strip-item"><b>${assets}</b><span>assets impacted</span></div>
    <div class="strip-item"><b class="t-critical">${critical}</b><span>critical</span></div>
    <div class="strip-item"><b>${ctx.tasks.length}</b><span>change tasks</span></div>
    <div class="strip-item"><b>${effort}</b><span>effort-days</span></div>
    <div class="strip-item grow" style="gap:8px">
      <span class="chip ${ctx.src.regulator.toLowerCase()}">${esc(ctx.src.regulator)}</span>
      <span class="chip ${ctx.src.status === "new" ? "green" : "blue"}">${ctx.src.status === "new" ? "needs analysis" : "in review"}</span>
    </div>
  </div>`;
}

export function render(params) {
  const ctx = context(params);
  if (!ctx) return `<div class="empty">Source not found.</div>`;
  const { src } = ctx;
  const selLabel = ctx.selObl ? `${ctx.selObl.section_ref} · ${ctx.selObl.kind}` : "Top impacts";

  return `<div class="source-head">
    <a class="back" href="#/inbox" title="Back to inbox">${icon("back")}</a>
    <div class="sh-main">
      <div class="sh-top"><span class="chip ${src.regulator.toLowerCase()}">${esc(src.regulator)}</span><span class="mono" style="font-size:9.5px;color:#8fa0b1">${esc(src.ref)}</span></div>
      <h1>${esc(src.title)}</h1>
      <div class="sh-meta">
        <span>Published <b>${fmtDate(src.published)}</b></span>
        <span>Effective <b>${fmtDate(src.effective)}</b></span>
        <span><b class="${src.days_left < 45 ? "t-critical" : ""}">${dayLabel(src.days_left)}</b> to comply</span>
        <span>Owner <b>${esc(src.owner)}</b></span>
      </div>
    </div>
    <div class="sh-actions">
      ${isMock() ? "" : `<a class="btn" href="${api.exportUrl(src.id)}" download>${icon("download")} Export</a>`}
      <a class="btn" href="#/graph/${esc(src.id)}">${icon("graph")} Impact graph</a>
      <button class="btn btn-primary" data-run="${esc(src.id)}">${icon("refresh")} ${ctx.obls.length ? "Re-run" : "Run agent"}</button>
    </div>
  </div>
  ${statStrip(ctx)}
  <div class="workbench">
    <section class="pane">
      <div class="pane-head"><h3>Circular text</h3><span class="count">${ctx.clauses.length}</span>
        <div class="right"><span class="chip outline" style="font-size:8px">${esc(src.regulator)} source</span></div>
      </div>
      <div class="pane-body tight" id="doc-body">${docPane(ctx)}</div>
      <div class="pane-foot">${icon("doc")} Clause-level redline · click a clause to trace</div>
    </section>

    <section class="pane">
      <div class="pane-head"><h3>Obligations</h3><span class="count">${ctx.obls.length}</span>
        <div class="right">
          <button class="chip ${store.sel.filter === "all" ? "green" : "outline"}" data-filter="all" style="font-size:8px">All</button>
          <button class="chip ${store.sel.filter === "critical" ? "red" : "outline"}" data-filter="critical" style="font-size:8px">Critical</button>
          <button class="chip ${store.sel.filter === "low" ? "amber" : "outline"}" data-filter="low" style="font-size:8px">Low conf.</button>
        </div>
      </div>
      <div class="pane-body" id="obl-body">${oblPane(ctx)}</div>
      <div class="pane-foot">${icon("link")} ${ctx.obls.length} extracted · click to isolate impact</div>
    </section>

    <section class="pane">
      <div class="pane-head"><h3>Impact</h3><span class="count" id="imp-count">${ctx.selObl ? ctx.impacts.filter((i) => i.obligation_id === ctx.selObl.id).length : ctx.impacts.length}</span>
        <div class="right"><span class="chip outline" id="imp-label" style="font-size:8px">${esc(selLabel)}</span></div>
      </div>
      <div class="pane-body" id="imp-body">${impPane(ctx)}</div>
      <div class="pane-foot">${icon("shield")} Every impact carries a clause quote and an owner</div>
    </section>
  </div>
  <div class="action-bar">
    <div class="ab-item"><b>${ctx.tasks.length}</b> change tasks <span class="ab-note">sequenced by dependency</span></div>
    <div class="ab-item"><b>${ctx.tasks.reduce((n, t) => n + t.effort_days, 0)}</b> effort-days</div>
    <div class="ab-item crit"><b>${ctx.impacts.filter((i) => i.severity === "critical").length}</b> critical impacts</div>
    <div class="ab-item" style="margin-left:8px"><b>${ctx.src.days_left}</b> days left</div>
    <a class="btn" href="#/plan/${esc(src.id)}" style="background:#2fd08b;border-color:#2fd08b;color:#062b1c">Open change plan ${icon("right")}</a>
  </div>`;
}

export function mount(root, params) {
  const repaint = () => {
    const ctx = context(params);
    const doc = root.querySelector("#doc-body");
    const obl = root.querySelector("#obl-body");
    const imp = root.querySelector("#imp-body");
    const st = doc ? doc.scrollTop : 0;
    if (doc) { doc.innerHTML = docPane(ctx); doc.scrollTop = st; }
    if (obl) obl.innerHTML = oblPane(ctx);
    if (imp) { imp.innerHTML = impPane(ctx); imp.scrollTop = 0; }
    const label = root.querySelector("#imp-label");
    if (label) label.textContent = ctx.selObl ? `${ctx.selObl.section_ref} · ${ctx.selObl.kind}` : "Top impacts";
    const count = root.querySelector("#imp-count");
    if (count) count.textContent = ctx.selObl ? ctx.impacts.filter((i) => i.obligation_id === ctx.selObl.id).length : ctx.impacts.length;
  };

  root.onclick = async (e) => {
    const run = e.target.closest("[data-run]");
    if (run) {
      document.dispatchEvent(new CustomEvent("regula:run", { detail: { sourceId: run.dataset.run } }));
      return;
    }
    const filter = e.target.closest("[data-filter]");
    if (filter) {
      store.sel.filter = filter.dataset.filter;
      root.querySelectorAll("[data-filter]").forEach((b) => {
        b.className = "chip " + (b.dataset.filter === store.sel.filter
          ? (b.dataset.filter === "critical" ? "red" : b.dataset.filter === "low" ? "amber" : "green")
          : "outline");
      });
      const ctx = context(params);
      const obl = root.querySelector("#obl-body");
      if (obl) obl.innerHTML = oblPane(ctx);
      return;
    }
    const clause = e.target.closest("[data-clause]");
    if (clause) {
      const ctx = context(params);
      const id = clause.dataset.clause;
      const first = ctx.obls.find((o) => o.clause_id === id);
      store.sel.clauseId = id;
      store.sel.obligationId = first ? first.id : null;
      repaint();
      return;
    }
    const obl = e.target.closest("[data-obl]");
    if (obl) {
      store.sel.obligationId = obl.dataset.obl;
      const ctx = context(params);
      const o = ctx.obls.find((x) => x.id === obl.dataset.obl);
      if (o) store.sel.clauseId = o.clause_id;
      repaint();
      return;
    }
    const approve = e.target.closest("[data-approve]");
    if (approve) {
      const id = approve.dataset.approve;
      approve.disabled = true;
      try {
        await api.reviewImpact(id, "approved", "Approved in impact review.");
        const imp = store.data.impacts.find((i) => i.id === id);
        if (imp) { imp.status = "approved"; imp.reviewed_by = "Priya Menon"; }
        repaint();
        toast("Impact approved and written to the audit chain");
        refresh().catch(() => {});
      } catch (err) {
        approve.disabled = false;
        toast(err.message, "err");
      }
      return;
    }
    const reject = e.target.closest("[data-reject]");
    if (reject) {
      const id = reject.dataset.reject;
      reject.disabled = true;
      try {
        await api.reviewImpact(id, "rejected", "Rejected after impact review.");
        const imp = store.data.impacts.find((i) => i.id === id);
        if (imp) { imp.status = "rejected"; imp.reviewed_by = "Priya Menon"; }
        repaint();
        toast("Impact rejected — owner will be asked to re-assess", "warn");
        refresh().catch(() => {});
      } catch (err) {
        reject.disabled = false;
        toast(err.message, "err");
      }
    }
  };
}
