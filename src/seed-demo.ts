import "dotenv/config";
import { CustomerModel, TicketModel } from "@circuit/models";
import { connectTicketDb } from "./tickets.js";

const examples = [
  {
    name: "Demo Ram Singh",
    phone: "0000000001",
    issue: "RD terminated after a Windows update",
    solution:
      "Guided the customer to update Windows 26H2 and restart the RD service.",
  },
  {
    name: "Demo Priya Sharma",
    phone: "0000000002",
    issue: "Display flickering",
    solution: "Updated the graphics driver and checked the display cable.",
  },
  {
    name: "Demo Arjun Mehta",
    phone: "0000000003",
    issue: "vSpace login failed",
    solution: "Reset the account password and confirmed sign-in.",
  },
  {
    name: "Demo Asha Patel",
    phone: "0000000004",
    issue: "Printer not detected",
    solution: "Reconnected the printer and reinstalled its driver.",
  },
  {
    name: "Demo Neha Rao",
    phone: "0000000005",
    issue: "Network disconnecting",
    solution: "Adjusted Wi-Fi settings and verified a stable connection.",
  },
  {
    name: "Demo Raju Verma",
    phone: "0000000006",
    issue: "Audio device missing",
    solution:
      "Selected the correct output device and installed the audio driver.",
  },
];

// Creates only missing, clearly marked demo customers and pending closed tickets.
async function seed() {
  await connectTicketDb();
  const database = TicketModel.db.name;
  const write = process.argv[2] === "--write";
  const confirmedDatabase = process.argv[3];

  console.log(`Database: ${database}`);
  console.log(
    `Demo tickets: ${examples.map((_, index) => `DEMO-AUDIT-${index + 1}`).join(", ")}`,
  );
  if (!write) {
    console.log(
      `Preview only. To insert these records: pnpm seed:demo --write ${database}`,
    );
    return;
  }
  if (confirmedDatabase !== database) {
    throw new Error(
      `Database confirmation must match "${database}". No records were written.`,
    );
  }

  let customersCreated = 0;
  let ticketsCreated = 0;
  for (const [index, example] of examples.entries()) {
    const suffix = (index + 1).toString(16).padStart(20, "0");
    const customerId = `d3e0${suffix}`;
    const ticketId = `d3e1${suffix}`;
    const closedAt = new Date(Date.now() - (index + 1) * 60 * 60 * 1000);
    const createdAt = new Date(closedAt.getTime() - 24 * 60 * 60 * 1000);

    const customer = await CustomerModel.updateOne(
      { _id: customerId },
      {
        $setOnInsert: {
          _id: customerId,
          name: example.name,
          phone_number: example.phone,
        },
      },
      { upsert: true },
    );
    customersCreated += customer.upsertedCount;

    const ticket = await TicketModel.updateOne(
      { _id: ticketId },
      {
        $setOnInsert: {
          _id: ticketId,
          ticket_number: `DEMO-AUDIT-${index + 1}`,
          customer_id: customerId,
          status: "close",
          type: "tse",
          priority: "medium",
          technical_information: { type_of_issue: example.issue },
          internal_information: {
            source: "tse",
            solution: { out_of_scope: false, payload: example.solution },
            audit: [
              { status: false, verdict: null, payload: null, created_at: null },
            ],
            comments: [],
          },
          timestamps: {
            created_at: createdAt,
            updated_at: closedAt,
            closed_at: closedAt,
          },
        },
      },
      { upsert: true },
    );
    ticketsCreated += ticket.upsertedCount;
  }
  console.log(
    `Created ${customersCreated} Customers and ${ticketsCreated} Tickets. Existing demo records were not changed.`,
  );
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
} finally {
  await TicketModel.base.disconnect();
}
