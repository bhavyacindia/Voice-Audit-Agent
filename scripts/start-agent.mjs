import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
config({ path: envFile });

const required = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Set ${missing.join(", ")} in .env before starting the agent.`);
  process.exit(1);
}

const command = process.platform === "win32" ? "lk.exe" : "lk";
const child = spawn(
  command,
  ["agent", "dev", "--deployment", "production", "src/agent.ts", "--", "--import", "tsx"],
  { cwd: projectDir, env: process.env, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Could not start LiveKit CLI: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
