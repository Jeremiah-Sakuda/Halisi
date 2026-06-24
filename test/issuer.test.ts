import { describe, expect, it } from "vitest";

import { newCredentialId } from "@/lib/ids";
import { SimulatedAuthenticator, SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { fingerprint } from "@/lib/hash";

const RP = "halisi.test";

function registered(): { issuer: SimulatedIssuer; auth: SimulatedAuthenticator } {
  const issuer = new SimulatedIssuer("secret", RP);
  const auth = new SimulatedAuthenticator(newCredentialId());
  auth.registerWith(issuer);
  return { issuer, auth };
}

describe("SimulatedIssuer.verify", () => {
  it("accepts a genuine assertion and derives the credential fingerprint", async () => {
    const { issuer, auth } = registered();
    const challenge = await issuer.issueChallenge("ctx");
    const result = await issuer.verify(auth.assert(challenge));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fingerprint).toBe(fingerprint(auth.credentialId, RP));
      expect(result.tokenId).toBe(challenge.tokenId);
    }
  });

  it("rejects a credential the relying party never registered (forged attestation)", async () => {
    const { issuer } = registered();
    const stranger = new SimulatedAuthenticator(newCredentialId());
    const challenge = await issuer.issueChallenge("ctx");
    const result = await issuer.verify(stranger.assert(challenge, { forgeAttestation: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("credential_not_registered");
  });

  it("rejects a tampered signature", async () => {
    const { issuer, auth } = registered();
    const challenge = await issuer.issueChallenge("ctx");
    const result = await issuer.verify(auth.assert(challenge, { forgeSignature: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects an assertion whose challenge was never issued", async () => {
    const { issuer, auth } = registered();
    const challenge = await issuer.issueChallenge("ctx");
    const tampered = { ...auth.assert(challenge), challenge: "fabricated.nonce" };
    const result = await issuer.verify(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("challenge_not_issued");
  });

  it("rejects an assertion replayed into a different context", async () => {
    const { issuer, auth } = registered();
    const challenge = await issuer.issueChallenge("ctx-a");
    const assertion = auth.assert(challenge);
    // Same signed material, but presented for another context.
    const result = await issuer.verify({ ...assertion, contextId: "ctx-b" });
    expect(result.ok).toBe(false);
  });

  it("re-verifies a valid assertion (single-use is enforced at the write, not here)", async () => {
    const { issuer, auth } = registered();
    const challenge = await issuer.issueChallenge("ctx");
    const assertion = auth.assert(challenge);
    expect((await issuer.verify(assertion)).ok).toBe(true);
    // Deliberately still valid: the database burns the token, the issuer does not.
    expect((await issuer.verify(assertion)).ok).toBe(true);
  });
});
