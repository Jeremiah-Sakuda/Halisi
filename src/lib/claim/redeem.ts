import type { Issuer } from "@/lib/issuer/Issuer";
import type { ClaimStore } from "@/lib/store/ClaimStore";
import type { ClaimOutcome } from "@/lib/types";

/**
 * The one application operation that matters: turn an assertion into a durable, unique claim.
 *
 *   1. The Issuer verifies the assertion. A forged one is denied here and never touches the database.
 *   2. A verified assertion yields a fingerprint + single-use token; the store's conditional
 *      transaction decides ACCEPTED / DENIED_REPLAY / DENIED_DUPLICATE_IDENTITY at the write.
 *
 * `latencyMs` is the time spent in the decisive step — the conditional write for anything that reaches
 * the database, or the verification for a forged assertion that does not.
 */
export async function redeem<A extends { contextId: string }>(
  issuer: Issuer<A>,
  store: ClaimStore,
  assertion: A,
  claimId: string,
  now: number,
): Promise<ClaimOutcome> {
  const tVerify = performance.now();
  const verified = await issuer.verify(assertion);
  if (!verified.ok) {
    return {
      decision: "DENIED_FORGED",
      contextId: assertion.contextId,
      latencyMs: performance.now() - tVerify,
    };
  }

  const tWrite = performance.now();
  const result = await store.claim({
    contextId: assertion.contextId,
    fingerprint: verified.fingerprint,
    tokenId: verified.tokenId,
    claimId,
    createdAt: now,
  });
  const latencyMs = performance.now() - tWrite;

  return {
    decision: result.decision,
    contextId: assertion.contextId,
    claimId: result.decision === "ACCEPTED" ? result.claimId : undefined,
    fingerprint: verified.fingerprint,
    latencyMs,
  };
}
