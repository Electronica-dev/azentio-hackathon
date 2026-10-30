const PATHS = {
  inbox: '<path d="M3.5 6.5h17v13h-17z"/><path d="M3.5 13h4.6l1.8 2.6h4.2l1.8-2.6h4.6"/>',
  graph: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="8" r="2.2"/><circle cx="9" cy="18" r="2.2"/><circle cx="19" cy="17" r="2.2"/><path d="M8 7l8 .8M7.2 8l1.2 8M11 17.6l6-.4M16.4 9.4l1.9 5.6"/>',
  plan: '<path d="M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  download: '<path d="M12 4v10m0 0l3.5-3.5M12 14l-3.5-3.5"/><path d="M5 17v2.5h14V17"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 1.8"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  book: '<path d="M4 5.5c3-1 5.5-.6 8 1 2.5-1.6 5-2 8-1v13c-3-1-5.5-.6-8 1-2.5-1.6-5-2-8-1z"/><path d="M12 6.5v13"/>',
  flow: '<rect x="3.5" y="4" width="6" height="5" rx="1.2"/><rect x="14.5" y="4" width="6" height="5" rx="1.2"/><rect x="9" y="15" width="6" height="5" rx="1.2"/><path d="M6.5 9v2.5h11V9M12 11.5V15"/>',
  server: '<rect x="3.5" y="4" width="17" height="6" rx="1.5"/><rect x="3.5" y="14" width="17" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="1.8"/><circle cx="8" cy="17" r="1.8"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>',
  bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  filter: '<path d="M4 5h16l-6.2 7.4V20l-3.6-2v-5.6z"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
};

export function icon(name, cls = "") {
  const p = PATHS[name] || PATHS.doc;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(n) {
  if (n === undefined || n === null) return "—";
  if (n < 0) return `${Math.abs(n)}d overdue`;
  if (n === 0) return "today";
  return `${n} days`;
}

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export function avatar(name = "") {
  return `<span class="mini-av" title="${esc(name)}">${esc(initials(name))}</span>`;
}

const TYPE_CLASS = { policy: "violet", process: "blue", system: "green", control: "amber" };
const TYPE_LABEL = { policy: "Policy", process: "Process", system: "System", control: "Control" };

export function typeChip(type) {
  return `<span class="chip ${TYPE_CLASS[type] || "slate"}">${TYPE_LABEL[type] || type}</span>`;
}

export function typeDot(type) {
  return `<span class="type-dot type-${type}"></span>`;
}

export function sevLabel(sev) {
  return `<span class="sev ${sev}">${esc(sev)}</span>`;
}

export function statusChip(source) {
  const map = {
    new: ["green", "Needs analysis"],
    in_review: ["blue", "In review"],
    analyzed: ["blue", "Analyzed"],
    planned: ["violet", "Planned"],
    implementing: ["amber", "Implementing"],
    done: ["slate", "Closed"],
  };
  const [cls, label] = map[source.status] || ["slate", source.status];
  const dot = source.status === "new" ? '<span class="pulse" style="width:5px;height:5px"></span>' : "";
  return `<span class="chip ${cls}">${dot}${label}</span>`;
}

export function sevBar(impacts) {
  const c = impacts.filter((i) => i.severity === "critical").length;
  const h = impacts.filter((i) => i.severity === "high").length;
  const m = impacts.filter((i) => i.severity === "medium").length;
  const total = Math.max(1, impacts.length);
  return `<div class="sevbar" title="${c} critical · ${h} high · ${m} medium">
    <i class="c" style="width:${(c / total) * 100}%"></i>
    <i class="h" style="width:${(h / total) * 100}%"></i>
    <i class="m" style="width:${(m / total) * 100}%"></i>
  </div>`;
}

export function confBar(value) {
  return `<span class="conf-bar"><i style="width:${Math.round(value * 100)}%"></i></span>`;
}

const PARAM_SHORT = {
  review_cycle_months: "re-KYC",
  risk_review_months: "risk review",
  bo_threshold_pct: "BO threshold",
  bo_refresh_months: "BO refresh",
  retention_years: "retention",
  vcip_retention_years: "V-CIP retention",
  crilc_reporting_days: "CRILC SLA",
  high_value_txn_limit: "high-value limit",
  board_review_months: "board review",
  committee_review_months: "committee review",
  liveness_check: "liveness",
  geo_tag: "geo-tag",
  consent_revocable: "revocable",
  consent_purpose_bound: "purpose-bound",
  dlg_cap_pct: "DLG cap",
  cooling_off_days: "cooling-off",
  kfs_languages: "KFS languages",
  kfs_ack: "KFS ack",
  soc_hours: "SOC hours",
  log_retention_days: "log retention",
  incident_report_hours: "incident SLA",
  cyber_assessment: "cyber assessment",
  retrieval_hours: "retrieval SLA",
};

export function paramLabel(key) {
  return PARAM_SHORT[key] || key.replace(/_/g, " ");
}

export function short(text, n = 66) {
  const s = String(text || "").replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function toast(message, kind = "ok") {
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === "ok" ? "check" : "alert")}<span>${esc(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s, transform .25s";
    el.style.opacity = "0";
    el.style.transform = "translateX(10px)";
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

export function hash(s) {
  return String(s || "").slice(0, 10);
}
