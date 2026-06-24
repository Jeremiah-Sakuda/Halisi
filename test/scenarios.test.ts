import { describe, expect, it } from "vitest";

import { newClaimId, newCredentialId } from "@/lib/ids";
import { SimulatedAuthenticator } from "@/lib/issuer/SimulatedIssuer";
import { redeem } from "@/lib/claim/redeem";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { forged, genuine, makeContext, setupIssuer } from "./helpers";

const CTX = "ctx-scenario";

describe("the invariant, scenario by scenario (MemoryClaimStore)", () => {
  it("replay: one genuine token redeems once, every resubmission is denied at the write", async () => {
    const { issuer, authenticators } = setupIssuer(1);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const assertion = await genuine(issuer, authenticators[0]!, CTX);
    const first = await redeem(issuer, store, assertion, newClaimId(), 0);
    expect(first.decision).toBe("ACCEPTED");

    const replays = await Promise.all(
      Array.from({ length: 25 }, () => redeem(issuer, store, assertion, newClaimId(), 0)),
    );
    expect(replays.every((r) => r.decision === "DENIED_REPLAY")).toBe(true);

    expect((await store.collapse(CTX)).distinctFingerprints).toBe(1);
  });

  it("forgery: unregistered credentials are 100% denied and never write to the store", async () => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const outcomes = await Promise.all(
      Array.from({ length: 100 }, async () =>
        redeem(issuer, store, await forged(issuer, CTX), newClaimId(), 0),
      ),
    );
    expect(outcomes.every((o) => o.decision === "DENIED_FORGED")).toBe(true);
    expect((await store.collapse(CTX)).distinctFingerprints).toBe(0);
  });

  it("credential reuse: N attempts behind M credentials collapse to exactly M", async () => {
    const M = 7;
    const N = 500;
    const { issuer, authenticators } = setupIssuer(M);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    let accepted = 0;
    for (let i = 0; i < N; i++) {
      const auth = authenticators[i % M]!; // the same few credentials, reused across many attempts
      const outcome = await redeem(issuer, store, await genuine(issuer, auth, CTX), newClaimId(), 0);
      if (outcome.decision === "ACCEPTED") accepted++;
    }

    expect(accepted).toBe(M);
    expect((await store.collapse(CTX)).distinctFingerprints).toBe(M);
  });

  it("genuine: distinct fresh credentials each claim exactly once", async () => {
    const N = 50;
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    for (let i = 0; i < N; i++) {
      const auth = new SimulatedAuthenticator(newCredentialId());
      auth.registerWith(issuer);
      const outcome = await redeem(issuer, store, await genuine(issuer, auth, CTX), newClaimId(), 0);
      expect(outcome.decision).toBe("ACCEPTED");
    }
    expect((await store.collapse(CTX)).distinctFingerprints).toBe(N);
  });

  it("concurrency: C racing claims on one credential yield exactly one accept (atomicity, not luck)", async () => {
    const C = 64;
    const { issuer, authenticators } = setupIssuer(1);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    // Each racer carries its own freshly-issued token, but they all resolve to the same fingerprint.
    const assertions = await Promise.all(
      Array.from({ length: C }, () => genuine(issuer, authenticators[0]!, CTX)),
    );
    const outcomes = await Promise.all(
      assertions.map((a) => redeem(issuer, store, a, newClaimId(), 0)),
    );

    const accepted = outcomes.filter((o) => o.decision === "ACCEPTED");
    const denied = outcomes.filter((o) => o.decision === "DENIED_DUPLICATE_IDENTITY");
    expect(accepted.length).toBe(1);
    expect(denied.length).toBe(C - 1);
    expect((await store.collapse(CTX)).distinctFingerprints).toBe(1);
  });
});
