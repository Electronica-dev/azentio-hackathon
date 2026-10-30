import { store, refresh } from "../state.js";
import { api, isMock } from "../api.js";
import { icon, esc, fmtDate, fmtTime, hash, toast } from "../ui.js";

const ACTIONS = {
  "source.ingested": ["Source ingested", "doc"],
  "agent.run.completed": ["Agent run completed", "bolt"],
  "impact.approved": ["Impact approved", "check"],
  "impact.rejected": ["Impact rejected", "x"],
  "task.status_changed": ["Task status changed", "plan"],
  "plan.generated": ["Change plan generated", "plan"],
  "report.exported": ["Assessment exported", "download"],
};

export function render() {
  const d = store.data;
  const events = [...d.audit].reverse();
  const chain = d.audit_chain || { ok: true, checked: events.length, head: "" };
  const latest = d.sources.find((s) => s.status !== "new") || d.sources[0];

  const rows = events.map((e) => {
    const [label, ic] = ACTIONS[e.action] || [e.action, "hash"];
    const agent = e.actor.toLowerCase().includes("agent") || e.actor.toLowerCase().includes("service") || e.actor.toLowerCase().includes("ingestion");
    return `<div class="tev ${agent ? "agent" : "human"}">
      <div class="t-head">
        <span class="a-icon" style="width:20px;height:20px;border-radius:6px;background:#f2f5f8;display:grid;place-items:center;color:#71859a">${icon(ic)}</span>
        <span class="t-action">${esc(label)}</span>
        <span class="t-time">${fmtDate(e.ts)} · ${fmtTime(e.ts)}</span>
      </div>
      <div class="t-detail">${esc(e.detail)}</div>
      <div class="t-hash">${esc(e.entity)} · ${esc(e.id)} · <b style="color:#6f8598">${esc(hash(e.hash))}</b> ← ${esc(hash(e.prev_hash))}${agent ? "" : ` · ${esc(e.actor)}`}</div>
    </div>`;
  }).join("");

  return `<div class="page-head">
    <div>
      <div class="eyebrow">Evidence chain</div>
      <h1>If it isn't evidenced, it didn't happen.</h1>
      <p>Every extraction, score, approval and status change is append-only and hash-linked to the event before it. Export the pack; a supervisor can verify it without trusting the agent.</p>
    </div>
    <div class="head-right">
      <div class="asof"><b>${events.length} events</b>SHA-256 · prev-hash linked</div>
      <button class="btn" data-verify>${icon("shield")} Verify chain</button>
    </div>
  </div>

  <div class="chain-banner">
    <div class="cb-icon">${icon("shield")}</div>
    <div><b>${chain.ok ? "Chain verified" : "Chain verification failed"}</b>
      <p>genesis 000000000000 → head ${esc(chain.head || "—")} · ${chain.checked} events checked</p>
    </div>
    <span class="chip ${chain.ok ? "green" : "red"}" style="background:rgba(47,208,139,.15);color:#9cecc6;border:1px solid rgba(47,208,139,.25)">${chain.ok ? "TAMPER-EVIDENT" : "BROKEN"}</span>
  </div>

  <div class="audit-grid">
    <div class="card" style="padding:14px 16px 8px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
        <h3 style="margin:0;font-size:12.5px">Event log</h3>
        <span class="chip outline">Newest first</span>
        <span style="margin-left:auto;font-size:10px;color:#8fa0b1">${icon("hash")} hash chain</span>
      </div>
      <div class="timeline">${rows || `<div class="empty">No events.</div>`}</div>
    </div>

    <div class="audit-side">
      <div class="card panel">
        <h3>Chain facts</h3>
        <div class="psub">What the verifier checks</div>
        <div class="dp-row"><span>Algorithm</span><b>SHA-256</b></div>
        <div class="dp-row"><span>Events</span><b>${chain.checked}</b></div>
        <div class="dp-row"><span>Genesis</span><b class="mono" style="font-size:9px">000000000000</b></div>
        <div class="dp-row"><span>Head</span><b class="mono" style="font-size:9px">${esc(chain.head || "—")}</b></div>
        <div class="dp-row"><span>Storage</span><b>Append-only</b></div>
        <div class="dp-row"><span>Human actions</span><b>${events.filter((e) => !/agent|service|ingestion/i.test(e.actor)).length}</b></div>
      </div>

      <div class="card panel">
        <h3>Export evidence pack</h3>
        <div class="psub">Assessment + tasks + chain excerpt</div>
        ${isMock() ? `<div class="muted" style="font-size:10px">Start the API to export.</div>` : `<a class="btn btn-sm" href="${api.exportUrl(latest ? latest.id : "")}" download style="width:100%;justify-content:center">${icon("download")} Download .md pack</a>`}
        <div style="margin-top:9px;font-size:9.2px;color:#8fa0b1;line-height:1.5">Includes clause references, impact scores, owners, due dates and the last eight audit events.</div>
      </div>

      <div class="card panel">
        <h3>Why this matters</h3>
        <div class="psub">The question every auditor asks</div>
        <div style="font-size:10px;line-height:1.55;color:#5b6f80">
          <div style="display:flex;gap:7px;margin-bottom:6px"><b style="color:#16915c">01</b><span>Which clause forced this change?</span></div>
          <div style="display:flex;gap:7px;margin-bottom:6px"><b style="color:#16915c">02</b><span>Who approved the impact, and when?</span></div>
          <div style="display:flex;gap:7px;margin-bottom:6px"><b style="color:#16915c">03</b><span>Could the record have been edited after the fact?</span></div>
          <div style="display:flex;gap:7px"><b style="color:#16915c">04</b><span>What is the evidence for the due date?</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

export function mount(root) {
  root.onclick = async (e) => {
    const verify = e.target.closest("[data-verify]");
    if (!verify) return;
    verify.disabled = true;
    try {
      const fresh = await api.getState();
      store.data = fresh;
      const chain = fresh.audit_chain;
      if (chain.ok) toast(`Chain intact — ${chain.checked} events verified`);
      else toast(`Chain broken at ${chain.broken_at}`, "err");
      root.innerHTML = render();
      mount(root);
    } catch (err) {
      verify.disabled = false;
      toast(err.message, "err");
    }
  };
}
