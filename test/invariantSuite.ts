import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ClaimStore } from "@/lib/store/ClaimStore";
import { makeContext, setupIssuer } from "./helpers";
import { type Action, buildProgram, expectedDistinct, runAgainstStore } from "./program";

/**
 * THE SPEC, as a reusable suite.
 *
 * For any sequence of issue / redeem / replay / forge / reuse actions, a ClaimStore must enforce:
 *
 *   1. at most one accepted claim per (credential, context);
 *   2. each single-use token redeemed at most once;
 *   3. a forged assertion is never accepted and never writes;
 *   4. the collapse query equals the number of distinct credentials actually accepted;
 *   5. the store's decisions match the canonical oracle exactly.
 *
 * Every ClaimStore implementation is held to this identical suite.
 */

export const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ k: fc.constant<"claim">("claim"), cred: fc.nat({ max: 1000 }) }),
  fc.record({ k: fc.constant<"replay">("replay"), pick: fc.nat({ max: 1000 }) }),
  fc.record({ k: fc.constant<"forge">("forge") }),
);

export const arbProgram = fc.record({
  m: fc.integer({ min: 1, max: 5 }),
  actions: fc.array(arbAction, { maxLength: 40 }),
});

export function invariantSuite(name: string, makeStore: () => ClaimStore): void {
  describe(`invariant — ${name}`, () => {
    it("reproduces the canonical decision for every action", async () => {
      await fc.assert(
        fc.asyncProperty(arbProgram, async ({ m, actions }) => {
          const { issuer, authenticators } = setupIssuer(m);
          const store = makeStore();
          const contextId = "ctx-prop";
          await makeContext(store, contextId);

          const program = await buildProgram(issuer, authenticators, contextId, actions);
          const decisions = await runAgainstStore(issuer, store, program);

          // (5) decisions match the oracle exactly.
          expect(decisions).toEqual(program.map((s) => s.expected));

          // (3) forged assertions are never accepted.
          for (let i = 0; i < program.length; i++) {
            if (program[i]!.expected === "DENIED_FORGED") {
              expect(decisions[i]).toBe("DENIED_FORGED");
            }
          }

          // (1)+(4) the collapse equals the distinct accepted credentials, and never exceeds M.
          const collapse = await store.collapse(contextId);
          const distinct = expectedDistinct(program);
          expect(collapse.distinctFingerprints).toBe(distinct);
          expect(collapse.distinctFingerprints).toBeLessThanOrEqual(m);

          // (1) one accepted claim per distinct fingerprint.
          const accepted = decisions.filter((d) => d === "ACCEPTED").length;
          expect(accepted).toBe(distinct);

          // (2) every accepted token is unique (no token accepted twice).
          const acceptedTokens = program
            .filter((s) => s.expected === "ACCEPTED")
            .map((s) => s.assertion.tokenId);
          expect(new Set(acceptedTokens).size).toBe(acceptedTokens.length);
        }),
        { numRuns: 100 },
      );
    });
  });
}
