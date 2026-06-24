/**
 * The server attestation secret. In production this is a managed secret; for local dev and tests a
 * stable default keeps the demo deterministic. It never leaves the server and is the only thing a
 * client cannot reproduce — which is what stops a client from minting its own credentials.
 */
const DEV_DEFAULT = "halisi-dev-attestation-secret-not-for-production";

export function serverSecret(): string {
  return process.env.HALISI_SERVER_SECRET || DEV_DEFAULT;
}

export function rpId(): string {
  return process.env.HALISI_RP_ID || "localhost";
}
