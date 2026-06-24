import { describe, expect, it } from "vitest";

import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { runSwarm } from "@/lib/harness/swarm";
import { makeContext, setupIssuer } from "./helpers";

describe("swarm determinism", () => {
  it("the same seed yields the same decision breakdown", async () => {
    const run = async () => {
      const { issuer } = setupIssuer(0);
      const store = new MemoryClaimStore();
      await makeContext(store, "ctx-det");
      return runSwarm(issuer, store, {
        contextId: "ctx-det",
        count: 800,
        distinctCredentials: 6,
        mode: "mixed",
        seed: 12345,
      });
    };

    const a = await run();
    const b = await run();
    expect({ f: a.deniedForged, r: a.deniedReplay, d: a.deniedDuplicate, n: a.distinctFingerprints }).toEqual({
      f: b.deniedForged,
      r: b.deniedReplay,
      d: b.deniedDuplicate,
      n: b.distinctFingerprints,
    });
  });
});
