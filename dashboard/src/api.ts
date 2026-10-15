import type { Contact, Issue } from "./types";

const baseUrl = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json() as { error: string };
    throw new Error(body.error);
  }
  return await response.json() as T;
}

export function listContacts() {
  return request<{ contacts: Contact[] }>("/api/contacts");
}

export function listIssues() {
  return request<{ issues: Issue[] }>("/api/issues");
}

export function createContact(name: string) {
  return request<{ contact: Contact }>("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}
