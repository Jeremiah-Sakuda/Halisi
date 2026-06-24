import { createHash, createSign, generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { fingerprint } from "@/lib/hash";
import { WebAuthnIssuer, type WebAuthnAssertion } from "@/lib/issuer/WebAuthnIssuer";

const ORIGIN = "http://localhost:3000";
const RP = "localhost";
const SECRET = "test-webauthn-secret";

function issuer(): WebAuthnIssuer {
  return new WebAuthnIssuer(ORIGIN, SECRET, RP);
}

/** Build authenticatorData = rpIdHash(32) || flags(1) || counter(4). */
function authenticatorData(rp: string): Buffer {
  const rpIdHash = createHash("sha256").update(rp).digest();
  const flags = Buffer.from([0x05]); // user present + verified
  const counter = Buffer.alloc(4);
  return Buffer.concat([rpIdHash, flags, counter]);
}

/** Simulate what a browser authenticator returns for navigator.credentials.get. */
function browserAssert(
  iss: WebAuthnIssuer,
  challenge: { tokenId: string; contextId: string; challenge: string },
  opts: {
    alg: "ES256" | "Ed25519";
    publicKey: string;
    sign: (bytes: Buffer) => Buffer;
    attestation: string;
    credentialId: string;
    origin?: string;
    challengeOverride?: string;
  },
): WebAuthnAssertion {
  const clientData = {
    type: "webauthn.get",
    challenge: opts.challengeOverride ?? challenge.challenge,
    origin: opts.origin ?? ORIGIN,
  };
  const clientDataJSON = Buffer.from(JSON.stringify(clientData));
  const authData = authenticatorData(RP);
  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
  const signature = opts.sign(Buffer.concat([authData, clientDataHash]));
  return {
    tokenId: challenge.tokenId,
    contextId: challenge.contextId,
    credentialId: opts.credentialId,
    clientDataJSON: clientDataJSON.toString("base64url"),
    authenticatorData: authData.toString("base64url"),
    signature: signature.toString("base64url"),
    publicKey: opts.publicKey,
    attestation: opts.attestation,
    alg: opts.alg,
  };
}

function es256Credential(iss: WebAuthnIssuer, credentialId: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const pub = (publicKey as Buffer).toString("base64url");
  const reg = iss.register(credentialId, pub);
  const sign = (bytes: Buffer) =>
    createSign("SHA256")
      .update(bytes)
      .sign({ key: privateKey as Buffer, format: "der", type: "pkcs8", dsaEncoding: "der" });
  return { pub, sign, attestation: reg.attestation };
}

describe("WebAuthnIssuer (production path)", () => {
  it("accepts a genuine ES256 passkey assertion and derives the fingerprint", async () => {
    const iss = issuer();
    const cred = es256Credential(iss, "cred-es256");
    const challenge = await iss.issueChallenge("ctx");
    const assertion = browserAssert(iss, challenge, {
      alg: "ES256",
      credentialId: "cred-es256",
      publicKey: cred.pub,
      attestation: cred.attestation,
      sign: cred.sign,
    });
    const result = await iss.verify(assertion);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fingerprint).toBe(fingerprint("cred-es256", RP));
  });

  it("accepts a genuine Ed25519 passkey assertion", async () => {
    const iss = issuer();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "der" },
    });
    const pub = (publicKey as Buffer).toString("base64url");
    const reg = iss.register("cred-ed", pub);
    const challenge = await iss.issueChallenge("ctx");
    const assertion = browserAssert(iss, challenge, {
      alg: "Ed25519",
      credentialId: "cred-ed",
      publicKey: pub,
      attestation: reg.attestation,
      sign: (bytes) => edSign(null, bytes, { key: privateKey as Buffer, format: "der", type: "pkcs8" }),
    });
    expect((await iss.verify(assertion)).ok).toBe(true);
  });

  it("rejects an unregistered credential", async () => {
    const iss = issuer();
    const cred = es256Credential(iss, "cred-x");
    const challenge = await iss.issueChallenge("ctx");
    const assertion = browserAssert(iss, challenge, {
      alg: "ES256",
      credentialId: "cred-x",
      publicKey: cred.pub,
      attestation: "not-a-real-attestation",
      sign: cred.sign,
    });
    const result = await iss.verify(assertion);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("credential_not_registered");
  });

  it("rejects an origin mismatch", async () => {
    const iss = issuer();
    const cred = es256Credential(iss, "cred-o");
    const challenge = await iss.issueChallenge("ctx");
    const assertion = browserAssert(iss, challenge, {
      alg: "ES256",
      credentialId: "cred-o",
      publicKey: cred.pub,
      attestation: cred.attestation,
      sign: cred.sign,
      origin: "https://evil.example",
    });
    const result = await iss.verify(assertion);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("origin_mismatch");
  });

  it("rejects a challenge that was never issued", async () => {
    const iss = issuer();
    const cred = es256Credential(iss, "cred-c");
    const challenge = await iss.issueChallenge("ctx");
    const forgedChallenge = Buffer.from("tok.ctx.nonce.badmac").toString("base64url");
    const assertion = browserAssert(iss, challenge, {
      alg: "ES256",
      credentialId: "cred-c",
      publicKey: cred.pub,
      attestation: cred.attestation,
      sign: cred.sign,
      challengeOverride: forgedChallenge,
    });
    const result = await iss.verify(assertion);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["challenge_binding_mismatch", "challenge_not_issued"]).toContain(result.reason);
  });

  it("rejects a tampered signature", async () => {
    const iss = issuer();
    const cred = es256Credential(iss, "cred-s");
    const other = es256Credential(iss, "cred-other");
    const challenge = await iss.issueChallenge("ctx");
    // Sign with the wrong key.
    const assertion = browserAssert(iss, challenge, {
      alg: "ES256",
      credentialId: "cred-s",
      publicKey: cred.pub,
      attestation: cred.attestation,
      sign: other.sign,
    });
    const result = await iss.verify(assertion);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });
});
