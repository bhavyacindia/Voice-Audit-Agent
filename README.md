# Local Voice Audit Prototype

A small local dashboard and voice agent for checking whether a Contact's query was resolved. A clear confirmation marks it resolved; otherwise the agent asks for an issue description and saves it for manual escalation. The agent currently speaks English only.

## Requirements

- Node.js 22 or newer, pnpm, and the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/)
- MongoDB running locally or a MongoDB deployment that supports transactions
- LiveKit credentials for the Agents console runner and semantic turn detector
- Deepgram, Cartesia, and Cloudflare Workers AI API credentials

Copy the required values into `.env` from `.env.example`. Set `MONGODB_URI`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`. The default LLM is `@cf/zai-org/glm-4.7-flash`; data goes to `voice_audit_local` unless `VOICE_AUDIT_DB` is set. Speech recognition uses Deepgram Nova-3 English and speech output uses the private Cartesia voice directly through the Cartesia plugin. Optional `CARTESIA_SPEED` (0.6–1.5), `CARTESIA_EMOTION`, and `CARTESIA_VOLUME` (0.5–2) adjust delivery; defaults are neutral speed and volume with no forced emotion.

## Run locally

In separate terminals, start the API and dashboard:

```sh
pnpm install
pnpm api
pnpm dev:dashboard
```

Open the dashboard at the local Vite URL and create a Contact. Select it to see two copy-paste PowerShell options. Run either command from this project folder.

For microphone and speakers in your terminal only:

```powershell
$env:VOICE_AUDIT_CONTACT_ID = "replace-with-contact-id"
pnpm voice
```

For browser audio and LiveKit Cloud session monitoring while the agent still runs on your computer:

```powershell
$env:VOICE_AUDIT_CONTACT_ID = "replace-with-contact-id"
node scripts/voice-monitor.mjs
```

The monitor command loads LiveKit credentials from `.env` for the CLI. Keep PowerShell open, click the **Agent console** URL it prints, then start a browser session. This connected mode creates a LiveKit room and makes session metrics visible; the terminal-only mode does not. Once a resolution or issue is saved, the agent thanks the caller and closes the voice session. The local API binds to `127.0.0.1`; the dashboard refreshes Contact statuses and Issues every few seconds. There are no phone calls, trunks, or external escalation actions.
