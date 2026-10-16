import type { AuditList, CallQueue } from "./types";

const baseUrl = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ error: "Request failed." }))) as { error?: string };
    throw new Error(body.error || "Request failed.");
  }
  return response.json() as Promise<T>;
}

export function listAudits(page: number, from: string, to: string) {
  const query = new URLSearchParams({ page: String(page), limit: "10" });
  if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) query.set("to", new Date(`${to}T23:59:59.999`).toISOString());
  return request<AuditList>(`/api/audits?${query}`);
}
export function completeAudit(id: string, verdict: boolean, payload: string) {
  return request(`/api/tickets/${id}/audit`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Voice-Audit-Local": "1" },
    body: JSON.stringify({ verdict, payload }),
  });
}

export function startCallQueue(ticketIds: string[]) {
  return request<{ queue: CallQueue }>("/api/calls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketIds }),
  });
}

export function getCallQueue(id: string) {
  return request<{ queue: CallQueue }>(`/api/calls/${encodeURIComponent(id)}`);
}
