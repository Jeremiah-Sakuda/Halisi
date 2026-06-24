import { describe, expect, it } from "vitest";

import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { runSwarm } from "@/lib/harness/swarm";
import { makeContext, setupIssuer } from "./helpers";

const CTX = "ctx-swarm";

describe("swarm harness collapse", () => {
  it("a 10k mixed swarm behind M credentials collapses to exactly M", async () => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const M = 7;
    const summary = await runSwarm(issuer, store, {
      contextId: CTX,
      count: 10_000,
      distinctCredentials: M,
      mode: "mixed",
      seed: 42,
    });

    expect(summary.attempts).toBe(10_000);
    expect(summary.distinctFingerprints).toBe(M);
    expect(summary.accepted).toBe(M);
    expect(summary.acceptedFingerprints.length).toBe(M);
    // Every attempt that wasn't accepted was denied — nothing slipped through.
    expect(
      summary.accepted + summary.deniedForged + summary.deniedReplay + summary.deniedDuplicate,
    ).toBe(10_000);
  });

  it("forged-only swarm writes nothing and collapses to zero", async () => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const summary = await runSwarm(issuer, store, {
      contextId: CTX,
      count: 1_000,
      distinctCredentials: 0,
      mode: "forged",
      seed: 1,
    });

    expect(summary.deniedForged).toBe(1_000);
    expect(summary.distinctFingerprints).toBe(0);
    expect(summary.estimatedCostUsd).toBe(0); // forged assertions never reach the table
  });

  it("reused swarm: N attempts, M credentials, exactly M accepted", async () => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, CTX);

    const summary = await runSwarm(issuer, store, {
      contextId: CTX,
      count: 2_000,
      distinctCredentials: 12,
      mode: "reused",
      seed: 7,
    });

    expect(summary.accepted).toBe(12);
    expect(summary.distinctFingerprints).toBe(12);
    expect(summary.deniedDuplicate).toBe(2_000 - 12);
  });
});
