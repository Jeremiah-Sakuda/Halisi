/**
 * The Issuer turns an unforgeable, single-use attestation into a verified fingerprint.
 *
 * Halisi commits to ONE attestation source — WebAuthn / passkey assertions. The client cannot
 * self-mint a token: it can only produce a valid assertion by signing the server's single-use
 * challenge with an authenticator it actually holds.
 *
 * Two implementations sit behind this interface:
 *   - SimulatedIssuer — a server-held keypair per synthetic credential, so the harness can fire
 *     legitimately-signed, forged, and replayed assertions on demand (demo + tests).
 *   - WebAuthnIssuer  — real passkey assertions (the one genuine human beat).
 *
 * Both follow the same verification path and feed the same redemption code, so swapping them changes
 * nothing downstream of `verify`.
 */

/** A single-use challenge, issued by the server and bound to one token + context. */
export interface Challenge {
  tokenId: string;
  contextId: string;
  challenge: string;
}

/**
 * What the client returns: an assertion over the issued challenge. Shape mirrors a WebAuthn
 * assertion — a credential id, the public key, and a signature over the challenge.
 *
 * `attestation` binds (credentialId, publicKey) to a real registration ceremony: the server issues it
 * (an HMAC under the server secret) only when a credential is genuinely registered. A client cannot
 * fabricate it, so it cannot invent new credentials — which is what caps a swarm at M real credentials.
 * This keeps verification fully stateless (no server-side registry read on the hot path).
 */
export interface Assertion {
  tokenId: string;
  contextId: string;
  credentialId: string;
  /** The issued challenge the authenticator signed over (echoed back, as WebAuthn echoes clientData). */
  challenge: string;
  /** The credential public key (trusted only because `attestation` proves the server registered it). */
  publicKey: string;
  /** Server-issued proof that this (credentialId, publicKey) pair was registered. */
  attestation: string;
  /** The authenticator's signature over the issued challenge material. */
  signature: string;
}

export type VerifyResult =
  | { ok: true; fingerprint: string; tokenId: string }
  | { ok: false; reason: string };

export interface Issuer {
  /** Issue a single-use challenge bound to a token + context. */
  issueChallenge(contextId: string): Promise<Challenge>;

  /**
   * Verify an assertion: the signature is valid over the issued challenge for this token, and the
   * challenge was genuinely issued. On success, derive the credential fingerprint.
   *
   * Note: verify deliberately does NOT consume the challenge. Single-use is enforced authoritatively
   * at the database write (the redemption burn), so a replayed-but-valid assertion still verifies
   * here and is denied at the write — that is the point.
   */
  verify(assertion: Assertion): Promise<VerifyResult>;
}
