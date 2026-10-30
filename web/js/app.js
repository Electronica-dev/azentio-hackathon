import { api, isMock } from "./api.js";
import { store, refresh } from "./state.js";
import { icon, esc, toast, fmtTime } from "./ui.js";
import * as inbox from "./views/inbox.js";
import * as source from "./views/source.js";
import * as graph from "./views/graph.js";
import * as plan from "./views/plan.js";
import * as audit from "./views/audit.js";

const routes = { inbox, source, graph, plan, audit };
const viewEl = document.getElementById("view");
const modalWrap = document.getElementById("modal-wrap");
const searchEl = document.getElementById("search");
const runBtn = document.getElementById("run-btn");

let current = { name: "inbox", id: null };

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "").trim();
  if (!raw) return { name: "inbox", id: null };
  const [name, id] = raw.split("/");
  return { name: routes[name] ? name : "inbox", id: id || null };
}

function activeSource() {
  if (current.name === "source" || current.name === "graph") {
    return store.data.sources.find((s) => s.id === current.id) || null;
  }
  return null;
}

function crumbs() {
  const src = activeSource();
  if (current.name === "inbox") return `<b>Regulatory inbox</b><span class="sep">/</span><span>${esc(store.data.meta.org)}</span>`;
  if (current.name === "audit") return `<b>Audit trail</b><span class="sep">/</span><span>Evidence chain</span>`;
  if (current.name === "plan") return `<b>Change plan</b><span class="sep">/</span><span>${src ? esc(src.ref) : "All sources"}</span>`;
  if (current.name === "graph") return `<b>Impact graph</b><span class="sep">/</span><span>${src ? esc(src.ref) : "All"}</span>`;
  if (src) return `<a href="#/inbox">Inbox</a><span class="sep">/</span><b>${esc(src.ref)}</b><span class="chip ${src.regulator.toLowerCase()}">${esc(src.regulator)}</span>`;
  return `<b>Regulatory inbox</b>`;
}

function setChrome() {
  document.getElementById("crumbs").innerHTML = crumbs();
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const isActive = a.dataset.nav === current.name || (current.name === "source" && a.dataset.nav === "inbox") || (current.name === "graph" && a.dataset.nav === "graph");
    a.classList.toggle("active", isActive);
  });
  const src = activeSource();
  runBtn.innerHTML = `${icon("play")} ${src && src.status === "new" ? "Analyse this circular" : "Run agent"}`;
  const s = store.data.summary;
  document.getElementById("nav-count").textContent = s.sources;
  document.getElementById("nav-plan").textContent = s.tasks;
  const mode = document.querySelector(".mode-chip");
  if (mode) {
    mode.innerHTML = `<span class="dot"></span> ${isMock() ? "Fixture mode" : "Deterministic run"}`;
    if (isMock()) mode.style.color = "#9c5c0c";
  }
}

function render() {
  const { name, id } = parseHash();
  if (!routes[name]) return;
  current = { name, id };
  const view = routes[name];
  const params = { id };
  const cls = { source: "source-view", graph: "graph-view", plan: "plan-view", audit: "audit-view" }[name] || "";
  viewEl.className = `view ${cls}`.trim();
  viewEl.innerHTML = view.render(params);
  if (view.mount) view.mount(viewEl, params);
  setChrome();
  window.scrollTo({ top: 0 });
}

/* ---------- agent run ---------- */
function showRunModal(source) {
  modalWrap.hidden = false;
  modalWrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Agent run">
      <div class="modal-top">
        <div class="mt-icon">${icon("bolt")}</div>
        <div><h2>Analysing regulatory change</h2><p>${esc(source.ref)} · ${esc(source.short_title || source.title)}</p></div>
        <button class="icon-btn x" data-close>${icon("x")}</button>
      </div>
      <div class="modal-body">
        <div class="run-steps" id="run-steps">
          ${["Reading the circular", "Splitting clauses", "Extracting obligations", "Mapping the control library", "Scoring impact", "Drafting the change plan", "Verifying evidence"].map((n) => `
            <div class="rstep"><span class="rs-dot">${icon("check")}</span><div><div class="rs-name">${n}</div><div class="rs-detail">working…</div></div></div>`).join("")}
        </div>
        <div class="modal-actions"><span class="mono" style="margin-right:auto;font-size:9.5px;color:#8fa0b1" id="run-clock">0.0s</span></div>
      </div>
    </div>`;
  modalWrap.querySelector("[data-close]").onclick = closeModal;
  const clock = document.getElementById("run-clock");
  const t0 = performance.now();
  const timer = setInterval(() => { clock.textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s"; }, 100);
  return timer;
}

function closeModal() {
  modalWrap.hidden = true;
  modalWrap.innerHTML = "";
}

async function runAgent(sourceId) {
  const source = store.data.sources.find((s) => s.id === sourceId) || store.data.sources.find((s) => s.status === "new");
  if (!source) { toast("Every circular has been analysed", "warn"); return; }
  const timer = showRunModal(source);
  let result;
  try {
    result = await api.runSource(source.id);
  } catch (err) {
    clearInterval(timer);
    closeModal();
    toast(`Agent run failed: ${err.message}`, "err");
    return;
  }
  clearInterval(timer);
  const steps = result.run.steps;
  const stepsEl = document.getElementById("run-steps");
  const total = (result.run.ms / 1000).toFixed(2);
  stepsEl.innerHTML = steps.map((s) => `
    <div class="rstep"><span class="rs-dot">${icon("check")}</span>
      <div><div class="rs-name">${esc(s.name)}</div><div class="rs-detail">${esc(s.detail)}</div></div>
      <span class="rs-ms">${s.ms}ms</span>
    </div>`).join("");
  let i = 0;
  const advance = () => {
    const nodes = [...stepsEl.querySelectorAll(".rstep")];
    if (i < nodes.length) {
      nodes[i].classList.add("on", "done");
      nodes[i].scrollIntoView({ block: "nearest" });
      i += 1;
      setTimeout(advance, 150);
      return;
    }
    const st = result.run.stats;
    const body = stepsEl.parentElement;
    const summary = document.createElement("div");
    summary.className = "run-summary";
    summary.innerHTML = `
      <div><b>${st.obligations}</b><span>obligations</span></div>
      <div><b>${st.impacts}</b><span>impacts</span></div>
      <div><b class="t-critical">${st.critical}</b><span>critical</span></div>
      <div><b>${st.tasks}</b><span>tasks</span></div>
      <div><b>${total}s</b><span>agent time</span></div>`;
    body.insertBefore(summary, body.querySelector(".modal-actions"));
    const actions = body.querySelector(".modal-actions");
    actions.innerHTML = `<span class="mono" style="margin-right:auto;font-size:9.5px;color:#8fa0b1">${steps.length} steps · evidence verified</span>
      <button class="btn" data-close>Close</button>
      <button class="btn btn-primary" id="open-run">View assessment ${icon("right")}</button>`;
    actions.querySelector("[data-close]").onclick = closeModal;
    actions.querySelector("#open-run").onclick = async () => {
      closeModal();
      await refresh();
      location.hash = `#/source/${source.id}`;
      if (location.hash === `#/source/${source.id}`) render();
      toast(`${st.impacts} impacts mapped across ${st.tasks} change tasks`);
    };
  };
  setTimeout(advance, 120);
}

/* ---------- events ---------- */
runBtn.addEventListener("click", () => {
  const src = activeSource();
  runAgent(src ? src.id : null);
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeModal();
  if (e.target === modalWrap) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "/" && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
  }
});

searchEl.addEventListener("input", () => {
  store.query = searchEl.value.trim().toLowerCase();
  if (current.name === "inbox") render();
});

document.getElementById("avatar").addEventListener("click", () => {
  toast("Signed in as Priya Menon · Head of Compliance");
});

document.addEventListener("regula:run", (e) => runAgent(e.detail.sourceId));
document.addEventListener("regula:changed", async () => { await refresh(); render(); });

window.addEventListener("hashchange", () => {
  const { name, id } = parseHash();
  if (name !== current.name || id !== current.id) render();
});

/* ---------- boot ---------- */
async function boot() {
  viewEl.innerHTML = `<div style="padding:40px;color:#8fa0b1;font-size:12px">Loading regulatory workspace…</div>`;
  try {
    await refresh();
  } catch (err) {
    viewEl.innerHTML = `<div class="empty" style="padding:80px 20px">${icon("alert")}<div><b>Could not load workspace</b><br/>${esc(err.message)}<br/><br/>Run <span class="mono">run.cmd</span> and refresh.</div></div>`;
    return;
  }
  if (store.data.meta.mode === "mock") {
    toast("Running on the local fixture — start the API for live runs", "warn");
  }
  render();
}

boot();
