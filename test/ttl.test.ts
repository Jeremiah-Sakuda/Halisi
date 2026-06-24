import { describe, expect, it } from "vitest";

import { DynamoClaimStore, type DocClient } from "@/lib/store/DynamoClaimStore";
import { FakeDynamo } from "@/lib/store/fakeDynamo";
import { REDEMPTION_TTL_DAYS, TTL_ATTR } from "@/lib/store/schema";

describe("redemption TTL", () => {
  it("the redemption item carries a TTL ~90 days out; the claim item does not", async () => {
    const fake = new FakeDynamo();
    const captured: Record<string, unknown>[] = [];
    const client: DocClient = {
      async send(command) {
        const input = (command as { input?: { TransactItems?: { Put: { Item: Record<string, unknown> } }[] } }).input;
        for (const op of input?.TransactItems ?? []) captured.push(op.Put.Item);
        return fake.send(command as Parameters<typeof fake.send>[0]);
      },
    };
    const store = new DynamoClaimStore(client, "Halisi");

    const now = 1_700_000_000_000; // fixed ms
    await store.claim({ contextId: "c", fingerprint: "fp", tokenId: "tok", claimId: "id", createdAt: now });

    const redemption = captured.find((i) => String(i.PK).startsWith("REDEMPTION#"));
    const claim = captured.find((i) => String(i.PK).startsWith("CLAIM#"));
    expect(redemption?.[TTL_ATTR]).toBe(Math.floor(now / 1000) + REDEMPTION_TTL_DAYS * 86400);
    expect(claim?.[TTL_ATTR]).toBeUndefined();
  });
});
