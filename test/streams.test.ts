import { marshall } from "@aws-sdk/util-dynamodb";
import type { _Record as StreamRecord } from "@aws-sdk/client-dynamodb-streams";
import { describe, expect, it } from "vitest";

import { shortFingerprint } from "@/lib/hash";
import { parseStreamRecord } from "@/lib/streams";
import { claimGsi1Sk, claimPk, collapseGsi1Pk, redemptionPk } from "@/lib/store/schema";

function insert(image: Record<string, unknown>): StreamRecord {
  return {
    eventName: "INSERT",
    dynamodb: { NewImage: marshall(image) as never },
  };
}

describe("parseStreamRecord", () => {
  it("turns a new CLAIM item into an accepted ledger event", () => {
    const fp = "a".repeat(64);
    const event = parseStreamRecord(
      insert({
        PK: claimPk("ctx-1", fp),
        SK: "CLAIM",
        GSI1PK: collapseGsi1Pk("ctx-1"),
        GSI1SK: claimGsi1Sk(fp, "claim-1"),
        claimId: "claim-1",
        fp,
        contextId: "ctx-1",
        createdAt: 123,
      }),
      999,
    );
    expect(event).toEqual({
      contextId: "ctx-1",
      decision: "ACCEPTED",
      fingerprint: shortFingerprint(fp),
      latencyMs: 0,
      at: 999,
    });
  });

  it("ignores redemption-token writes", () => {
    expect(
      parseStreamRecord(insert({ PK: redemptionPk("tok"), SK: "REDEMPTION", tokenId: "tok" }), 1),
    ).toBeNull();
  });

  it("ignores non-INSERT events", () => {
    const fp = "b".repeat(64);
    const record = insert({ PK: claimPk("c", fp), SK: "CLAIM", fp, contextId: "c" });
    expect(parseStreamRecord({ ...record, eventName: "MODIFY" }, 1)).toBeNull();
  });

  it("ignores records with no new image", () => {
    expect(parseStreamRecord({ eventName: "INSERT", dynamodb: {} }, 1)).toBeNull();
  });
});
