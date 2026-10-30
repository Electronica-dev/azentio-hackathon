import { api } from "./api.js";

export const store = {
  data: null,
  query: "",
  sel: { sourceId: null, clauseId: null, obligationId: null },
  graphMode: "critical",
};

export const bus = new EventTarget();

export async function refresh() {
  store.data = await api.getState();
  return store.data;
}

export function emitChanged() {
  bus.dispatchEvent(new Event("changed"));
}
