import { createRemoteJWKSet, jwtVerify } from "jose";
import type { IncomingMessage } from "node:http";

export class AccessError extends Error {
  status = 403;

  constructor(message: string) {
    super(message);
  }
}

let keySet: ReturnType<typeof createRemoteJWKSet> | undefined;

function accessSettings() {
  const domain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.replace(
    /^https?:\/\//,
    "",
  ).replace(/\/$/, "");
  const audience = process.env.CLOUDFLARE_ACCESS_AUD;
  if (!domain || !audience)
    throw new Error("Cloudflare Access domain and audience are required.");
  return { domain, audience, issuer: `https://${domain}` };
}

// Checks that hosted API requests carry a valid Cloudflare Access identity.
export async function verifyAccess(request: IncomingMessage) {
  const { audience, issuer } = accessSettings();
  const assertion = request.headers["cf-access-jwt-assertion"];
  const token = Array.isArray(assertion) ? assertion[0] : assertion;
  if (!token) throw new AccessError("Sign in through Cloudflare Access.");

  try {
    keySet ??= createRemoteJWKSet(
      new URL(`${issuer}/cdn-cgi/access/certs`),
    );
    await jwtVerify(token, keySet, { issuer, audience });
  } catch {
    throw new AccessError("Cloudflare Access verification failed.");
  }

}

// Prevents a hosted API from starting without its Access verification settings.
export function validateAccessSettings() {
  if (process.env.NODE_ENV === "production" || process.env.HOST === "0.0.0.0")
    accessSettings();
}
