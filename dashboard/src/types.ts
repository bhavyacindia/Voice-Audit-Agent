export type Audit = {
  status: boolean;
  verdict: { status: boolean | null; comment: string };
  created_at: string | null;
};
export type AuditRow = {
  id: string;
  ticket_number: string;
  customer_name: string | null;
  phone_number: string | null;
  closed_at: string | null;
  issue: string | null;
  solution: string | null;
  audit: Audit;
};
export type AuditList = {
  tickets: AuditRow[];
  metrics: {
    pending_audits: number;
    completed_audits: number;
    problem_solved: number;
    problem_unsolved: number;
  };
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type CallQueue = {
  id: string;
  status: "running" | "completed" | "failed";
  ticketIds: string[];
  currentTicketId: string | null;
  completedTicketIds: string[];
  failedTicketId: string | null;
  error: string | null;
};
