import { store } from "../state.js";
import { icon, esc, sevLabel, typeChip, short, fmtDate, avatar, paramLabel } from "../ui.js";

const W = 1080;
const H = 720;
const TYPE_COLOR = { policy: "#7050d8", process: "#3b6fd4", system: "#16915c", control: "#b4701a" };
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function trunc(s, n) {
  const v = String(s || "");
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
}

export function render(params) {
  const d = store.data;
  const src = d.sources.find((s) => s.id === params.id) || d.sources.find((s) => s.status !== "new") || d.sources[0];
  if (!src) return `<div class="empty">No sources.</div>`;
  const mode = store.graphMode;
  const all = d.impacts.filter((i) => i.source_id === src.id);
  const impacts = mode === "critical" ? all.filter((i) => i.severity === "critical") : all;
  const obls = d.obligations.filter((o) => o.source_id === src.id && impacts.some((i) => i.obligation_id === o.id));
  const clauses = d.clauses.filter((c) => c.source_id === src.id && obls.some((o) => o.clause_id === c.id));
  const assets = d.assets.filter((a) => impacts.some((i) => i.asset_id === a.id));
  const tasks = d.tasks.filter((t) => t.source_id === src.id && impacts.some((i) => i.asset_id === t.asset_id));

  const scoreOfObl = (o) => Math.max(0, ...impacts.filter((i) => i.obligation_id === o.id).map((i) => i.score));
  const scoreOfAsset = (a) => Math.max(0, ...impacts.filter((i) => i.asset_id === a.id).map((i) => i.score));
  const scoreOfClause = (c) => Math.max(0, ...obls.filter((o) => o.clause_id === c.id).map(scoreOfObl));

  const ordered = {
    clause: [...clauses].sort((a, b) => scoreOfClause(b) - scoreOfClause(a)),
    obligation: [...obls].sort((a, b) => scoreOfObl(b) - scoreOfObl(a)),
    asset: [...assets].sort((a, b) => scoreOfAsset(b) - scoreOfAsset(a)),
    task: [...tasks].sort((a, b) => ({ P1: 0, P2: 1, P3: 2 }[a.priority] - { P1: 0, P2: 1, P3: 2 }[b.priority])),
  };

  const nodes = [];
  const sourceNode = { id: "source", kind: "source", x: 36, y: H / 2 - 27, w: 168, h: 54, label: src.short_title || src.title, sub: src.ref };
  nodes.push(sourceNode);

  const cols = [
    ["clause", 228, 160, 28],
    ["obligation", 428, 182, 36],
    ["asset", 646, 182, 34],
    ["task", 866, 172, 30],
  ];
  for (const [kind, x, w, h] of cols) {
    const arr = ordered[kind];
    const top = 52;
    const bottom = H - 44;
    arr.forEach((item, i) => {
      const y = arr.length === 1 ? H / 2 - h / 2 : top + (i * (bottom - top - h)) / Math.max(1, arr.length - 1);
      const label = kind === "clause" ? item.subject : kind === "obligation" ? item.statement : kind === "asset" ? item.name : item.title;
      const sub = kind === "clause" ? item.section_ref : kind === "obligation" ? `${item.section_ref} · ${item.kind}` : kind === "asset" ? `${item.type} · ${item.owner.split(" ")[0]}` : `${item.priority} · ${item.owner.split(" ")[0]} · ${item.effort_days}d`;
      nodes.push({ id: `${kind}:${item.id}`, kind, item, x, y, w, h, label, sub });
    });
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const o of obls) {
    edges.push({ from: "source", to: `clause:${o.clause_id}`, sev: "" });
    edges.push({ from: `clause:${o.clause_id}`, to: `obligation:${o.id}`, sev: "" });
  }
  for (const i of impacts) {
    if (!nodeMap[`obligation:${i.obligation_id}`] || !nodeMap[`asset:${i.asset_id}`]) continue;
    edges.push({ from: `obligation:${i.obligation_id}`, to: `asset:${i.asset_id}`, sev: i.severity, impact: i });
  }
  for (const t of tasks) {
    if (nodeMap[`asset:${t.asset_id}`]) edges.push({ from: `asset:${t.asset_id}`, to: `task:${t.id}`, sev: "" });
  }

  const edgeSvg = edges.map((e, idx) => {
    const a = nodeMap[e.from];
    const b = nodeMap[e.to];
    if (!a || !b) return "";
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const c = Math.max(40, (x2 - x1) * 0.55);
    return `<path class="edge ${e.sev}" data-edge="${idx}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}"/>`;
  }).join("");

  const nodeSvg = nodes.map((n) => {
    if (n.kind === "source") {
      return `<g class="node" data-node="source">
        <rect class="n-box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11" fill="#0f2a3f" stroke="#0b2133"/>
        <circle cx="${n.x + 20}" cy="${n.y + 20}" r="7" fill="#2fd08b" opacity=".18"/>
        <circle cx="${n.x + 20}" cy="${n.y + 20}" r="3" fill="#2fd08b"/>
        <text x="${n.x + 34}" y="${n.y + 24}" font-size="8.6" fill="#eaf6ef" font-weight="600" font-family="var(--font)">${esc(trunc(n.label, 22))}</text>
        <text x="${n.x + 12}" y="${n.y + 43}" font-size="7" fill="#83a99a" font-family="var(--mono)">${esc(trunc(n.sub, 28))}</text>
      </g>`;
    }
    const color = n.kind === "asset" ? TYPE_COLOR[n.item.type] : n.kind === "task" ? "#8b9daf" : n.kind === "obligation" ? "#c97a1c" : "#5d7fa3";
    const sev = n.kind === "obligation" ? impacts.filter((i) => i.obligation_id === n.item.id)[0]?.severity : n.kind === "asset" ? impacts.filter((i) => i.asset_id === n.item.id)[0]?.severity : null;
    const border = sev === "critical" ? "#e6a8b3" : sev === "high" ? "#ecd2ae" : "#dbe4ec";
    return `<g class="node" data-node="${esc(n.id)}">
      <rect class="n-box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="#fff" stroke="${border}"/>
      <rect x="${n.x}" y="${n.y + 5}" width="3" height="${n.h - 10}" rx="1.5" fill="${color}"/>
      <text class="n-label" x="${n.x + 11}" y="${n.y + 13.5}" font-weight="600">${esc(trunc(n.label, n.kind === "obligation" ? 28 : 26))}</text>
      <text class="n-sub" x="${n.x + 11}" y="${n.y + 25}">${esc(trunc(n.sub, 30))}</text>
    </g>`;
  }).join("");

  const detail = detailHtml({ node: null, src, impacts, obls, assets, tasks, clauses });
  const stats = `${nodes.length} nodes · ${edges.length} links · ${impacts.length} impacts`;

  return `<div class="graph-head">
    <div>
      <div class="eyebrow">Traceability</div>
      <h1>From clause to code change.</h1>
      <p>${esc(src.ref)} · every edge is evidence. ${mode === "critical" ? "Showing the critical path only." : "Showing every assessed link."}</p>
    </div>
    <div class="right">
      <div class="seg">
        <button class="${mode === "critical" ? "on" : ""}" data-mode="critical">Critical path</button>
        <button class="${mode === "all" ? "on" : ""}" data-mode="all">All links</button>
      </div>
      <a class="btn" href="#/source/${esc(src.id)}">${icon("doc")} Assessment</a>
      <a class="btn" href="#/plan/${esc(src.id)}">${icon("plan")} Plan</a>
    </div>
  </div>
  <div class="graph-main">
    <div class="graph-canvas">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" id="graph-svg">
        ${edgeSvg}
        ${nodeSvg}
        <text x="36" y="24" font-size="8" fill="#9aabb9" letter-spacing="1.4" font-family="var(--font)" font-weight="700">REGULATION</text>
        <text x="228" y="24" font-size="8" fill="#9aabb9" letter-spacing="1.4" font-family="var(--font)" font-weight="700">CLAUSE</text>
        <text x="428" y="24" font-size="8" fill="#9aabb9" letter-spacing="1.4" font-family="var(--font)" font-weight="700">OBLIGATION</text>
        <text x="646" y="24" font-size="8" fill="#9aabb9" letter-spacing="1.4" font-family="var(--font)" font-weight="700">POLICY · PROCESS · SYSTEM</text>
        <text x="866" y="24" font-size="8" fill="#9aabb9" letter-spacing="1.4" font-family="var(--font)" font-weight="700">CHANGE TASK</text>
      </svg>
      <aside class="detail-panel" id="dp" hidden>${detail}</aside>
      <div class="graph-hint">${stats}</div>
      <div class="graph-legend">
        <span><i style="background:#7050d8"></i>Policy</span>
        <span><i style="background:#3b6fd4"></i>Process</span>
        <span><i style="background:#16915c"></i>System</span>
        <span><i style="background:#b4701a"></i>Control</span>
        <span><i style="background:#e79aa7"></i>Critical link</span>
      </div>
    </div>
  </div>`;
}

function detailHtml({ node, src, impacts, obls, assets, tasks, clauses }) {
  if (!node) {
    const top = [...impacts].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.score - a.score).slice(0, 4);
    return `<div class="dp-kicker">Impact map</div>
      <h3>${esc(src.short_title || src.title)}</h3>
      <div class="dp-sub">${esc(src.ref)} · effective ${fmtDate(src.effective)}</div>
      <div class="dp-section">
        <h4>Reading the graph</h4>
        <div class="dp-row"><span>Obligations</span><b>${obls.length}</b></div>
        <div class="dp-row"><span>Impacted assets</span><b>${assets.length}</b></div>
        <div class="dp-row"><span>Change tasks</span><b>${tasks.length}</b></div>
        <div class="dp-row"><span>Critical links</span><b class="t-critical">${impacts.filter((i) => i.severity === "critical").length}</b></div>
      </div>
      <div class="dp-section">
        <h4>Highest impact</h4>
        ${top.map((i) => `<div style="padding:6px 0;border-bottom:1px solid var(--line-2)">
          <div style="display:flex;align-items:center;gap:5px">${sevLabel(i.severity)}<span class="mono" style="margin-left:auto;font-size:8.5px;color:#8fa0b1">${i.score}</span></div>
          <div style="font-size:10.3px;font-weight:600;margin-top:3px">${esc(short(i.asset_name, 34))}</div>
          <div style="font-size:9.2px;color:#7a8d9e;margin-top:2px">${esc(short(i.gap, 78))}</div>
        </div>`).join("")}
      </div>
      <div class="dp-section">
        <button class="btn btn-sm" data-goto="#/source/${esc(src.id)}">Open full assessment ${icon("right")}</button>
      </div>`;
  }
  if (node.kind === "source") {
    return `<div class="dp-kicker">Regulation</div><h3>${esc(src.title)}</h3><div class="dp-sub">${esc(src.ref)}</div>
      <div class="dp-section"><h4>At a glance</h4>
        <div class="dp-row"><span>Regulator</span><b>${esc(src.regulator)}</b></div>
        <div class="dp-row"><span>Published</span><b>${fmtDate(src.published)}</b></div>
        <div class="dp-row"><span>Effective</span><b>${fmtDate(src.effective)}</b></div>
        <div class="dp-row"><span>Days left</span><b class="${src.days_left < 45 ? "t-critical" : ""}">${src.days_left}</b></div>
        <div class="dp-row"><span>Owner</span><b>${esc(src.owner)}</b></div>
      </div>
      <div class="dp-section"><button class="btn btn-sm" data-goto="#/source/${esc(src.id)}">Open assessment ${icon("right")}</button></div>`;
  }
  if (node.kind === "clause") {
    const c = node.item;
    return `<div class="dp-kicker">Clause</div><h3>${esc(c.section_ref)} · ${esc(c.subject)}</h3><div class="dp-sub">${esc(c.heading)}</div>
      <div class="dp-section"><h4>Change</h4><span class="chip ${c.change_type === "added" ? "green" : c.change_type === "removed" ? "red" : "amber"}">${esc(c.change_type)}</span>
        <div class="dp-quote">${esc(short(c.body, 340))}</div>
      </div>
      <div class="dp-section"><div class="dp-row"><span>Obligations</span><b>${obls.filter((o) => o.clause_id === c.id).length}</b></div></div>`;
  }
  if (node.kind === "obligation") {
    const o = node.item;
    const imps = impacts.filter((i) => i.obligation_id === o.id);
    return `<div class="dp-kicker">Obligation</div><h3>${esc(o.section_ref)}</h3><div class="dp-sub">${esc(o.kind)} · ${esc(o.modality)} · ${Math.round(o.confidence * 100)}% confidence</div>
      <div class="dp-quote">${esc(o.statement)}</div>
      <div class="dp-section"><h4>Parameters</h4>
        ${Object.entries(o.params || {}).map(([k, v]) => `<div class="dp-row"><span>${esc(paramLabel(k))}</span><b>${esc(String(v))}</b></div>`).join("") || `<div class="muted" style="font-size:10px">No machine-readable parameters.</div>`}
      </div>
      <div class="dp-section"><h4>Impact (${imps.length})</h4>
        ${imps.map((i) => `<div style="display:flex;gap:6px;align-items:center;padding:3px 0;font-size:10px">${sevLabel(i.severity)}<span style="margin-left:auto">${esc(short(i.asset_name, 28))}</span></div>`).join("")}
      </div>`;
  }
  if (node.kind === "asset") {
    const a = node.item;
    const imps = impacts.filter((i) => i.asset_id === a.id);
    return `<div class="dp-kicker">${esc(a.type)}</div><h3>${esc(a.name)}</h3><div class="dp-sub">${esc(a.owner)} · ${esc(a.team)} · v${esc(a.version)}</div>
      <div class="dp-section"><h4>Current state</h4><div style="font-size:10.2px;line-height:1.5;color:#53687a">${esc(a.state)}</div></div>
      <div class="dp-section"><h4>Gap</h4><div style="font-size:10.2px;line-height:1.5;color:#8a5a12">${esc(a.gap)}</div></div>
      <div class="dp-section"><div class="dp-row"><span>Criticality</span><b>${a.criticality}/5</b></div><div class="dp-row"><span>Impacts</span><b>${imps.length}</b></div><div class="dp-row"><span>Effort</span><b>${Math.max(...imps.map((i) => i.effort_days))}d</b></div></div>
      <div class="dp-section"><button class="btn btn-sm" data-goto="#/plan/${esc(src.id)}">See change task ${icon("right")}</button></div>`;
  }
  const t = node.item;
  return `<div class="dp-kicker">Change task</div><h3>${esc(t.title)}</h3><div class="dp-sub">${esc(t.priority)} · ${esc(t.owner)} · ${esc(t.team)}</div>
    <div class="dp-section"><div class="dp-row"><span>Due</span><b>${fmtDate(t.due)}</b></div><div class="dp-row"><span>Effort</span><b>${t.effort_days} days</b></div><div class="dp-row"><span>Status</span><b>${esc(t.status.replace("_", " "))}</b></div></div>
    <div class="dp-section"><h4>Acceptance</h4><div style="font-size:10.2px;line-height:1.5;color:#53687a">${esc(t.acceptance)}</div></div>`;
}

export function mount(root, params) {
  const svg = root.querySelector("#graph-svg");
  const dp = root.querySelector("#dp");

  const select = (id) => {
    const d = store.data;
    const src = d.sources.find((s) => s.id === params.id) || d.sources.find((s) => s.status !== "new") || d.sources[0];
    const all = d.impacts.filter((i) => i.source_id === src.id);
    const impacts = store.graphMode === "critical" ? all.filter((i) => i.severity === "critical") : all;
    const obls = d.obligations.filter((o) => o.source_id === src.id && impacts.some((i) => i.obligation_id === o.id));
    const assets = d.assets.filter((a) => impacts.some((i) => i.asset_id === a.id));
    const tasks = d.tasks.filter((t) => t.source_id === src.id && impacts.some((i) => i.asset_id === t.asset_id));
    const clauses = d.clauses.filter((c) => c.source_id === src.id && obls.some((o) => o.clause_id === c.id));
    let node = null;
    if (id !== "source") {
      const [kind, ...rest] = id.split(":");
      const itemId = rest.join(":");
      const pool = kind === "clause" ? clauses : kind === "obligation" ? obls : kind === "asset" ? assets : tasks;
      const item = pool.find((x) => x.id === itemId);
      if (item) node = { kind, item };
    } else {
      node = { kind: "source", item: src };
    }
    if (!node) return;
    dp.hidden = false;
    dp.innerHTML = `<button class="icon-btn dp-close" data-dp-close title="Close">${icon("x")}</button>` + detailHtml({ node, src, impacts, obls, assets, tasks, clauses });

    const neighbors = new Set([id]);
    svg.querySelectorAll("[data-edge]").forEach((e) => {
      const on = e.dataset.from === id || e.dataset.to === id;
      e.classList.toggle("dim", id !== "source" && !on);
      if (on) {
        neighbors.add(e.dataset.from);
        neighbors.add(e.dataset.to);
      }
    });
    svg.querySelectorAll("[data-node]").forEach((n) => {
      n.classList.toggle("sel", n.dataset.node === id);
      n.classList.toggle("dim", id !== "source" && !neighbors.has(n.dataset.node));
    });
  };

  root.onclick = (e) => {
    const close = e.target.closest("[data-dp-close]");
    if (close) {
      dp.hidden = true;
      svg.querySelectorAll(".dim, .sel").forEach((n) => n.classList.remove("dim", "sel"));
      return;
    }
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      store.graphMode = mode.dataset.mode;
      root.innerHTML = render(params);
      mount(root, params);
      return;
    }
    const go = e.target.closest("[data-goto]");
    if (go) { location.hash = go.dataset.goto; return; }
    const node = e.target.closest("[data-node]");
    if (node) select(node.dataset.node);
  };
}
