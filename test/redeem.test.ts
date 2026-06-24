import { describe, expect, it } from "vitest";

import { newClaimId } from "@/lib/ids";
import { redeem } from "@/lib/claim/redeem";
import { fingerprint } from "@/lib/hash";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { forged, genuine, makeContext, setupIssuer, RP_ID } from "./helpers";

const CTX = "ctx-redeem";

describe("redeem", () => {
  it("returns ACCEPTED with a claimId, the fingerprint, and a write latency", async () => {
    const { issuer, authenticators } = setupIssuer(1);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const outcome = await redeem(issuer, store, await genuine(issuer, authenticators[0]!, CTX), newClaimId(), 0);
    expect(outcome.decision).toBe("ACCEPTED");
    expect(outcome.claimId).toBeTruthy();
    expect(outcome.fingerprint).toBe(fingerprint(authenticators[0]!.credentialId, RP_ID));
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns DENIED_FORGED with no claimId and never writes", async () => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const outcome = await redeem(issuer, store, await forged(issuer, CTX), newClaimId(), 0);
    expect(outcome.decision).toBe("DENIED_FORGED");
    expect(outcome.claimId).toBeUndefined();
    expect((await store.collapse(CTX)).distinctFingerprints).toBe(0);
  });
});
