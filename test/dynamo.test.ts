import { describe, expect, it } from "vitest";

import { DynamoClaimStore } from "@/lib/store/DynamoClaimStore";
import { FakeDynamo } from "@/lib/store/fakeDynamo";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { runSwarm } from "@/lib/harness/swarm";
import { makeContext, setupIssuer } from "./helpers";
import { arbAction, invariantSuite } from "./invariantSuite";
import { buildProgram, expectedDistinct, runAgainstStore } from "./program";
import fc from "fast-check";

const TABLE = "Halisi";

// The DynamoDB store, exercised through the faithful fake, is held to the identical spec.
invariantSuite("DynamoClaimStore (FakeDynamo)", () => new DynamoClaimStore(new FakeDynamo(), TABLE));

describe("memory and dynamo are behaviorally identical", () => {
  it("produces the same decisions and the same collapse on every program", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          m: fc.integer({ min: 1, max: 5 }),
          actions: fc.array(arbAction, { maxLength: 40 }),
        }),
        async ({ m, actions }) => {
          const { issuer, authenticators } = setupIssuer(m);
          const contextId = "ctx-equiv";

          const memory = new MemoryClaimStore();
          const dynamo = new DynamoClaimStore(new FakeDynamo(), TABLE);
          await makeContext(memory, contextId);
          await makeContext(dynamo, contextId);

          const program = await buildProgram(issuer, authenticators, contextId, actions);
          const memoryDecisions = await runAgainstStore(issuer, memory, program);
          const dynamoDecisions = await runAgainstStore(issuer, dynamo, program);

          expect(dynamoDecisions).toEqual(memoryDecisions);
          expect((await dynamo.collapse(contextId)).distinctFingerprints).toBe(
            (await memory.collapse(contextId)).distinctFingerprints,
          );
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("the guarantee is the base table, not the index", () => {
  it("accept/deny decisions are unaffected by GSI replication lag", async () => {
    const fake = new FakeDynamo();
    fake.enableGsiLag(); // the collapse index will lag behind the base table
    const store = new DynamoClaimStore(fake, TABLE);
    const contextId = "ctx-lag";
    await makeContext(store, contextId);

    const { issuer, authenticators } = setupIssuer(3);
    const program = await buildProgram(issuer, authenticators, contextId, [
      { k: "claim", cred: 0 },
      { k: "claim", cred: 0 }, // duplicate on cred 0
      { k: "claim", cred: 1 },
      { k: "replay", pick: 0 }, // replay the first
      { k: "claim", cred: 2 },
    ]);
    const decisions = await runAgainstStore(issuer, store, program);

    // The base-table conditions decided everything correctly while the GSI was still empty.
    expect(decisions).toEqual(program.map((s) => s.expected));
    expect((await store.collapse(contextId)).distinctFingerprints).toBe(0); // index hasn't caught up

    fake.flushGsi(); // replication catches up
    expect((await store.collapse(contextId)).distinctFingerprints).toBe(expectedDistinct(program));
  });
});

describe("swarm on the dynamo store (via fake)", () => {
  it("collapses a mixed swarm to exactly M with paginated collapse", async () => {
    const { issuer } = setupIssuer(0);
    const store = new DynamoClaimStore(new FakeDynamo(), TABLE);
    const contextId = "ctx-dynamo-swarm";
    await makeContext(store, contextId);

    const summary = await runSwarm(issuer, store, {
      contextId,
      count: 3_000,
      distinctCredentials: 9,
      mode: "mixed",
      seed: 99,
    });
    expect(summary.distinctFingerprints).toBe(9);
    expect(summary.accepted).toBe(9);
  });
});
