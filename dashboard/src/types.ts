export type ResolutionStatus = "pending" | "resolved" | "needs_escalation";

export type Contact = {
  id: string;
  name: string;
  resolutionStatus: ResolutionStatus;
  createdAt: string;
  updatedAt: string;
};

export type Issue = {
  id: string;
  contactId: string;
  description: string;
  createdAt: string;
};
