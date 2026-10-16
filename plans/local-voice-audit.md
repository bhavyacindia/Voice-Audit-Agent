# Local Voice Audit — as-built plan

> Status: implemented prototype. This replaces the original pre-implementation plan with the system actually in the repository. See [Phase 3 post-implementation](../docs/phase-3-post-implementation.md) for the full technical handoff.

## Goal

Create and select a Contact in a local dashboard, speak to a locally running LiveKit Node.js agent, and save either `resolved` or `needs_escalation` with a linked Issue. After a successful save, the agent says thank you and closes its voice session. No phone calls, SIP trunks, external escalation, authentication, or hosted dashboard are implemented.

## Delivered phases

| Phase | Outcome | Files |
|---|---|---|
| 1 — Data and local API | Contact/Issue collections, loopback JSON API, atomic unresolved write | `src/db.ts`, `src/server.ts` |
| 2 — Voice agent | Deepgram STT, LiveKit/Silero turns, Cloudflare tool-calling, Cartesia TTS, English/Hindi reply choice | `src/agent.ts`, `src/cloudflare.ts`, `src/language.ts` |
| 3 — Dashboard and handoff | Contacts/Issues views, polling, PowerShell copy commands, optional browser monitor | `dashboard/src/`, `scripts/voice-monitor.mjs`, `README.md` |

These phase labels describe delivered code, not a claimed human speech-test result.

## As-built data and API contracts

MongoDB defaults to `voice_audit_local`. Contact: `id`, `name`, `resolutionStatus`, `createdAt`, `updatedAt`. Issue: `id`, `contactId`, `description`, `createdAt`. `issues.contactId` is indexed. The Contact status is the latest saved outcome; multiple Issues can exist across sessions. No delete endpoint exists.

| Method | Path | Request | Success | Failure |
|---|---|---|---|---|
| `POST` | `/api/contacts` | `{ "name": string }` | `201 { "contact": Contact }` | `400` invalid input; `500` storage error |
| `GET` | `/api/contacts` | none | `200 { "contacts": Contact[] }` | `500` storage error |
| `GET` | `/api/issues` | none | `200 { "issues": Issue[] }` | `500` storage error |

Other paths return `404 { "error": "Not found" }`. There is no session-start route. The selected Contact ID is supplied to the agent through `VOICE_AUDIT_CONTACT_ID` in PowerShell. Vite proxies `/api` to the loopback API and the dashboard polls every five seconds.

## As-built voice flow

1. The agent checks the selected Contact and Cartesia configuration, then asks whether the query is resolved.
2. Deepgram Nova-3 `multi` supplies a transcript. `src/language.ts` chooses only `en` or `hi` for the spoken reply.
3. Cloudflare GLM-4.7-Flash (or `CLOUDFLARE_AI_MODEL`) receives the transcript, conversation history, stage, and available tools. It can converse briefly or choose a tool.
4. The application guards tool use: `markResolved` writes `resolved`; `askForIssue` moves to the description step; `recordIssue` stores the raw final transcript and writes `needs_escalation` in one MongoDB transaction.
5. After a successful database write, Cartesia Sonic-3 speaks the thank-you and the session shuts down after playout.

An LLM tool call is a request, **not** the database write itself. Empty transcripts, wrong-stage calls, and ordinary replies do not save a result. Multiple concurrent sessions for one Contact are not prevented by a database-level lock or idempotency key.

## Explicit exclusions and remaining work

- Sarvam STT and 11-language auto-detection/same-language reply routing are **not implemented**. Current language logic is English/Hindi/Hinglish only; Deepgram `multi` does not imply all Indian languages.
- Cartesia voice/locale routing for each Indian language, a fallback TTS provider, and native accent verification are not implemented.
- LiveKit Cloud deployment, browser-only hosting, outbound calls, recording/transcript history, analytics, access control, and external escalation are not implemented.
- MongoDB must support transactions. `pnpm voice` requires `lk` on `PATH`; the browser-monitor option still runs the agent locally.

## Human smoke path

Create separate Contacts and test a clear yes, a no plus issue description, and an ambiguous answer. Confirm `resolved` without an Issue for yes; exactly one linked Issue plus `needs_escalation` for no; and no write for ambiguity. Confirm the final thank-you and shutdown. If monitoring matters, test the optional LiveKit Cloud room mode separately. These checks are instructions, not claimed results.
