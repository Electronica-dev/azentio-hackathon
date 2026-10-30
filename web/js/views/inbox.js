import { store } from "../state.js";
import { icon, esc, fmtDate, dayLabel, sevBar, statusChip, avatar, typeChip, fmtTime, short } from "../ui.js";

const TYPE_ORDER = ["policy", "process", "system", "control"];
const TYPE_COLOR = { policy: "#7050d8", process: "#3b6fd4", system: "#16915c", control: "#b4701a" };

function kpi({ iconName, label, value, unit, sub, warn }) {
  return `<div class="card kpi ${warn ? "warn" : ""}">
    <div class="k-top"><span class="k-icon">${icon(iconName)}</span>${esc(label)}</div>
    <div class="k-val">${value}${unit ? `<small>${unit}</small>` : ""}</div>
    <div class="k-sub">${sub}</div>
    <svg class="k-spark" viewBox="0 0 62 24" preserveAspectRatio="none"><path d="M1 19 L11 15 L21 17 L31 10 L41 12 L51 6 L61 8"/></svg>
  </div>`;
}

export function render() {
  const d = store.data;
  const q = store.query;
  const bySource = (id) => d.impacts.filter((i) => i.source_id === id);
  const sources = [...d.sources]
    .sort((a, b) => {
      const rank = { new: 0, in_review: 1, analyzed: 1, planned: 2, implementing: 3, done: 4 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.effective.localeCompare(b.effective);
    })
    .filter((s) => !q || [s.title, s.ref, s.regulator, s.owner, (s.tags || []).join(" ")].join(" ").toLowerCase().includes(q));

  const s = d.summary;
  const criticalOpen = d.impacts.filter((i) => i.severity === "critical" && i.status !== "approved").length;
  const regulators = new Set(d.sources.map((x) => x.regulator)).size;
  const nearest = [...d.sources].filter((x) => x.status !== "done").sort((a, b) => a.effective.localeCompare(b.effective))[0];
  const nearestDays = nearest ? nearest.days_left : 0;
  const ringP = Math.max(6, Math.min(100, Math.round(100 - (nearestDays / 90) * 100)));

  const rows = sources.map((src) => {
    const imps = bySource(src.id);
    const crit = imps.filter((i) => i.severity === "critical").length;
    const high = imps.filter((i) => i.severity === "high").length;
    return `<tr data-source="${esc(src.id)}" class="${src.status === "new" ? "is-new" : ""}">
      <td class="src-cell">
        <b>${esc(src.title)}</b>
        <i>${esc(src.ref)}</i>
      </td>
      <td><span class="chip ${src.regulator.toLowerCase()}">${esc(src.regulator)}</span></td>
      <td><div class="days">${fmtDate(src.effective)}<small>effective</small></div></td>
      <td><div class="days ${src.days_left < 45 ? "t-critical" : ""}">${dayLabel(src.days_left)}<small>${src.days_left < 45 ? "to comply" : "remaining"}</small></div></td>
      <td>
        <div class="impact-cell">
          ${imps.length ? `${sevBar(imps)}
          <div class="nums"><span><b>${crit}</b> critical</span><span><b>${high}</b> high</span><span>${imps.length} total</span></div>` : `<span style="font-size:10px;color:#9aabb9">Not assessed yet</span>`}
        </div>
      </td>
      <td>${statusChip(src)}${src.status === "new" ? `<button class="run-mini" data-run="${esc(src.id)}" style="margin-left:6px">${icon("play")} run</button>` : ""}</td>
      <td><div class="owner">${avatar(src.owner)}${esc(src.owner)}</div></td>
      <td class="row-go">${icon("right")}</td>
    </tr>`;
  }).join("");

  const typeTotals = TYPE_ORDER.map((t) => ({ t, n: d.impacts.filter((i) => i.asset_type === t).length }));
  const typeMax = Math.max(1, ...typeTotals.map((x) => x.n));

  const runs = d.runs.slice(0, 3).map((r) => `
    <div class="act">
      <span class="a-icon">${icon("bolt")}</span>
      <div><b>Agent run · ${esc(r.source_ref)}</b><i>${r.stats.obligations} obligations → ${r.stats.impacts} impacts · ${r.ms}ms</i></div>
      <span class="a-time">${fmtTime(r.started)}</span>
    </div>`).join("") || `<div class="muted" style="font-size:10px">No runs yet.</div>`;

  return `
  <div class="page-head">
    <div>
      <div class="eyebrow">Live regulatory change</div>
      <h1>Change is arriving faster than review capacity.</h1>
      <p>Every circular is read, split into obligations, mapped to the control library and turned into an owned change plan — with the evidence attached.</p>
    </div>
    <div class="head-right">
      <div class="asof"><b>${fmtDate(d.meta.as_of)}</b>${d.meta.scope}</div>
      <button class="btn btn-ghost" data-run="${esc(nearest ? nearest.id : "")}">${icon("bolt")} Analyse next</button>
    </div>
  </div>

  <div class="kpis">
    ${kpi({ iconName: "inbox", label: "Open changes", value: s.open_changes, sub: `<b>${d.sources.filter((x) => x.status === "new").length}</b> awaiting first pass · ${regulators} regulators` })}
    ${kpi({ iconName: "doc", label: "Obligations tracked", value: s.obligations, sub: `<b>100%</b> evidence-linked to a clause` })}
    ${kpi({ iconName: "alert", label: "Critical impacts", value: s.critical, warn: true, sub: `<b class="warn">${criticalOpen}</b> still awaiting owner action` })}
    ${kpi({ iconName: "bolt", label: "Mean assessment", value: s.last_run_ms, unit: "ms", sub: `<b>${d.audit.length}</b> audit events · chain verified` })}
  </div>

  <div class="dash">
    <div class="card table-card">
      <div class="card-head">
        <h3>Regulatory inbox</h3>
        <span class="sub">${sources.length} of ${d.sources.length} sources</span>
        <div class="right">
          <span class="chip outline">${icon("filter")} All regulators</span>
          <span class="chip outline">Effective ↑</span>
        </div>
      </div>
      <table class="tbl">
        <thead><tr><th>Circular</th><th>Regulator</th><th>Effective</th><th>Deadline</th><th>Assessed impact</th><th>Status</th><th>Owner</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8"><div class="empty">${icon("search")}<div>No circulars match “${esc(store.query)}”.</div></div></td></tr>`}</tbody>
      </table>
    </div>

    <div class="side-stack">
      <div class="card panel">
        <h3>Nearest deadline</h3>
        <div class="psub">Hard compliance date, not a reminder</div>
        <div class="deadline">
          <div class="dl-ring" style="--p:${ringP}"><span>${nearestDays}<small>DAYS</small></span></div>
          <div><b>${esc(nearest ? nearest.short_title || nearest.title : "—")}</b><i>${esc(nearest ? nearest.ref : "")} · ${nearest ? fmtDate(nearest.effective) : ""}</i></div>
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)">
          <div class="legend-row"><span class="type-dot" style="background:var(--red)"></span>Open critical impacts <span class="n">${criticalOpen}</span></div>
          <div class="legend-row"><span class="type-dot" style="background:var(--amber)"></span>Tasks due in 21 days <span class="n">${d.tasks.filter((t) => t.status !== "done" && t.due <= new Date(Date.parse(d.meta.as_of) + 21 * 864e5).toISOString().slice(0, 10)).length}</span></div>
        </div>
      </div>

      <div class="card panel">
        <h3>Impact by function</h3>
        <div class="psub">Where the change actually lands</div>
        ${typeTotals.map(({ t, n }) => `<div class="legend-row">${typeChip(t)}<span class="bar"><i style="width:${(n / typeMax) * 100}%;background:${TYPE_COLOR[t]}"></i></span><span class="n">${n}</span></div>`).join("")}
      </div>

      <div class="card panel">
        <h3>Agent activity</h3>
        <div class="psub">Last runs · deterministic, no model call</div>
        <div class="activity">${runs}</div>
      </div>
    </div>
  </div>`;
}

export function mount(root) {
  root.onclick = (e) => {
    const run = e.target.closest("[data-run]");
    if (run) {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent("regula:run", { detail: { sourceId: run.dataset.run } }));
      return;
    }
    const row = e.target.closest("[data-source]");
    if (row) location.hash = `#/source/${row.dataset.source}`;
  };
}
