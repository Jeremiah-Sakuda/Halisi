import {
  createHmac,
  generateKeyPairSync,
  sign as edSign,
  timingSafeEqual,
  verify as edVerify,
} from "node:crypto";

/**
 * Cryptographic primitives shared by the issuers.
 *
 * Authenticator possession is proven with Ed25519 signatures over the server's challenge. Two server
 * HMACs anchor trust without any hot-path datastore read:
 *   - the challenge MAC proves the server issued a given challenge for a token + context;
 *   - the attestation MAC proves the server registered a given (credentialId, publicKey).
 * The HMAC secret is the only secret; it stands in for the server's registration database.
 */

export interface KeyPair {
  /** SPKI public key, base64. */
  publicKey: string;
  /** PKCS8 private key, base64. (Stays client-side in the simulation; never sent to the server.) */
  privateKey: string;
}

/** Generate an Ed25519 keypair, representing one authenticator credential. */
export function generateCredentialKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicKey: (publicKey as Buffer).toString("base64"),
    privateKey: (privateKey as Buffer).toString("base64"),
  };
}

/** Sign a message with an Ed25519 private key (the authenticator signing the challenge). */
export function signEd25519(message: string, privateKeyB64: string): string {
  const key = {
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der" as const,
    type: "pkcs8" as const,
  };
  return edSign(null, Buffer.from(message), key).toString("base64");
}

/** Verify an Ed25519 signature against the public key the attestation vouches for. */
export function verifyEd25519(message: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const key = {
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der" as const,
      type: "spki" as const,
    };
    return edVerify(null, Buffer.from(message), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** HMAC-SHA256, base64url. */
export function hmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

/** Constant-time string compare for MAC checks. */
export function macEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
