import { badRequest, ok, readJson } from "@/lib/api";
import type { WebAuthnAssertion } from "@/lib/issuer/WebAuthnIssuer";
import { redeem } from "@/lib/claim/redeem";
import { shortFingerprint } from "@/lib/hash";
import { newClaimId } from "@/lib/ids";
import { ledger } from "@/lib/ledger";
import { metrics } from "@/lib/metricsStore";
import { getStore, getWebAuthnIssuer } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  assertion?: WebAuthnAssertion;
  contextId?: string;
}

/** Redeem a real passkey assertion. Same redemption path as the simulated issuer, different issuer. */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !body.assertion) {
    return badRequest("assertion is required");
  }

  const store = getStore();
  await store.createContext({
    contextId: body.assertion.contextId,
    label: "Passkey action",
    kind: "vote",
    createdAt: Date.now(),
  });

  const outcome = await redeem(getWebAuthnIssuer(), store, body.assertion, newClaimId(), Date.now());
  metrics.record(outcome.contextId, outcome.decision, outcome.latencyMs);
  const fingerprint = outcome.fingerprint ? shortFingerprint(outcome.fingerprint) : undefined;
  ledger.publishFromClaim({
    contextId: outcome.contextId,
    decision: outcome.decision,
    fingerprint,
    latencyMs: outcome.latencyMs,
    at: Date.now(),
  });

  return ok({
    decision: outcome.decision,
    claimId: outcome.claimId ?? null,
    latencyMs: outcome.latencyMs,
    fingerprint: fingerprint ?? null,
    write: outcome.write ?? null,
  });
}
