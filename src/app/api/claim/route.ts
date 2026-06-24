import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import type { Assertion } from "@/lib/issuer/Issuer";
import { redeem } from "@/lib/claim/redeem";
import { shortFingerprint } from "@/lib/hash";
import { ledger } from "@/lib/ledger";
import { metrics } from "@/lib/metricsStore";
import { getSimulatedIssuer, getStore } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  assertion?: Assertion;
  claimId?: string;
}

const requiredAssertionFields: (keyof Assertion)[] = [
  "tokenId",
  "contextId",
  "credentialId",
  "challenge",
  "publicKey",
  "attestation",
  "signature",
];

/**
 * Redeem an assertion for a durable, unique claim. The decision — ACCEPTED / DENIED_FORGED /
 * DENIED_REPLAY / DENIED_DUPLICATE_IDENTITY — is made by verification then the conditional write.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !body.assertion || !isNonEmptyString(body.claimId)) {
    return badRequest("assertion and claimId are required");
  }
  for (const field of requiredAssertionFields) {
    if (!isNonEmptyString(body.assertion[field])) {
      return badRequest(`assertion.${field} is required`);
    }
  }

  const outcome = await redeem(
    getSimulatedIssuer(),
    getStore(),
    body.assertion,
    body.claimId,
    Date.now(),
  );

  metrics.record(outcome.contextId, outcome.decision, outcome.latencyMs);
  ledger.publish({
    contextId: outcome.contextId,
    decision: outcome.decision,
    fingerprint: outcome.fingerprint ? shortFingerprint(outcome.fingerprint) : undefined,
    latencyMs: outcome.latencyMs,
    at: Date.now(),
  });

  return ok({
    decision: outcome.decision,
    claimId: outcome.claimId ?? null,
    latencyMs: outcome.latencyMs,
    fingerprint: outcome.fingerprint ? shortFingerprint(outcome.fingerprint) : null,
  });
}
