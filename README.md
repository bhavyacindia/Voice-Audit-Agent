# Voice Audit

Voice Audit audits Circuit's existing closed Tickets using their linked Customers. The dashboard can now start a real, ordered LiveKit outbound-call queue for up to ten selected tickets. The Node API reads the linked Customer's name and phone number, requires exactly ten digits, prefixes `+91`, dispatches the existing LiveKit agent, and starts one SIP call at a time through the configured outbound trunk. The next call starts only after the current call saved its existing audit and ended.

No-answer, call/provider failure, missing or invalid customer phone, or call ending without a saved audit stops the queue. That ticket is not audited by the queue, there is no automatic retry, and later tickets are not called. Queue progress is in memory, so deploy the API as one persistent replica; a process restart loses its progress. The existing Ticket/Customer model package and audit writer are reused without schema changes.

## Configuration and local development

Install Node.js 22+, pnpm, and the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/). From this directory run `pnpm install`. The workspace links `@circuit/models` and `@circuit/utils` from sibling `../circuit/packages` directories; build those packages first if their `dist` outputs are missing.

Copy the needed values into this app's `.env` (never commit it):

- `CIRCUIT_DB_URL`: Circuit's private `DB_URL` value.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_OUTBOUND_TRUNK_ID`: server-side credentials and the already-configured LiveKit outbound trunk.
- Existing agent keys: `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_AI_MODEL`.
- For hosted API requests: `CLOUDFLARE_ACCESS_TEAM_DOMAIN` and `CLOUDFLARE_ACCESS_AUD` from the Cloudflare Access application. Configure the Access policy to allow the intended operators.
- If the hosted dashboard and API have different origins, set `VOICE_AUDIT_DASHBOARD_ORIGIN` to the exact dashboard origin and build the dashboard with `VITE_API_URL` set to the HTTPS API URL. For same-origin hosting, leave both blank and route `/api` to the Node API.

For local dashboard/API development, open two terminals in this directory and run:

```powershell
pnpm api
```

```powershell
pnpm dev:dashboard
```

Local API defaults to loopback and does not enable calls without LiveKit server credentials and the trunk ID. Hosted mode validates Cloudflare Access JWTs on all API routes. Keep all server credentials out of `VITE_*` settings.

The old `pnpm voice` terminal workflow remains a local prototype; it is not the outbound telephony path. Live calls are launched from the dashboard queue through the hosted API and LiveKit Cloud agent. A live end-to-end call still needs to be verified after deployment with an approved test number.

### Agent worker for outbound calls

The queue dispatches `voice-audit-agent` to the **production** deployment. Running `lk agent console` does not register a cloud worker. With LiveKit CLI 2.19+, plain `lk agent dev` registers under a temporary `dev-*` deployment and will not receive this queue's jobs. The command below loads this app's `.env` into the LiveKit CLI before it starts the Node agent; the agent's own dotenv import happens too late to configure the CLI. For a local worker connected to the cloud project, open another PowerShell terminal in this directory and keep it running:

```powershell
pnpm agent:dev:production
```

Wait for `Using production deployment` and `registered worker` with `agentName: "voice-audit-agent"` before pressing Start AI Call. This is a local worker for development: closing that terminal stops it. For a fully hosted system, deploy the same named worker to LiveKit Cloud's production deployment and configure its database and speech/LLM secrets there; the API and dashboard alone do not run the agent. The current repository uses sibling `../circuit/packages/models` and `../circuit/packages/utils`, so a LiveKit Cloud build needs a build context or package source that includes those packages. No hosted agent deployment is configured in this repository yet.

For outbound calls, the agent greets with the selected Ticket's name, close date, and issue when the caller first speaks, or after three seconds of silence following answer. The opening does not wait for the LLM. Later questions and audit decisions still use Cloudflare. Telephony background voice cancellation and a less sensitive VAD reduce false speech detection; this cannot guarantee separation of the caller from every nearby voice. The noise filter uses a LiveKit Cloud feature that may incur additional usage charges.

## Audit outcomes

- Solved: append the existing audit with `The query is resolved.` and keep the Ticket closed.
- Unsolved: append `The issue is not solved`, reopen the Ticket, clear its former solution/close timestamps, and preserve `assigned_to`.
- The existing agent prompts, LLM/STT/TTS setup, and guarded audit service remain the source of conversation and write behavior.

See [the approved implementation plan](plans/livekit-outbound-calling.md) for the contracts and failure behavior, and [the as-built handoff](docs/phase-3-post-implementation.md) for architecture and deployment boundaries. Do not run live calls until Access, LiveKit trunk/agent, database access, and human smoke checks are ready.
