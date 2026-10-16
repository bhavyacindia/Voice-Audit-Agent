# Local AI Call Audits — Phase 1

This app reads Circuit's existing Tickets and linked Customers and displays a Circuit-style Call Audits dashboard. Select up to ten pending tickets in call order. The dashboard's **Start AI Call** button currently shows the queued tickets and the cloud setup status; it does not start a call yet. LiveKit Cloud worker and outbound provider integration are still required before the app can place real calls. The Phase 1 local voice agent remains in the repository as a legacy prototype; it is not launched by the dashboard.

See [the approved plan](plans/ticket-based-local-ai-audits.md) and [the as-built handoff](docs/phase-3-post-implementation.md) for the full data flow and limitations. The older [prototype plan](plans/local-voice-audit.md) is historical.

## Setup

Install Node.js 22+, pnpm, and the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/). Run `pnpm install` from this folder. The app links `@circuit/models` from `../circuit/packages/models`; build that package if its `dist` files are missing.

In this app's `.env`, set `CIRCUIT_DB_URL` to the same private value as `DB_URL` in Circuit's `.env`. Keep the existing LiveKit, Deepgram, Cartesia, and Cloudflare credentials. The local API does **not** use the old `MONGODB_URI` or `VOICE_AUDIT_DB`. Never commit either `.env`. Required keys are listed in [.env.example](.env.example). Optional `CARTESIA_SPEED`, `CARTESIA_EMOTION`, and `CARTESIA_VOLUME` adjust the voice.

In one PowerShell terminal inside this folder, run:

```powershell
pnpm api
```

Keep the API terminal open. In a second terminal, run:

```powershell
pnpm dev:dashboard
```

Open the Vite URL printed by pnpm to use the dashboard. The **Start AI Call** button shows the selected queue and clearly reports that cloud calling is not connected yet. The audit list and manual audit action continue to use the local API.

The legacy Phase 1 voice agent can still be run manually from another PowerShell terminal, but the dashboard no longer generates its command. Set the selected ticket IDs yourself if you need to exercise that prototype:

```powershell
$env:VOICE_AUDIT_TICKET_IDS = '["ticket-id-1","ticket-id-2"]'
pnpm voice
```

The single console session processes the selected tickets in order. Say "Hello, who is this?" to start each ticket's conversation, then answer as that customer. `lk` must be available in this terminal's `PATH`, and it needs access to your microphone and speakers. Press Ctrl+C to stop. This manual path is retained only for the Phase 1 prototype; the Phase 2 target is cloud-based calling.

If the dashboard has no eligible tickets, preview six synthetic, closed demo Tickets and linked Customers with `pnpm seed:demo`. The preview prints the database name. To insert them, run `pnpm seed:demo --write <printed-database-name>` (for example, `pnpm seed:demo --write test`). These use clearly fake `000000000x` phone numbers, are never dialed, and rerunning the command leaves existing demo records—including completed audits—unchanged. Refresh the dashboard after seeding.

You can set `VOICE_AUDIT_TICKET_IDS` yourself to a JSON array of pending Ticket IDs and run `pnpm voice` to use the legacy prototype.

## Audit behavior

- Solved: append a completed audit with comment `The query is resolved.`; keep the ticket closed.
- Unsolved: append a completed audit with comment `The issue is not solved`; reopen the ticket and clear its old solution/close timestamps. Keep `assigned_to` unchanged. The agent apologizes and says the query is marked unresolved for the technical team; it does not claim a technician was newly assigned.
- The manual **Complete audit** dialog calls the same guarded local write service as the agent.

The API binds to `127.0.0.1` with no account middleware. Its mutation header is not authentication; do not expose this local service publicly. The microphone flow must be tested by a human before relying on it. Outbound SIP/Vobiz calling and browser microphone sessions are later-phase work.
