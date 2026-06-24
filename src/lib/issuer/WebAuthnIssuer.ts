import { createHash, createVerify, verify as nodeVerify } from "node:crypto";

import { fingerprint } from "@/lib/hash";
import { newChallenge, newTokenId } from "@/lib/ids";
import type { Challenge, Issuer, VerifyResult } from "@/lib/issuer/Issuer";
import { hmac, macEquals } from "@/lib/issuer/crypto";
import { rpId as defaultRpId, serverSecret } from "@/lib/issuer/serverSecret";

/**
 * WebAuthnIssuer — the production attestation source: real passkey assertions.
 *
 * It implements the same {@link Issuer} contract as the simulated issuer, so the redemption path does
 * not change. The challenge is HMAC-bound to a token + context (stateless issuance), and the
 * credential's public key is trusted via an attestation MAC minted at registration — the same trust
 * model as the simulation, now over a genuine authenticator signature.
 *
 * Verification follows the WebAuthn authentication ceremony: parse clientDataJSON, confirm the type,
 * origin, and that the signed challenge is the one we issued; confirm the rpIdHash in authenticatorData;
 * then verify the signature over `authenticatorData || SHA256(clientDataJSON)` with the registered key.
 */
export interface WebAuthnAssertion {
  tokenId: string;
  contextId: string;
  credentialId: string;
  /** base64url clientDataJSON produced by navigator.credentials.get. */
  clientDataJSON: string;
  /** base64url authenticatorData. */
  authenticatorData: string;
  /** base64url signature over authenticatorData || SHA256(clientDataJSON). */
  signature: string;
  /** SPKI public key (base64) registered for this credential. */
  publicKey: string;
  /** Server attestation proving (credentialId, publicKey) was registered. */
  attestation: string;
  /** "ES256" (ECDSA P-256) or "Ed25519". */
  alg?: "ES256" | "Ed25519";
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function attestationMac(secret: string, credentialId: string, publicKey: string): string {
  return hmac(secret, `webauthn.att.${credentialId}.${publicKey}`);
}

function challengeMac(secret: string, tokenId: string, contextId: string, nonce: string): string {
  return hmac(secret, `webauthn.chal.${tokenId}.${contextId}.${nonce}`);
}

export interface WebAuthnRegistration {
  credentialId: string;
  publicKey: string;
  attestation: string;
  fingerprint: string;
}

export class WebAuthnIssuer implements Issuer<WebAuthnAssertion> {
  constructor(
    private readonly origin: string = process.env.HALISI_ORIGIN || "http://localhost:3000",
    private readonly secret: string = serverSecret(),
    private readonly rp: string = defaultRpId(),
  ) {}

  /** Register a credential after a successful create() ceremony: vouch for its public key. */
  register(credentialId: string, publicKey: string): WebAuthnRegistration {
    return {
      credentialId,
      publicKey,
      attestation: attestationMac(this.secret, credentialId, publicKey),
      fingerprint: fingerprint(credentialId, this.rp),
    };
  }

  async issueChallenge(contextId: string): Promise<Challenge> {
    const tokenId = newTokenId();
    const nonce = newChallenge();
    const mac = challengeMac(this.secret, tokenId, contextId, nonce);
    // The browser receives this as the assertion challenge; clientDataJSON echoes it back base64url.
    const challenge = Buffer.from(`${tokenId}.${contextId}.${nonce}.${mac}`).toString("base64url");
    return { tokenId, contextId, challenge };
  }

  async verify(assertion: WebAuthnAssertion): Promise<VerifyResult> {
    // 1. The credential was registered (its public key is vouched for).
    if (!macEquals(assertion.attestation, attestationMac(this.secret, assertion.credentialId, assertion.publicKey))) {
      return { ok: false, reason: "credential_not_registered" };
    }

    // 2. Parse clientDataJSON and check ceremony type + origin.
    let clientData: { type?: string; challenge?: string; origin?: string };
    try {
      clientData = JSON.parse(b64urlToBuf(assertion.clientDataJSON).toString("utf8"));
    } catch {
      return { ok: false, reason: "malformed_client_data" };
    }
    if (clientData.type !== "webauthn.get") return { ok: false, reason: "wrong_ceremony_type" };
    if (clientData.origin !== this.origin) return { ok: false, reason: "origin_mismatch" };

    // 3. The signed challenge is the one we issued for this token + context.
    if (typeof clientData.challenge !== "string") return { ok: false, reason: "missing_challenge" };
    const parts = b64urlToBuf(clientData.challenge).toString("utf8").split(".");
    if (parts.length !== 4) return { ok: false, reason: "malformed_challenge" };
    const [tokenId, contextId, nonce, mac] = parts as [string, string, string, string];
    if (tokenId !== assertion.tokenId || contextId !== assertion.contextId) {
      return { ok: false, reason: "challenge_binding_mismatch" };
    }
    if (!macEquals(mac, challengeMac(this.secret, tokenId, contextId, nonce))) {
      return { ok: false, reason: "challenge_not_issued" };
    }

    // 4. The authenticatorData is for our relying party.
    const authData = b64urlToBuf(assertion.authenticatorData);
    const rpIdHash = createHash("sha256").update(this.rp).digest();
    if (authData.length < 37 || !authData.subarray(0, 32).equals(rpIdHash)) {
      return { ok: false, reason: "rpid_mismatch" };
    }

    // 5. The authenticator signed authenticatorData || SHA256(clientDataJSON).
    const clientDataHash = createHash("sha256").update(b64urlToBuf(assertion.clientDataJSON)).digest();
    const signedBytes = Buffer.concat([authData, clientDataHash]);
    if (!this.verifySignature(signedBytes, assertion)) {
      return { ok: false, reason: "bad_signature" };
    }

    return { ok: true, fingerprint: fingerprint(assertion.credentialId, this.rp), tokenId };
  }

  private verifySignature(signedBytes: Buffer, assertion: WebAuthnAssertion): boolean {
    const key = { key: b64urlToBuf(assertion.publicKey), format: "der" as const, type: "spki" as const };
    const signature = b64urlToBuf(assertion.signature);
    try {
      if ((assertion.alg ?? "ES256") === "Ed25519") {
        return nodeVerify(null, signedBytes, { ...key }, signature);
      }
      // ES256: ECDSA over P-256 with SHA-256; WebAuthn signatures are DER-encoded.
      const verifier = createVerify("SHA256");
      verifier.update(signedBytes);
      verifier.end();
      return verifier.verify({ ...key, dsaEncoding: "der" }, signature);
    } catch {
      return false;
    }
  }
}
