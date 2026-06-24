import { describe, expect, it } from "vitest";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import { FakeDynamo } from "@/lib/store/fakeDynamo";

const TABLE = "Halisi";

function put(pk: string, sk: string, extra: Record<string, unknown> = {}) {
  return new PutCommand({ TableName: TABLE, Item: { PK: pk, SK: sk, ...extra } });
}

describe("FakeDynamo", () => {
  it("enforces attribute_not_exists on a conditional put", async () => {
    const db = new FakeDynamo();
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: "A", SK: "X" },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    await expect(
      db.send(
        new PutCommand({
          TableName: TABLE,
          Item: { PK: "A", SK: "X" },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      ),
    ).rejects.toMatchObject({ name: "ConditionalCheckFailedException" });
  });

  it("a transaction is atomic: one failing condition writes nothing", async () => {
    const db = new FakeDynamo();
    await db.send(put("BURNED", "REDEMPTION")); // pre-existing token

    let error: unknown;
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: TABLE, Item: { PK: "BURNED", SK: "REDEMPTION" }, ConditionExpression: "attribute_not_exists(PK)" } },
            { Put: { TableName: TABLE, Item: { PK: "CLAIM#new", SK: "CLAIM" }, ConditionExpression: "attribute_not_exists(PK)" } },
          ],
        }),
      );
    } catch (e) {
      error = e;
    }

    expect((error as { name?: string })?.name).toBe("TransactionCanceledException");
    expect((error as { CancellationReasons?: { Code: string }[] }).CancellationReasons).toEqual([
      { Code: "ConditionalCheckFailed", Message: expect.any(String) },
      { Code: "None" },
    ]);
    // The second item must NOT have been written (atomicity).
    const got = (await db.send(
      new GetCommand({ TableName: TABLE, Key: { PK: "CLAIM#new", SK: "CLAIM" } }),
    )) as { Item?: unknown };
    expect(got.Item).toBeUndefined();
  });

  it("paginates a GSI query across pages", async () => {
    const db = new FakeDynamo();
    for (let i = 0; i < 25; i++) {
      await db.send(
        put(`CLAIM#ctx#fp${i}`, "CLAIM", {
          GSI1PK: "CTX#ctx",
          GSI1SK: `FP#fp${String(i).padStart(3, "0")}`,
          fp: `fp${i}`,
        }),
      );
    }

    const seen = new Set<string>();
    let exclusiveStartKey: Record<string, unknown> | undefined;
    let pages = 0;
    do {
      const out = (await db.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: { ":pk": "CTX#ctx" },
          Limit: 10,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )) as { Items?: Array<{ fp?: string }>; LastEvaluatedKey?: Record<string, unknown> };
      for (const item of out.Items ?? []) seen.add(String(item.fp));
      exclusiveStartKey = out.LastEvaluatedKey;
      pages++;
    } while (exclusiveStartKey);

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
  });

  it("a query only sees GSI-visible items when lag is enabled", async () => {
    const db = new FakeDynamo();
    db.enableGsiLag();
    await db.send(put("CLAIM#ctx#fp1", "CLAIM", { GSI1PK: "CTX#ctx", GSI1SK: "FP#1", fp: "fp1" }));

    const before = (await db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "CTX#ctx" },
      }),
    )) as { Items?: unknown[] };
    expect(before.Items?.length ?? 0).toBe(0); // base written, index lagging

    db.flushGsi();
    const after = (await db.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "CTX#ctx" },
      }),
    )) as { Items?: unknown[] };
    expect(after.Items?.length).toBe(1);
  });
});
