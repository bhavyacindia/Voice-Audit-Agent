import { useEffect, useState } from "react";
import { completeAudit, listAudits } from "./api";
import type { AuditList, AuditRow } from "./types";
const blankList: AuditList = {
  tickets: [],
  metrics: {
    pending_audits: 0,
    completed_audits: 0,
    problem_solved: 0,
    problem_unsolved: 0,
  },
  total: 0,
  page: 1,
  limit: 10,
  pages: 0,
};

function dateText(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
}

function status(row: AuditRow) {
  if (!row.audit.status) return "Pending";
  return row.audit.verdict.status ? "Solved" : "Unsolved";
}

export function App() {
  const [data, setData] = useState<AuditList>(blankList);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [auditTarget, setAuditTarget] = useState<AuditRow | null>(null);
  const [verdict, setVerdict] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [cloudCallNotice, setCloudCallNotice] = useState(false);

  async function refresh() {
    const audits = await listAudits(page, from, to);
    setData(audits);
    setSelection((ids) =>
      ids.filter(
        (id) =>
          !audits.tickets.some(
            (ticket) => ticket.id === id && ticket.audit.status,
          ),
      ),
    );
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const audits = await listAudits(page, from, to);
        if (!active) return;
        setData(audits);
        setSelection((ids) =>
          ids.filter(
            (id) =>
              !audits.tickets.some(
                (ticket) => ticket.id === id && ticket.audit.status,
              ),
          ),
        );
        setError("");
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load audits.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [page, from, to]);

  function select(id: string) {
    setSelection((ids) =>
      ids.includes(id)
        ? ids.filter((item) => item !== id)
        : ids.length < 10
          ? [...ids, id]
          : ids,
    );
  }

  function startCloudCall() {
    if (!selection.length) return;
    setCloudCallNotice(true);
  }

  function openAudit(row: AuditRow) {
    setAuditTarget(row);
    setVerdict(false);
    setComment("The issue is not solved");
  }

  async function submitAudit(event: React.FormEvent) {
    event.preventDefault();
    if (!auditTarget) return;
    setWorking(true);
    setError("");
    try {
      await completeAudit(auditTarget.id, verdict, comment);
      setAuditTarget(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not complete audit.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          Circuit <small>AI AUDIT</small>
        </div>
        <nav aria-label="Main navigation">
          <div className="nav-parent">▥ &nbsp; Analytics</div>
          <div className="nav-active">◩ &nbsp; Call Audits</div>
        </nav>
      </aside>
      <main className="main">
        <header className="page-head">
          <div className="head-icon">◧</div>
          <div>
            <h1>Call audits</h1>
            <p>Review closed tickets and record the audit verdict.</p>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          <section className="filter-panel">
            <label>
              Date range
              <div className="date-inputs">
                <input
                  aria-label="From date"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
                <span>to</span>
                <input
                  aria-label="To date"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </label>
          </section>
          <section className="metrics" aria-label="Audit metrics">
            {(
              [
                ["Pending audits", data.metrics.pending_audits],
                ["Completed audits", data.metrics.completed_audits],
                ["Problem solved", data.metrics.problem_solved],
                ["Problem unsolved", data.metrics.problem_unsolved],
              ] as const
            ).map(([label, count]) => (
              <div className="metric" key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </section>
          <section className="queue-panel" aria-label="AI call queue">
            <div>
              <h2>AI call queue</h2>
              <p>
                Select up to 10 pending tickets in call order. Calls will use
                LiveKit Cloud after outbound calling is configured.
              </p>
            </div>
            <div className="queue-actions">
              <span className="queue-badge">{selection.length} selected</span>
              <button
                className="primary"
                disabled={!selection.length}
                onClick={startCloudCall}
              >
                Start AI Call
              </button>
            </div>
            {selection.length > 0 && (
              <div className="queue-progress">
                Selected order:{" "}
                {selection
                  .map(
                    (id, position) =>
                      `${position + 1}. ${data.tickets.find((row) => row.id === id)?.ticket_number ?? id}`,
                  )
                  .join(" → ")}
              </div>
            )}
          </section>
          <section className="table-panel" aria-label="Call audits">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Phone Number</th>
                    <th>Customer Name</th>
                    <th>Closed At</th>
                    <th>Type Of Issue</th>
                    <th>Audit Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="table-message">
                        Loading audits…
                      </td>
                    </tr>
                  ) : data.tickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="table-message">
                        No closed tickets match this date range.
                      </td>
                    </tr>
                  ) : (
                    data.tickets.map((row) => (
                      <tr
                        key={row.id}
                        className="ticket-row"
                        onClick={() => setDetail(row)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            setDetail(row);
                          }
                        }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.ticket_number}`}
                            checked={selection.includes(row.id)}
                            disabled={
                              row.audit.status ||
                              (selection.length >= 10 &&
                                !selection.includes(row.id))
                            }
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => select(row.id)}
                          />
                        </td>
                        <td>{row.phone_number || "—"}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetail(row);
                            }}
                          >
                            {row.customer_name || row.ticket_number}
                          </button>
                          <small>{row.ticket_number}</small>
                        </td>
                        <td>{dateText(row.closed_at)}</td>
                        <td>{row.issue || "—"}</td>
                        <td>
                          <span
                            className={`status ${status(row).toLowerCase()}`}
                          >
                            {status(row)}
                          </span>
                        </td>
                        <td>
                          <button
                            disabled={row.audit.status}
                            onClick={(event) => {
                              event.stopPropagation();
                              openAudit(row);
                            }}
                          >
                            Complete audit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Showing {data.tickets.length} of {data.total} audits
              </span>
              <div>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(data.pages, 1)}
                </span>
                <button
                  disabled={page >= data.pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      {cloudCallNotice && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={() => setCloudCallNotice(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="LiveKit Cloud calling status"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setCloudCallNotice(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>LiveKit Cloud calls</h2>
            <p className="muted">
              {selection.length} ticket{selection.length === 1 ? " is" : "s are"} queued
              in order. Cloud call launch is not connected yet; it needs the
              LiveKit Cloud worker and outbound provider configuration.
            </p>
            <ol className="queued-ticket-list">
              {selection.map((id) => {
                return <li key={id}>{id}</li>;
              })}
            </ol>
            <div className="modal-actions">
              <button onClick={() => setCloudCallNotice(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
      {detail && (
        <div
          className="overlay drawer-overlay"
          role="presentation"
          onMouseDown={() => setDetail(null)}
        >
          <section
            className="ticket-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Ticket details"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setDetail(null)}
              aria-label="Close"
            >
              ×
            </button>
            <header className="drawer-header">
              <div>
                <p className="drawer-eyebrow">Ticket details</p>
                <h2>{detail.ticket_number}</h2>
                <p className="muted">
                  {detail.customer_name || "Customer unavailable"}
                </p>
              </div>
            </header>
            <div className="drawer-body">
              <section className="drawer-section">
                <h3>Customer</h3>
                <dl className="drawer-fields">
                  <dt>Customer name</dt>
                  <dd>{detail.customer_name || "—"}</dd>
                  <dt>Phone number</dt>
                  <dd>{detail.phone_number || "—"}</dd>
                </dl>
              </section>
              <section className="drawer-section">
                <h3>Ticket information</h3>
                <dl className="drawer-fields">
                  <dt>Closed at</dt>
                  <dd>{dateText(detail.closed_at)}</dd>
                  <dt>Type of issue</dt>
                  <dd>{detail.issue || "—"}</dd>
                </dl>
              </section>
              <section className="drawer-section">
                <p className="drawer-eyebrow">Resolution Notes</p>
                <h3>Solution</h3>
                <p className="drawer-solution">{detail.solution || "—"}</p>
              </section>
              <section className="drawer-section">
                <h3>Audit</h3>
                <p>
                  <span className={`status ${status(detail).toLowerCase()}`}>
                    {status(detail)}
                  </span>
                </p>
                {detail.audit.verdict.comment && (
                  <p className="drawer-solution">{detail.audit.verdict.comment}</p>
                )}
              </section>
            </div>
            <div className="drawer-footer">
              <button onClick={() => setDetail(null)}>Close</button>
              {!detail.audit.status && (
                <button
                  className="primary"
                  onClick={() => {
                    setDetail(null);
                    openAudit(detail);
                  }}
                >
                  Complete audit
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {auditTarget && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={() => setAuditTarget(null)}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Complete audit"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => void submitAudit(e)}
          >
            <button
              className="close"
              type="button"
              onClick={() => setAuditTarget(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Complete audit</h2>
            <p className="muted">
              {auditTarget.ticket_number} ·{" "}
              {auditTarget.customer_name || "Customer unavailable"}
            </p>
            <label>
              Problem solved
              <select
                value={verdict ? "yes" : "no"}
                onChange={(e) => {
                  const solved = e.target.value === "yes";
                  setVerdict(solved);
                  setComment(
                    solved
                      ? "The query is resolved."
                      : "The issue is not solved",
                  );
                }}
              >
                <option value="no">Unsolved</option>
                <option value="yes">Solved</option>
              </select>
            </label>
            <label>
              Comment
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                required
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setAuditTarget(null)}>
                Cancel
              </button>
              <button
                className="primary"
                type="submit"
                disabled={working || !comment.trim()}
              >
                Complete audit
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
