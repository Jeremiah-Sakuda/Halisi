import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";

/**
 * Client-generated claim id. Writes are idempotent on the claim key, so the id never needs a
 * read-before-write — we mint it up front and let the conditional write decide acceptance.
 */
export function newClaimId(): string {
  return uuidv4();
}

/** A single-use token id (the redemption key burned at the DynamoDB write). */
export function newTokenId(): string {
  return uuidv4();
}

/** A WebAuthn-style challenge: random bytes, base64url-encoded, bound to one token. */
export function newChallenge(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** A synthetic credential id, used by the simulated issuer to stand in for a passkey credential. */
export function newCredentialId(): string {
  return `cred_${randomBytes(16).toString("hex")}`;
}
