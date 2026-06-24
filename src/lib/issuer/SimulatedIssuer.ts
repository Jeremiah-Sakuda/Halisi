import { fingerprint } from "@/lib/hash";
import { newChallenge, newTokenId } from "@/lib/ids";
import type { Assertion, Challenge, Issuer, VerifyResult } from "@/lib/issuer/Issuer";
import {
  generateCredentialKeyPair,
  hmac,
  macEquals,
  signEd25519,
  verifyEd25519,
} from "@/lib/issuer/crypto";
import { rpId as defaultRpId, serverSecret } from "@/lib/issuer/serverSecret";

/**
 * The signed material an authenticator produces over the issued challenge. Binding tokenId + contextId
 * means an assertion is useless for any other token or context, even before it reaches the database.
 */
function signedMaterial(a: Pick<Assertion, "tokenId" | "contextId" | "challenge">): string {
  return `${a.tokenId}.${a.contextId}.${a.challenge}`;
}

function challengeMac(secret: string, tokenId: string, contextId: string, nonce: string): string {
  return hmac(secret, `chal.${tokenId}.${contextId}.${nonce}`);
}

function attestationMac(secret: string, credentialId: string, publicKey: string): string {
  return hmac(secret, `att.${credentialId}.${publicKey}`);
}

export interface RegistrationResult {
  credentialId: string;
  publicKey: string;
  attestation: string;
  fingerprint: string;
}

/**
 * SimulatedIssuer — a stand-in for a real passkey relying party, used by the demo harness and the
 * property suite. It follows the exact verification path a WebAuthn assertion would, so production can
 * swap in {@link WebAuthnIssuer} without touching the redemption code.
 *
 * Verification is stateless: a challenge MAC proves issuance, an attestation MAC proves registration,
 * and an Ed25519 signature proves possession. The harness controls how many distinct credentials are
 * registered (M), which is the true number of humans a swarm can ever collapse to.
 */
export class SimulatedIssuer implements Issuer {
  constructor(
    private readonly secret: string = serverSecret(),
    private readonly rp: string = defaultRpId(),
  ) {}

  /** The relying-party id the fingerprints are anchored to. */
  get rpId(): string {
    return this.rp;
  }

  /**
   * Register a credential (the costly, real-authenticator step in production). Returns the attestation
   * MAC that lets the credential's assertions verify statelessly thereafter.
   */
  register(credentialId: string, publicKey: string): RegistrationResult {
    const attestation = attestationMac(this.secret, credentialId, publicKey);
    return {
      credentialId,
      publicKey,
      attestation,
      fingerprint: fingerprint(credentialId, this.rp),
    };
  }

  async issueChallenge(contextId: string): Promise<Challenge> {
    const tokenId = newTokenId();
    const nonce = newChallenge();
    const mac = challengeMac(this.secret, tokenId, contextId, nonce);
    return { tokenId, contextId, challenge: `${nonce}.${mac}` };
  }

  async verify(assertion: Assertion): Promise<VerifyResult> {
    const { tokenId, contextId, credentialId, challenge, publicKey, attestation, signature } =
      assertion;

    // 1. The server issued this challenge for this token + context.
    const dot = challenge.indexOf(".");
    if (dot < 0) return { ok: false, reason: "malformed_challenge" };
    const nonce = challenge.slice(0, dot);
    const mac = challenge.slice(dot + 1);
    if (!macEquals(mac, challengeMac(this.secret, tokenId, contextId, nonce))) {
      return { ok: false, reason: "challenge_not_issued" };
    }

    // 2. The credential was genuinely registered (its assertion is not self-minted).
    if (!macEquals(attestation, attestationMac(this.secret, credentialId, publicKey))) {
      return { ok: false, reason: "credential_not_registered" };
    }

    // 3. The authenticator actually signed this challenge.
    if (!verifyEd25519(signedMaterial(assertion), signature, publicKey)) {
      return { ok: false, reason: "bad_signature" };
    }

    return { ok: true, fingerprint: fingerprint(credentialId, this.rp), tokenId };
  }
}

/**
 * SimulatedAuthenticator — the client side of the simulation: one credential keypair that can produce
 * genuine assertions over an issued challenge. Real WebAuthn keeps the private key in hardware; here it
 * lives in this object and never reaches the issuer.
 */
export class SimulatedAuthenticator {
  readonly credentialId: string;
  readonly publicKey: string;
  private readonly privateKey: string;
  private attestation: string | null = null;

  constructor(credentialId: string) {
    const kp = generateCredentialKeyPair();
    this.credentialId = credentialId;
    this.publicKey = kp.publicKey;
    this.privateKey = kp.privateKey;
  }

  /** Complete the registration ceremony with an issuer, caching the attestation for later assertions. */
  registerWith(issuer: SimulatedIssuer): RegistrationResult {
    const reg = issuer.register(this.credentialId, this.publicKey);
    this.attestation = reg.attestation;
    return reg;
  }

  /** Produce a genuine assertion over an issued challenge. */
  assert(challenge: Challenge): Assertion {
    if (this.attestation === null) {
      throw new Error("authenticator must register before it can assert");
    }
    const base = {
      tokenId: challenge.tokenId,
      contextId: challenge.contextId,
      challenge: challenge.challenge,
    };
    return {
      ...base,
      credentialId: this.credentialId,
      publicKey: this.publicKey,
      attestation: this.attestation,
      signature: signEd25519(signedMaterial(base), this.privateKey),
    };
  }
}
