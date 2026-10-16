import { CustomerModel, TicketModel, type TicketRecord } from "@circuit/models";

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

export type TicketContext = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  ticket: TicketRecord;
};

export class TicketError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let connection: Promise<void> | undefined;

// Connects each local process once to Circuit's existing database.
export async function connectTicketDb() {
  if (!connection) {
    const uri = process.env.CIRCUIT_DB_URL;
    if (!uri)
      throw new Error(
        "CIRCUIT_DB_URL is required. Copy Circuit's DB_URL into this app's .env.",
      );
    connection = TicketModel.base
      .connect(uri)
      .then(() => undefined)
      .catch((error: unknown) => {
        connection = undefined;
        throw error;
      });
  }
  await connection;
}

function validId(id: string) {
  return /^[0-9a-f]{24}$/i.test(id);
}

function latestAudit(ticket: any) {
  return ticket.internal_information?.audit?.at(-1);
}

function auditView(record: any): Audit {
  return {
    status: record?.status === true,
    verdict: {
      status: typeof record?.verdict === "boolean" ? record.verdict : null,
      comment: record?.payload ?? "",
    },
    created_at: record?.created_at
      ? new Date(record.created_at).toISOString()
      : null,
  };
}

function eligible(ticket: any) {
  return (
    ticket.status === "close" &&
    ticket.internal_information?.solution?.out_of_scope === false &&
    latestAudit(ticket)?.status !== true
  );
}

// Lists closed, in-scope tickets and their linked customer details for the local dashboard.
export async function listAudits(
  page: number,
  limit: number,
  from?: Date,
  to?: Date,
) {
  await connectTicketDb();
  const query: Record<string, unknown> = {
    status: "close",
    "internal_information.solution.out_of_scope": false,
  };
  if (from || to)
    query["timestamps.closed_at"] = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };

  const [tickets, total, auditDocuments] = await Promise.all([
    TicketModel.aggregate([
      { $match: query },
      {
        $set: {
          latest_audit: { $arrayElemAt: ["$internal_information.audit", -1] },
        },
      },
      {
        $sort: {
          "latest_audit.status": 1,
          "timestamps.closed_at": -1,
          _id: -1,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: CustomerModel.collection.name,
          localField: "customer_id",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          ticket_number: 1,
          technical_information: 1,
          timestamps: 1,
          internal_information: 1,
          latest_audit: 1,
          customer: {
            name: "$customer.name",
            phone_number: "$customer.phone_number",
          },
        },
      },
    ]),
    TicketModel.countDocuments(query),
    TicketModel.find(query).select("internal_information.audit").lean(),
  ]);

  const rows: AuditRow[] = tickets.map((ticket: any) => ({
    id: ticket._id.toString(),
    ticket_number: ticket.ticket_number,
    customer_name: ticket.customer?.name ?? null,
    phone_number: ticket.customer?.phone_number ?? null,
    closed_at: ticket.timestamps?.closed_at
      ? new Date(ticket.timestamps.closed_at).toISOString()
      : null,
    issue: ticket.technical_information?.type_of_issue ?? null,
    solution: ticket.internal_information?.solution?.payload ?? null,
    audit: auditView(ticket.latest_audit),
  }));
  const completed = auditDocuments.filter(
    (ticket) => latestAudit(ticket)?.status === true,
  );
  const solved = completed.filter(
    (ticket) => latestAudit(ticket)?.verdict === true,
  ).length;

  return {
    tickets: rows,
    metrics: {
      pending_audits: total - completed.length,
      completed_audits: completed.length,
      problem_solved: solved,
      problem_unsolved: completed.length - solved,
    },
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// Reads a pending Ticket and its linked Customer details for the agent and call queue.
export async function getTicketContext(id: string): Promise<TicketContext> {
  if (!validId(id)) throw new TicketError("Invalid ticket ID.", 400);
  await connectTicketDb();
  const ticket = await TicketModel.findById(id).lean();
  if (!ticket) throw new TicketError("Ticket not found.", 404);
  if (!eligible(ticket))
    throw new TicketError("Ticket is not pending audit.", 409);
  const customer = (await CustomerModel.findById(ticket.customer_id)
    .select("name phone_number")
    .lean()) as { name?: string; phone_number?: string } | null;
  return {
    id: ticket._id.toString(),
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone_number ?? null,
    ticket,
  };
}

// Checks whether a new completed audit was appended during an outbound call.
export async function hasAuditAfter(id: string, previousCount: number) {
  await connectTicketDb();
  const ticket = await TicketModel.findById(id)
    .select("internal_information.audit")
    .lean();
  const audits = ticket?.internal_information?.audit ?? [];
  return (
    audits.length > previousCount && audits.at(-1)?.status === true
  );
}

// Atomically appends one audit; a failed audit reopens the ticket but keeps its assignee.
export async function completeAudit(
  id: string,
  verdict: boolean,
  payload: string,
) {
  if (!validId(id)) throw new TicketError("Invalid ticket ID.", 400);
  const comment = payload.trim();
  if (!comment) throw new TicketError("Audit comment is required.", 400);
  await connectTicketDb();

  const ticket = await TicketModel.findById(id).lean();
  if (!ticket) throw new TicketError("Ticket not found.", 404);
  if (!eligible(ticket))
    throw new TicketError("Ticket is not pending audit.", 409);

  const now = new Date();
  const count = ticket.internal_information?.audit?.length ?? 0;
  const update: Record<string, unknown> = {
    $push: {
      "internal_information.audit": {
        status: true,
        verdict,
        payload: comment,
        created_at: now,
      },
      ...(!verdict
        ? {
            "internal_information.comments": {
              payload: `Audit Failed for this solution: ${ticket.internal_information?.solution?.payload ?? ""}`,
              author: "system",
              created_at: now,
            },
          }
        : {}),
    },
    $set: {
      "timestamps.updated_at": now,
      ...(!verdict
        ? {
            status: "open",
            "internal_information.solution.out_of_scope": false,
            "internal_information.solution.payload": null,
            "internal_information.solution.author": null,
            "timestamps.ack_at": null,
            "timestamps.paused_at": null,
            "timestamps.resumed_at": null,
            "timestamps.closed_at": null,
          }
        : {}),
    },
  };
  const result = await TicketModel.updateOne(
    {
      _id: ticket._id,
      status: "close",
      "internal_information.solution.out_of_scope": false,
      $expr: {
        $and: [
          {
            $eq: [
              { $size: { $ifNull: ["$internal_information.audit", []] } },
              count,
            ],
          },
          {
            $ne: [
              { $arrayElemAt: ["$internal_information.audit.status", -1] },
              true,
            ],
          },
        ],
      },
    },
    update,
  );
  if (result.modifiedCount !== 1)
    throw new TicketError("Ticket was already audited or changed.", 409);

  return {
    id,
    status: verdict ? "close" : "open",
    assigned_to: ticket.assigned_to?.toString() ?? null,
    audit: auditView({
      status: true,
      verdict,
      payload: comment,
      created_at: now,
    }),
  };
}
