import { randomUUID } from "node:crypto";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { LiveKitAPI } from "livekit-server-sdk";
import { getTicketContext, hasAuditAfter, TicketError } from "./tickets.js";

export type CallQueue = {
  id: string;
  status: "running" | "completed" | "failed";
  ticketIds: string[];
  currentTicketId: string | null;
  completedTicketIds: string[];
  failedTicketId: string | null;
  error: string | null;
};

type TicketCallContext = Awaited<ReturnType<typeof getTicketContext>>;

const queues = new Map<string, CallQueue>();
let activeQueueId: string | null = null;
let queueStarting = false;

function apiHost(value: string) {
  return value.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

// Builds the authenticated LiveKit server client from backend-only credentials.
function createLiveKitApi() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !secret || !process.env.LIVEKIT_OUTBOUND_TRUNK_ID)
    throw new TicketError("LiveKit call settings are incomplete.", 503);
  return new LiveKitAPI({ host: apiHost(url), apiKey, secret });
}

// Accepts only the agreed ten-digit Indian mobile-number format.
function indianNumber(value: string | null) {
  if (!value || !/^\d{10}$/.test(value)) return null;
  return `+91${value}`;
}

// Pauses a poll loop between LiveKit state checks.
function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Checks whether the dispatched voice worker has joined the room.
function agentInRoom(participants: Awaited<ReturnType<LiveKitAPI["room"]["listParticipants"]>>) {
  return participants.some(
    (participant) => participant.kind === ParticipantInfo_Kind.AGENT,
  );
}

// Waits for the agent to join before dialing the customer.
async function waitForAgent(api: LiveKitAPI, roomName: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (agentInRoom(await api.room.listParticipants(roomName))) return;
    await wait(750);
  }
  throw new Error("The LiveKit agent did not join the call room.");
}

// Requires a new saved audit and a clean agent exit before a queue can advance.
async function waitForAuditAndEndCall(
  api: LiveKitAPI,
  roomName: string,
  participantIdentity: string,
  ticketId: string,
  initialAuditCount: number,
) {
  const deadline = Date.now() + 310_000;
  while (Date.now() < deadline) {
    const [saved, participants] = await Promise.all([
      hasAuditAfter(ticketId, initialAuditCount),
      api.room.listParticipants(roomName),
    ]);
    const callerPresent = participants.some(
      (participant) => participant.identity === participantIdentity,
    );
    const agentPresent = agentInRoom(participants);

    if (saved && !agentPresent) {
      if (callerPresent)
        await api.room.removeParticipant(roomName, participantIdentity);
      return;
    }
    if (!saved && (!callerPresent || !agentPresent))
      throw new Error("Call ended before the agent saved an audit.");
    await wait(1000);
  }
  throw new Error("Call timed out before the agent saved an audit.");
}

// Dispatches one ticket, calls its linked customer, then cleans up its room.
async function callTicket(
  api: LiveKitAPI,
  queue: CallQueue,
  ticket: TicketCallContext,
  position: number,
) {
  const phoneNumber = indianNumber(ticket.customerPhone);
  if (!phoneNumber)
    throw new Error("Customer needs a valid 10-digit Indian phone number.");

  const trunkId = process.env.LIVEKIT_OUTBOUND_TRUNK_ID!;
  const roomName = `audit-${queue.id}-${position + 1}`;
  const participantIdentity = `customer-${ticket.id}`;
  const initialAuditCount = ticket.ticket.internal_information?.audit?.length ?? 0;

  try {
    await api.room.createRoom({
      name: roomName,
      emptyTimeout: 60,
      departureTimeout: 10,
      maxParticipants: 2,
    });
    await api.agentDispatch.createDispatch(roomName, "voice-audit-agent", {
      metadata: JSON.stringify({ ticketId: ticket.id }),
    });
    await waitForAgent(api, roomName);
    await api.sip.createSipParticipant(
      trunkId,
      phoneNumber,
      roomName,
      {
        participantIdentity,
        ...(ticket.customerName
          ? { participantName: ticket.customerName }
          : {}),
        waitUntilAnswered: true,
        ringingTimeout: 30,
        maxCallDuration: 300,
      },
    );
    await waitForAuditAndEndCall(
      api,
      roomName,
      participantIdentity,
      ticket.id,
      initialAuditCount,
    );
  } finally {
    await api.room.deleteRoom(roomName).catch(() => undefined);
  }
}

// Starts one ordered queue and calls each pending ticket's linked Customer sequentially.
export async function startCallQueue(ticketIds: unknown): Promise<CallQueue> {
  if (
    !Array.isArray(ticketIds) ||
    ticketIds.length < 1 ||
    ticketIds.length > 10 ||
    ticketIds.some(
      (id) => typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id),
    )
  ) {
    throw new TicketError("Select 1 to 10 valid tickets.", 400);
  }
  if (new Set(ticketIds).size !== ticketIds.length)
    throw new TicketError("A ticket can only appear once in the queue.", 400);
  if (activeQueueId || queueStarting)
    throw new TicketError("A call queue is already running.", 409);

  queueStarting = true;
  let contexts: TicketCallContext[];
  let api: LiveKitAPI;
  try {
    contexts = await Promise.all(ticketIds.map((id) => getTicketContext(id)));
    api = createLiveKitApi();
  } catch (error) {
    queueStarting = false;
    throw error;
  }
  const queue: CallQueue = {
    id: randomUUID(),
    status: "running",
    ticketIds: contexts.map((ticket) => ticket.id),
    currentTicketId: contexts[0]!.id,
    completedTicketIds: [],
    failedTicketId: null,
    error: null,
  };
  queues.set(queue.id, queue);
  queueStarting = false;
  activeQueueId = queue.id;
  void runQueue(api, queue, contexts);
  return { ...queue, ticketIds: [...queue.ticketIds], completedTicketIds: [] };
}

// Runs the call queue in order and stops at the first failed call.
async function runQueue(
  api: LiveKitAPI,
  queue: CallQueue,
  contexts: TicketCallContext[],
) {
  try {
    for (const [position, ticket] of contexts.entries()) {
      queue.currentTicketId = ticket.id;
      queues.set(queue.id, queue);
      await callTicket(api, queue, ticket, position);
      queue.completedTicketIds.push(ticket.id);
      queue.currentTicketId = null;
    }
    queue.status = "completed";
  } catch (error) {
    queue.status = "failed";
    queue.failedTicketId = queue.currentTicketId;
    const agentMissing =
      error instanceof Error &&
      error.message === "The LiveKit agent did not join the call room.";
    queue.error =
      error instanceof Error &&
      error.message === "Customer needs a valid 10-digit Indian phone number."
        ? error.message
        : agentMissing
          ? "No voice-audit-agent joined the room. Start its production worker in this LiveKit project, then retry."
        : "The call failed or ended before an audit was saved. The queue stopped.";
    console.error(
      "Outbound call queue stopped.",
      queue.id,
      agentMissing ? "agent did not join" : "call or audit failed",
    );
  } finally {
    queue.currentTicketId = null;
    if (activeQueueId === queue.id) activeQueueId = null;
  }
}

// Returns a safe snapshot of a queue started by this API process.
export function getCallQueue(id: string) {
  const queue = queues.get(id);
  if (!queue) throw new TicketError("Call queue not found.", 404);
  return {
    ...queue,
    ticketIds: [...queue.ticketIds],
    completedTicketIds: [...queue.completedTicketIds],
  };
}
