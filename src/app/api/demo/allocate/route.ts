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
  campaignId?: string;
  deviceId?: string;
  wallet?: string;
}

/**
 * Airdrop allocation: one allocation per attested credential per campaign, bound to a wallet address.
 *
 * The fingerprint is anchored to the device, not the wallet — so a single device cannot farm
 * allocations across many wallets. The first claim is accepted and records its wallet; any further
 * attempt from the same device (even with a different wallet) is denied at the write.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.campaignId) || !isNonEmptyString(body.deviceId) || !isNonEmptyString(body.wallet)) {
    return badRequest("campaignId, deviceId, and wallet are required");
  }

  const issuer = getSimulatedIssuer();
  const store = getStore();
  await store.createContext({
    contextId: body.campaignId,
    label: "Airdrop campaign",
    kind: "allocation",
    createdAt: Date.now(),
  });

  const authenticator = new SimulatedAuthenticator(body.deviceId);
  authenticator.registerWith(issuer);
  const assertion = authenticator.assert(await issuer.issueChallenge(body.campaignId));

  const outcome = await redeem(issuer, store, assertion, newClaimId(), Date.now(), { wallet: body.wallet });
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
    latencyMs: outcome.latencyMs,
    fingerprint: fingerprint ?? null,
    write: outcome.write ?? null,
    wallet: body.wallet,
  });
}
