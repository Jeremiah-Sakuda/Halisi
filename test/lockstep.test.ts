import { describe, expect, it } from "vitest";

import { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { runLockstep } from "@/lib/harness/lockstep";

function issuer(): SimulatedIssuer {
  return new SimulatedIssuer("lockstep-secret", "halisi.test");
}

describe("two-engine lockstep", () => {
  it("every decision matches across the memory and dynamo code paths", async () => {
    const result = await runLockstep(issuer(), {
      contextId: "ls-1",
      count: 3_000,
      distinctCredentials: 4,
      mode: "mixed",
      seed: 2026,
    });
    expect(result.total).toBe(3_000);
    expect(result.matches).toBe(3_000);
    expect(result.mismatchIndex).toBe(-1);
  });

  it("both engines collapse to exactly M with the same accepted fingerprints", async () => {
    const result = await runLockstep(issuer(), {
      contextId: "ls-2",
      count: 2_000,
      distinctCredentials: 5,
      mode: "mixed",
      seed: 7,
    });
    expect(result.memory.distinctFingerprints).toBe(5);
    expect(result.dynamo.distinctFingerprints).toBe(5);
    expect([...result.memory.acceptedFingerprints].sort()).toEqual([...result.dynamo.acceptedFingerprints].sort());
  });

  it("forged-only collapses to zero on both engines", async () => {
    const result = await runLockstep(issuer(), {
      contextId: "ls-3",
      count: 500,
      distinctCredentials: 0,
      mode: "forged",
      seed: 1,
    });
    expect(result.matches).toBe(result.total);
    expect(result.memory.distinctFingerprints).toBe(0);
    expect(result.dynamo.distinctFingerprints).toBe(0);
    expect(result.memory.deniedForged).toBe(500);
    expect(result.dynamo.deniedForged).toBe(500);
  });
});
