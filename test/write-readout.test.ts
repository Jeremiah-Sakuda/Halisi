import { describe, expect, it } from "vitest";

import { newClaimId } from "@/lib/ids";
import { redeem } from "@/lib/claim/redeem";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { DynamoClaimStore } from "@/lib/store/DynamoClaimStore";
import { FakeDynamo } from "@/lib/store/fakeDynamo";
import type { ClaimStore } from "@/lib/store/ClaimStore";
import { forged, genuine, makeContext, setupIssuer } from "./helpers";

const CTX = "ctx-write";

function statuses(write: { conditions: { entity: string; status: string }[] } | undefined) {
  return (write?.conditions ?? []).map((c) => `${c.entity}:${c.status}`);
}

function suite(name: string, makeStore: () => ClaimStore) {
  describe(`write-readout payload — ${name}`, () => {
    it("ACCEPTED carries both conditions ok + committed", async () => {
      const { issuer, authenticators } = setupIssuer(1);
      const store = makeStore();
      await makeContext(store, CTX);
      const out = await redeem(issuer, store, await genuine(issuer, authenticators[0]!, CTX), newClaimId(), 0);
      expect(out.decision).toBe("ACCEPTED");
      expect(out.write?.committed).toBe(true);
      expect(statuses(out.write)).toEqual(["redemption:ok", "claim:ok"]);
    });

    it("DENIED_DUPLICATE_IDENTITY blocks the claim condition, token still ok", async () => {
      const { issuer, authenticators } = setupIssuer(1);
      const store = makeStore();
      await makeContext(store, CTX);
      await redeem(issuer, store, await genuine(issuer, authenticators[0]!, CTX), newClaimId(), 0);
      const dup = await redeem(issuer, store, await genuine(issuer, authenticators[0]!, CTX), newClaimId(), 0);
      expect(dup.decision).toBe("DENIED_DUPLICATE_IDENTITY");
      expect(dup.write?.committed).toBe(false);
      expect(statuses(dup.write)).toEqual(["redemption:ok", "claim:blocked"]);
    });

    it("DENIED_REPLAY blocks the redemption condition", async () => {
      const { issuer, authenticators } = setupIssuer(1);
      const store = makeStore();
      await makeContext(store, CTX);
      const assertion = await genuine(issuer, authenticators[0]!, CTX);
      await redeem(issuer, store, assertion, newClaimId(), 0);
      const replay = await redeem(issuer, store, assertion, newClaimId(), 0);
      expect(replay.decision).toBe("DENIED_REPLAY");
      expect(replay.write?.committed).toBe(false);
      expect(replay.write?.conditions[0]?.status).toBe("blocked");
    });

    it("DENIED_FORGED carries no write — it never reached the table", async () => {
      const { issuer } = setupIssuer(0);
      const store = makeStore();
      await makeContext(store, CTX);
      const out = await redeem(issuer, store, await forged(issuer, CTX), newClaimId(), 0);
      expect(out.decision).toBe("DENIED_FORGED");
      expect(out.write).toBeUndefined();
    });
  });
}

suite("MemoryClaimStore", () => new MemoryClaimStore());
suite("DynamoClaimStore (FakeDynamo)", () => new DynamoClaimStore(new FakeDynamo(), "Halisi"));
