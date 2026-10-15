import "dotenv/config";
import { spawnSync } from "node:child_process";

if (!process.env.VOICE_AUDIT_CONTACT_ID) {
  console.error("Set VOICE_AUDIT_CONTACT_ID to a Contact ID from the dashboard.");
  process.exit(1);
}

const result = spawnSync("lk", ["agent", "dev", "src/agent.ts", "--", "--import", "tsx"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) console.error("Could not start the LiveKit CLI:", result.error.message);
process.exit(result.status ?? 1);
