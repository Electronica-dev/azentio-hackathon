const params = new URLSearchParams(location.search);
const FORCE_MOCK = params.get("mock") === "1";
let mockMode = FORCE_MOCK;

export const isMock = () => mockMode;

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).error || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

async function mockState() {
  const res = await fetch("mock/state.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Mock fixture not found");
  const data = await res.json();
  data.meta.mode = "mock";
  return data;
}

export const api = {
  async getState() {
    if (mockMode) return mockState();
    try {
      return await request("/api/state");
    } catch (err) {
      mockMode = true;
      const data = await mockState();
      data.meta.fallback = String(err.message || err);
      return data;
    }
  },

  async runSource(id) {
    if (mockMode) {
      const state = await mockState();
      const source = state.sources.find((s) => s.id === id) || state.sources[0];
      const imps = state.impacts.filter((i) => i.source_id === id);
      const obs = state.obligations.filter((o) => o.source_id === id);
      const tasks = state.tasks.filter((t) => t.source_id === id);
      const steps = [
        ["Ingest & align clauses", `${state.clauses.filter((c) => c.source_id === id).length} clauses · redlines generated`],
        ["Extract obligations", `${obs.length} obligations · evidence quotes linked`],
        ["Map control library", `${state.assets.length} assets evaluated`],
        ["Score & explain impact", `${imps.length} impacts scored`],
        ["Draft change plan", `${tasks.length} owned tasks sequenced`],
        ["Verify evidence chain", "100% obligations evidenced"],
      ].map(([name, detail], i) => ({ name, detail, ms: 4 + i * 3, status: "done" }));
      return {
        run: {
          id: "run-mock", source_id: id, source_ref: source.ref,
          steps, ms: 27,
          stats: {
            obligations: obs.length, impacts: imps.length, tasks: tasks.length,
            critical: imps.filter((i) => i.severity === "critical").length,
            effort_days: tasks.reduce((n, t) => n + t.effort_days, 0), coverage: 100,
          },
        },
      };
    }
    return request(`/api/sources/${id}/run`, { method: "POST", body: "{}" });
  },

  async reviewImpact(id, decision, note = "") {
    if (mockMode) throw new Error("Mock mode: start app/serve.py for write actions");
    return request(`/api/impacts/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note, actor: "Priya Menon" }),
    });
  },

  async taskStatus(id, status) {
    if (mockMode) throw new Error("Mock mode: start app/serve.py for write actions");
    return request(`/api/tasks/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, actor: "Priya Menon" }),
    });
  },

  async reset() {
    if (mockMode) return { ok: true };
    return request("/api/reset", { method: "POST", body: "{}" });
  },

  exportUrl(sourceId) {
    return `/api/export/${sourceId}.md`;
  },
};
