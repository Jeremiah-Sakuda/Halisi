import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { getWebAuthnIssuer } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  credentialId?: string;
  publicKey?: string; // SPKI, base64url (from AuthenticatorAttestationResponse.getPublicKey())
}

/**
 * Complete a passkey registration: vouch for the credential's public key with an attestation MAC so its
 * later assertions verify statelessly. The browser produced the keypair in hardware; only the public key
 * arrives here.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.credentialId) || !isNonEmptyString(body.publicKey)) {
    return badRequest("credentialId and publicKey are required");
  }
  const registration = getWebAuthnIssuer().register(body.credentialId, body.publicKey);
  return ok(registration, { status: 201 });
}
