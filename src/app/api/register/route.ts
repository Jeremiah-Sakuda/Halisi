import { randomUUID } from "node:crypto";

import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { getSimulatedIssuer } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  credentialId?: string;
  publicKey?: string;
}

/**
 * Register a credential (the simulation's stand-in for the WebAuthn registration ceremony). The
 * browser generates its own keypair and sends the public key; the server returns the attestation that
 * lets that credential's assertions verify. The private key never leaves the browser.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.publicKey)) {
    return badRequest("publicKey is required");
  }
  const credentialId = isNonEmptyString(body.credentialId) ? body.credentialId : `cred_${randomUUID()}`;
  const registration = getSimulatedIssuer().register(credentialId, body.publicKey);
  return ok(registration, { status: 201 });
}
