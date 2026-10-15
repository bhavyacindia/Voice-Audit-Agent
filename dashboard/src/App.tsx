import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createContact, listContacts, listIssues } from "./api";
import type { Contact, Issue } from "./types";

type Page = "contacts" | "issues";
const currentPage = (): Page => window.location.hash === "#/issues" ? "issues" : "contacts";

function statusLabel(status: Contact["resolutionStatus"]) {
  if (status === "needs_escalation") return "Needs escalation";
  return status === "resolved" ? "Resolved" : "Pending";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"terminal" | "monitor" | "">("");

  useEffect(() => {
    const onHashChange = () => setPage(currentPage());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async (initial: boolean) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      try {
        const [contactResult, issueResult] = await Promise.all([listContacts(), listIssues()]);
        if (!active) return;
        setContacts(contactResult.contacts);
        setIssues(issueResult.issues);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load the dashboard.");
      } finally {
        if (active) { setLoading(false); setRefreshing(false); }
      }
    };
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const selectedContact = contacts.find((contact) => contact.id === selectedId) ?? null;
  const contactNames = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact.name])), [contacts]);
  const resolvedCount = contacts.filter((contact) => contact.resolutionStatus === "resolved").length;
  const escalationCount = contacts.filter((contact) => contact.resolutionStatus === "needs_escalation").length;
  const terminalCommand = selectedContact ? `$env:VOICE_AUDIT_CONTACT_ID = "${selectedContact.id}"\npnpm voice` : "";
  const monitorCommand = selectedContact ? `$env:VOICE_AUDIT_CONTACT_ID = "${selectedContact.id}"\nnode scripts/voice-monitor.mjs` : "";

  async function handleCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await createContact(name.trim());
      setContacts((current) => [result.contact, ...current]);
      setSelectedId(result.contact.id);
      setName("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create contact.");
    } finally { setSaving(false); }
  }

  async function handleCopyCommand(command: string, option: "terminal" | "monitor") {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(option);
      window.setTimeout(() => setCopied(""), 1800);
    } catch { setError("Clipboard access is unavailable. Copy the command manually."); }
  }

  return <div className="workspace">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">VA</span><span><strong>Voice Audit</strong><small>Local workspace</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="navigation" aria-label="Main navigation">
        <a href="#/contacts" className={page === "contacts" ? "nav-link active" : "nav-link"} aria-current={page === "contacts" ? "page" : undefined}><span>Contacts</span><span className="nav-count">{contacts.length}</span></a>
        <a href="#/issues" className={page === "issues" ? "nav-link active" : "nav-link"} aria-current={page === "issues" ? "page" : undefined}><span>Issues</span><span className="nav-count">{issues.length}</span></a>
      </nav>
      <div className="sidebar-foot"><span className="live-dot" /> Local prototype <small>Auto-refresh every 5 seconds</small></div>
    </aside>

    <main className="main-panel">
      <header className="page-header">
        <div><div className="breadcrumb">WORKSPACE <span>/</span> {page.toUpperCase()}</div><h1>{page === "contacts" ? "Contacts" : "Issues"}</h1><p>{page === "contacts" ? "Create a contact and start a voice audit session." : "Review the issues captured from unresolved conversations."}</p></div>
        <div className="header-actions"><span className="sync-state"><span className="live-dot" /> {refreshing ? "Syncing" : "Live data"}</span><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Refresh</button></div>
      </header>

      <div className="page-content">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
        {page === "contacts" ? <>
          <section className="stats-grid" aria-label="Contact summary">
            <div className="stat-card"><span>Total contacts</span><strong>{contacts.length}</strong><small>All records</small></div>
            <div className="stat-card"><span>Resolved</span><strong>{resolvedCount}</strong><small>Query completed</small></div>
            <div className="stat-card"><span>Needs escalation</span><strong>{escalationCount}</strong><small>Issue recorded</small></div>
          </section>
          <div className="contacts-layout">
            <section className="surface" aria-labelledby="contact-list-title">
              <div className="surface-heading"><div><h2 id="contact-list-title">Contact directory</h2><p>Select a contact to prepare their voice session.</p></div><span className="count-tag">{contacts.length} CONTACTS</span></div>
              <form className="create-form" onSubmit={handleCreateContact}><label htmlFor="contact-name">NEW CONTACT</label><div className="form-line"><input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Enter contact name" disabled={saving} /><button className="button button-primary" type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "+ Add contact"}</button></div></form>
              <div className="list-header"><span>CONTACT</span><span>STATUS</span></div>
              {loading ? <div className="empty-state" role="status">Loading contacts…</div> : contacts.length === 0 ? <div className="empty-state"><strong>No contacts yet</strong><span>Add a contact above to get started.</span></div> : <div className="contact-list">{contacts.map((contact) => <button type="button" className={`contact-row${selectedId === contact.id ? " selected" : ""}`} key={contact.id} onClick={() => { setSelectedId(contact.id); setCopied(""); }} aria-pressed={selectedId === contact.id}><span className="contact-identity"><span className="avatar">{contact.name.slice(0, 1).toUpperCase()}</span><span><strong>{contact.name}</strong><small>Updated {formatDate(contact.updatedAt)}</small></span></span><span className={`status status--${contact.resolutionStatus}`}>{statusLabel(contact.resolutionStatus)}</span></button>)}</div>}
            </section>
            <section className="surface session-panel" aria-labelledby="session-title">
              <div className="surface-heading"><div><h2 id="session-title">Voice session</h2><p>Run locally, or open the browser console for monitoring.</p></div></div>
              {selectedContact ? <>
                <div className="selected-contact"><span>SELECTED CONTACT</span><strong>{selectedContact.name}</strong><small>ID: {selectedContact.id}</small></div>
                <div className="command-block"><div className="command-heading"><div><h3>Terminal voice</h3><p>Talk using your PowerShell microphone and speakers.</p></div><span>01</span></div><pre>{terminalCommand}</pre><button className="button button-secondary copy-button" type="button" onClick={() => void handleCopyCommand(terminalCommand, "terminal")}>{copied === "terminal" ? "Copied!" : "Copy command"}</button></div>
                <div className="command-block"><div className="command-heading"><div><h3>Browser monitoring</h3><p>Open the Agent console link printed in PowerShell. Keep the terminal open.</p></div><span>02</span></div><pre>{monitorCommand}</pre><button className="button button-secondary copy-button" type="button" onClick={() => void handleCopyCommand(monitorCommand, "monitor")}>{copied === "monitor" ? "Copied!" : "Copy command"}</button></div>
              </> : <div className="empty-state session-empty"><strong>No contact selected</strong><span>Choose a contact from the directory to see the commands.</span></div>}
            </section>
          </div>
        </> : <>
          <section className="issues-intro"><div><span className="section-kicker">ESCALATION QUEUE</span><h2>Recorded issues</h2><p>Every unresolved query appears here, linked to its contact.</p></div><span className="queue-count">{issues.length} total</span></section>
          <section className="surface issues-surface" aria-label="Recorded issues"><div className="issue-table-head"><span>CONTACT / ISSUE</span><span>RECORDED</span><span>STATUS</span></div>
            {loading ? <div className="empty-state" role="status">Loading issues…</div> : issues.length === 0 ? <div className="empty-state"><strong>No issues recorded</strong><span>When a caller says their query is unresolved, the issue will appear here.</span></div> : <div className="issue-list">{issues.map((issue) => <article className="issue-row" key={issue.id}><div className="issue-main"><strong>{contactNames.get(issue.contactId) ?? "Unknown contact"}</strong><p>{issue.description}</p><small>Contact ID: {issue.contactId}</small></div><time dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time><span className="status status--needs_escalation">Needs escalation</span></article>)}</div>}
          </section>
        </>}
      </div>
    </main>
  </div>;
}
