import { describe, expect, it } from "vitest";

import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { runSwarm } from "@/lib/harness/swarm";
import { makeContext, setupIssuer } from "./helpers";

describe("swarm determinism", () => {
  // Each run uses a FRESH context (like the attacker console's re-fire), so the result is determined
  // only by the seed — a re-fire is byte-identical.
  const run = async (contextId: string) => {
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, contextId);
    return runSwarm(issuer, store, {
      contextId,
      count: 800,
      distinctCredentials: 6,
      mode: "mixed",
      seed: 12345,
    });
  };

  it("the same seed yields the same decision breakdown", async () => {
    const a = await run("det-a");
    const b = await run("det-b");
    expect({ f: a.deniedForged, r: a.deniedReplay, d: a.deniedDuplicate, n: a.distinctFingerprints }).toEqual({
      f: b.deniedForged,
      r: b.deniedReplay,
      d: b.deniedDuplicate,
      n: b.distinctFingerprints,
    });
  });

  it("the same seed yields the byte-identical set of accepted fingerprints", async () => {
    const a = await run("fp-a");
    const b = await run("fp-b");
    expect([...a.acceptedFingerprints].sort()).toEqual([...b.acceptedFingerprints].sort());
    expect(a.acceptedFingerprints.length).toBe(6);
  });

  it("a different seed yields a different set of accepted fingerprints", async () => {
    const a = await run("seed-a");
    const { issuer } = setupIssuer(0);
    const store = new MemoryClaimStore();
    await makeContext(store, "seed-c");
    const c = await runSwarm(issuer, store, { contextId: "seed-c", count: 800, distinctCredentials: 6, mode: "mixed", seed: 999 });
    expect([...a.acceptedFingerprints].sort()).not.toEqual([...c.acceptedFingerprints].sort());
  });
});
