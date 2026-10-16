import "dotenv/config";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { globalErrorHandler } from "@circuit/utils";
import { AccessError, validateAccessSettings, verifyAccess } from "./access.js";
import { getCallQueue, startCallQueue } from "./calls.js";
import {
  completeAudit,
  connectTicketDb,
  listAudits,
  TicketError,
} from "./tickets.js";

const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const hosted = process.env.NODE_ENV === "production" || host === "0.0.0.0";
const port = Number(process.env.PORT || 3000);

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function allowDashboardOrigin(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  const allowedOrigin = process.env.VOICE_AUDIT_DASHBOARD_ORIGIN;
  if (origin && allowedOrigin && origin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, PATCH, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type, X-Voice-Audit-Local");
    response.setHeader("Vary", "Origin");
  }
  return !origin || !allowedOrigin || origin === allowedOrigin;
}

async function readBody(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 10_000)
      throw new TicketError("Request body is too large.", 400);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new TicketError("Send a valid JSON body.", 400);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TicketError("Send a JSON object.", 400);
  return value as Record<string, unknown>;
}

function positiveInteger(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new TicketError("Page and limit must be positive integers.", 400);
  return number;
}

function date(value: string | null) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))
    throw new TicketError("Date filters must use ISO format.", 400);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new TicketError("Invalid date filter.", 400);
  return parsed;
}

function checkMutation(request: IncomingMessage) {
  if (request.headers["x-voice-audit-local"] !== "1")
    throw new TicketError("Local mutation header is required.", 403);
  if (
    request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new TicketError("Content-Type must be application/json.", 415);
  }
}

function checkJson(request: IncomingMessage) {
  if (
    request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new TicketError("Content-Type must be application/json.", 415);
  }
}

/*
  purpose: List closed Circuit ticket audits with linked customer details.
  req: page, limit, optional from/to query parameters.
  res: tickets, metrics, and pagination or an error.
*/
async function handleAudits(url: URL) {
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const limit = positiveInteger(url.searchParams.get("limit"), 10);
  if (limit > 100) throw new TicketError("Limit must be 100 or less.", 400);
  const from = date(url.searchParams.get("from"));
  const to = date(url.searchParams.get("to"));
  if (from && to && from > to)
    throw new TicketError("From must be before to.", 400);
  return { status: 200, body: await listAudits(page, limit, from, to) };
}

/*
  purpose: Complete one pending ticket audit using the agent's guarded write service.
  req: ticket ID and JSON { verdict, payload }.
  res: saved ticket audit summary or an error.
*/
async function handleCompleteAudit(request: IncomingMessage, id: string) {
  const body = object(await readBody(request));
  if (
    typeof body.verdict !== "boolean" ||
    typeof body.payload !== "string" ||
    body.payload.trim().length > 1000
  ) {
    throw new TicketError(
      "Verdict must be boolean and comment must be at most 1,000 characters.",
      400,
    );
  }
  return {
    status: 200,
    body: { ticket: await completeAudit(id, body.verdict, body.payload) },
  };
}

/*
  purpose: Start an ordered outbound queue for pending tickets.
  req: JSON { ticketIds } in the operator's selected order.
  res: 202 with the in-memory call queue or a safe validation error.
*/
async function handleStartCalls(request: IncomingMessage) {
  checkJson(request);
  const body = object(await readBody(request));
  return {
    status: 202,
    body: { queue: await startCallQueue(body.ticketIds) },
  };
}

/*
  purpose: Return progress for a call queue started by this API process.
  req: Queue ID in the URL.
  res: Current queue status or a not-found error.
*/
async function handleCallQueue(id: string) {
  return { status: 200, body: { queue: getCallQueue(id) } };
}

function logUnexpectedError(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
  error: unknown,
) {
  globalErrorHandler(
    {
      method: request.method || "GET",
      originalUrl: request.url || "/",
      baseUrl: "",
      path: url.pathname,
      params: {},
      query: Object.fromEntries(url.searchParams.entries()),
      body: {},
    },
    response,
    error,
  );
}

/*
  purpose: Dispatch protected ticket-audit and outbound-call API requests.
  req: Query filters or JSON; hosted requests must pass Cloudflare Access.
  res: Route-specific JSON result or a safe error response.
*/
const server = createServer((request, response) => {
  void (async () => {
    let url = new URL("/", `http://${host}:${port}`);
    try {
      url = new URL(request.url || "/", `http://${host}:${port}`);
      if (!allowDashboardOrigin(request, response))
        throw new TicketError("Dashboard origin is not allowed.", 403);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
      if (hosted) await verifyAccess(request);

      const path = url.pathname;
      let result: { status: number; body: unknown };
      if (request.method === "GET" && path === "/api/audits")
        result = await handleAudits(url);
      else if (
        request.method === "PATCH" &&
        /^\/api\/tickets\/[^/]+\/audit$/.test(path)
      ) {
        checkMutation(request);
        result = await handleCompleteAudit(request, path.split("/")[3]!);
      } else if (request.method === "POST" && path === "/api/calls") {
        result = await handleStartCalls(request);
      } else if (
        request.method === "GET" &&
        /^\/api\/calls\/[^/]+$/.test(path)
      ) {
        result = await handleCallQueue(path.split("/")[3]!);
      } else result = { status: 404, body: { error: "Not found" } };
      respond(response, result.status, result.body);
    } catch (error) {
      const status =
        error instanceof TicketError
          ? error.status
          : error instanceof AccessError
            ? error.status
            : 500;
      if (status === 500) logUnexpectedError(request, url, response, error);
      respond(response, status, {
        error:
          error instanceof TicketError || error instanceof AccessError
            ? error.message
            : "Voice audit request failed.",
      });
    }
  })();
});

try {
  validateAccessSettings();
} catch {
  console.error("Cloudflare Access settings are required in production.");
  process.exitCode = 1;
}

if (process.exitCode !== 1) void connectTicketDb()
  .then(() =>
    server.listen(port, host, () =>
      console.log(`Voice audit API listening on ${host}:${port}`),
    ),
  )
  .catch(() => {
    console.error(
      "Could not connect to Circuit DB. Set CIRCUIT_DB_URL to Circuit's DB_URL in this app's .env.",
    );
    process.exitCode = 1;
  });
