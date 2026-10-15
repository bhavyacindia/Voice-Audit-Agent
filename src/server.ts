import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createContact, listContacts, listIssues } from "./db.js";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 3000);

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 10_000) throw new RangeError("Request body is too large.");
  }
  return JSON.parse(body) as unknown;
}

/*
  purpose: Create a Contact for a local voice session.
  req: { name }
  res: { contact } or { error }
*/
async function handleCreateContact(request: IncomingMessage, response: ServerResponse) {
  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    respond(response, 400, { error: "Send a valid JSON body." });
    return;
  }

  const name = typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
    ? body.name.trim()
    : "";
  if (name.length < 1 || name.length > 80) {
    respond(response, 400, { error: "Name must be between 1 and 80 characters." });
    return;
  }

  try {
    respond(response, 201, { contact: await createContact(name) });
  } catch {
    console.error("Contact creation failed.");
    respond(response, 500, { error: "Unable to create Contact." });
  }
}

/*
  purpose: List Contacts for the dashboard.
  req: none
  res: { contacts } or { error }
*/
async function handleListContacts(response: ServerResponse) {
  try {
    respond(response, 200, { contacts: await listContacts() });
  } catch {
    console.error("Contact listing failed.");
    respond(response, 500, { error: "Unable to list Contacts." });
  }
}

/*
  purpose: List saved Issues for the dashboard.
  req: none
  res: { issues } or { error }
*/
async function handleListIssues(response: ServerResponse) {
  try {
    respond(response, 200, { issues: await listIssues() });
  } catch {
    console.error("Issue listing failed.");
    respond(response, 500, { error: "Unable to list Issues." });
  }
}

const server = createServer((request, response) => {
  const path = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  if (request.method === "POST" && path === "/api/contacts") {
    void handleCreateContact(request, response);
  } else if (request.method === "GET" && path === "/api/contacts") {
    void handleListContacts(response);
  } else if (request.method === "GET" && path === "/api/issues") {
    void handleListIssues(response);
  } else {
    respond(response, 404, { error: "Not found" });
  }
});

server.listen(port, host, () => {
  console.log(`Local API listening at http://${host}:${port}`);
});
