import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { newClaimId } from "@/lib/ids";
import { SimulatedAuthenticator } from "@/lib/issuer/SimulatedIssuer";
import { redeem } from "@/lib/claim/redeem";
import { shortFingerprint } from "@/lib/hash";
import { ledger } from "@/lib/ledger";
import { metrics } from "@/lib/metricsStore";
import { getSimulatedIssuer, getStore } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  contextId?: string;
  deviceId?: string;
}

/**
 * The interactive "cast your one vote" path. The browser holds a deviceId standing in for its passkey;
 * the fingerprint is anchored to it, so a second vote from the same device is a duplicate and resending
 * the assertion is a replay. Returns the assertion so the UI's "replay this token" button can prove the
 * denial live. (The real-passkey path uses the same redemption code behind the WebAuthn issuer.)
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.contextId) || !isNonEmptyString(body.deviceId)) {
    return badRequest("contextId and deviceId are required");
  }

  const issuer = getSimulatedIssuer();
  const store = getStore();
  await store.createContext({
    contextId: body.contextId,
    label: "Interactive action",
    kind: "vote",
    createdAt: Date.now(),
  });

  // credentialId = deviceId → the fingerprint is stable for this device across votes.
  const authenticator = new SimulatedAuthenticator(body.deviceId);
  authenticator.registerWith(issuer);
  const assertion = authenticator.assert(await issuer.issueChallenge(body.contextId));

  const outcome = await redeem(issuer, store, assertion, newClaimId(), Date.now());
  metrics.record(outcome.contextId, outcome.decision, outcome.latencyMs);
  const fingerprint = outcome.fingerprint ? shortFingerprint(outcome.fingerprint) : undefined;
  ledger.publish({
    contextId: outcome.contextId,
    decision: outcome.decision,
    fingerprint,
    latencyMs: outcome.latencyMs,
    at: Date.now(),
  });

  return ok({
    decision: outcome.decision,
    latencyMs: outcome.latencyMs,
    fingerprint: fingerprint ?? null,
    // The verified assertion, so the client can replay the exact same token.
    assertion,
  });
}
