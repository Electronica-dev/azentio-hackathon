import { store } from "../state.js";
import { api } from "../api.js";
import { icon, esc, fmtDate, avatar, typeDot, typeChip, toast, short } from "../ui.js";

const COLS = [
  ["proposed", "Proposed", "Awaiting owner"],
  ["approved", "Approved", "Accepted for delivery"],
  ["in_progress", "In progress", "Being implemented"],
  ["done", "Done", "Evidence attached"],
];

function taskCard(t, today) {
  const next = { proposed: "approved", approved: "in_progress", in_progress: "done", done: "proposed" }[t.status];
  const nextLabel = { approved: "Approve", in_progress: "Start", done: "Complete", proposed: "Reopen" }[next];
  return `<article class="ktask">
    <div class="k-top">
      <span class="pri ${t.priority}">${t.priority}</span>
      <span class="chip slate" style="font-size:8px">${typeDot(t.asset_type)} ${esc(t.asset_type)}</span>
      <span class="k-due ${t.due < today && t.status !== "done" ? "late" : ""}" style="margin-left:auto;font-size:8.5px">${icon("clock")} ${fmtDate(t.due)}</span>
    </div>
    <div class="k-title">${esc(t.title)}</div>
    <div class="k-desc">${esc(short(t.description, 110))}</div>
    <div class="k-foot">
      ${avatar(t.owner)}<span>${esc(t.owner.split(" ")[0])}</span>
      <span style="color:#c3cfda">·</span><span>${t.effort_days}d</span>
      ${t.depends_on?.length ? `<span style="color:#c3cfda">·</span><span title="Depends on a policy change">${icon("link")} ${t.depends_on.length}</span>` : ""}
      <button class="advance" data-task="${esc(t.id)}" data-next="${next}">${nextLabel} →</button>
    </div>
  </article>`;
}

export function render(params) {
  const d = store.data;
  const today = d.meta.as_of;
  let tasks = d.tasks;
  if (params.id) tasks = tasks.filter((t) => t.source_id === params.id);
  if (store.planFilter && store.planFilter !== "all") tasks = tasks.filter((t) => t.source_id === store.planFilter);

  const p1 = tasks.filter((t) => t.priority === "P1").length;
  const effort = tasks.reduce((n, t) => n + t.effort_days, 0);
  const due = tasks.filter((t) => t.status !== "done").sort((a, b) => a.due.localeCompare(b.due))[0];
  const completed = tasks.filter((t) => t.status === "done").length;
  const sources = [...new Map(tasks.map((t) => [t.source_id, t])).values()];

  return `<div class="page-head">
    <div>
      <div class="eyebrow">Change plan</div>
      <h1>The plan writes itself. The owner decides.</h1>
      <p>Every impact becomes one owned, sequenced task with acceptance criteria and a due date derived from the effective date — not from a project manager's optimism.</p>
    </div>
    <div class="head-right">
      ${params.id ? `<a class="btn" href="#/source/${esc(params.id)}">${icon("doc")} Assessment</a>` : ""}
      <a class="btn" href="#/graph/${esc(params.id || (d.sources[0] && d.sources[0].id))}">${icon("graph")} Impact graph</a>
    </div>
  </div>

  <div class="plan-summary">
    <div class="card sum-card"><span>Open work items</span><b>${tasks.length - completed}</b><i>${completed} complete</i></div>
    <div class="card sum-card"><span>Effort remaining</span><b>${effort}<small style="font-size:11px;color:#8fa0b1"> d</small></b><i>${(effort / 5).toFixed(1)} person-weeks</i></div>
    <div class="card sum-card"><span>Priority 1</span><b class="t-critical">${p1}</b><i>critical impacts attached</i></div>
    <div class="card sum-card"><span>Next deadline</span><b style="font-size:16px">${due ? fmtDate(due.due) : "—"}</b><i>${due ? esc(due.owner) : "nothing open"}</i></div>
    <div class="card sum-card"><span>Sources in plan</span><b>${sources.length}</b><i>${sources.map((s) => s.source_ref).slice(0, 2).join(" · ")}</i></div>
  </div>

  <div style="display:flex;gap:6px;margin-bottom:11px;align-items:center">
    <button class="chip ${(!store.planFilter || store.planFilter === "all") ? "green" : "outline"}" data-plan-filter="all" style="font-size:9px">All sources</button>
    ${d.sources.map((s) => `<button class="chip ${store.planFilter === s.id ? "green" : "outline"}" data-plan-filter="${esc(s.id)}" style="font-size:9px">${esc(s.regulator)} · ${esc(s.short_title || s.ref)}</button>`).join("")}
    <span style="margin-left:auto;font-size:10px;color:#8fa0b1">${icon("clock")} sorted by priority, then due date</span>
  </div>

  <div class="kanban">
    ${COLS.map(([key, label, hint]) => {
      const items = tasks.filter((t) => t.status === key);
      const colEffort = items.reduce((n, t) => n + t.effort_days, 0);
      return `<div class="kcol">
        <div class="kcol-head"><b>${label}</b><span class="n">${items.length}</span><span class="eff">${colEffort}d</span></div>
        ${items.map((t) => taskCard(t, today)).join("") || `<div class="empty" style="padding:18px 8px;font-size:9.5px">${hint}</div>`}
      </div>`;
    }).join("")}
  </div>`;
}

export function mount(root, params) {
  root.onclick = async (e) => {
    const filter = e.target.closest("[data-plan-filter]");
    if (filter) {
      store.planFilter = filter.dataset.planFilter;
      root.innerHTML = render(params);
      mount(root, params);
      return;
    }
    const btn = e.target.closest("[data-task]");
    if (!btn) return;
    const id = btn.dataset.task;
    const next = btn.dataset.next;
    btn.disabled = true;
    try {
      await api.taskStatus(id, next);
      const task = store.data.tasks.find((t) => t.id === id);
      if (task) task.status = next;
      root.innerHTML = render(params);
      mount(root, params);
      toast(`Task moved to ${next.replace("_", " ")} · audit event written`);
    } catch (err) {
      btn.disabled = false;
      toast(err.message, "err");
    }
  };
}
