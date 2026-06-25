import {
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
  DescribeStreamCommand,
  type _Record as StreamRecord,
} from "@aws-sdk/client-dynamodb-streams";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { shortFingerprint } from "@/lib/hash";
import { ledger, type LedgerEvent } from "@/lib/ledger";
import { storeKind } from "@/lib/runtime";
import { tableName } from "@/lib/store/client";
import { SK } from "@/lib/store/schema";

/**
 * DynamoDB Streams → live ledger.
 *
 * In production a Lambda is triggered by the stream and fans accepted claims out to the ledger. This
 * module is that consumer, runnable in-process (behind HALISI_STREAMS=on) or as a standalone sidecar
 * (scripts/stream-consumer.ts). Only the insertion of a CLAIM item becomes a ledger event — redemption
 * and context writes are ignored.
 */

/** Turn a stream record into a ledger event, or null if it is not a new CLAIM item. */
export function parseStreamRecord(record: StreamRecord, now: number): LedgerEvent | null {
  if (record.eventName !== "INSERT") return null;
  const image = record.dynamodb?.NewImage;
  if (!image) return null;
  // The stream image is in DynamoDB AttributeValue form; unmarshall to a plain item.
  const item = unmarshall(image as Record<string, AttributeValue>);
  if (item.SK !== SK.claim || typeof item.fp !== "string") return null;
  return {
    contextId: String(item.contextId),
    decision: "ACCEPTED",
    fingerprint: shortFingerprint(item.fp),
    latencyMs: 0,
    at: now,
  };
}

export interface StreamConsumerOptions {
  client: DynamoDBStreamsClient;
  streamArn: string;
  /** Injected for testability; defaults to Date.now in the running consumer. */
  now?: () => number;
}

export class StreamConsumer {
  private readonly client: DynamoDBStreamsClient;
  private readonly streamArn: string;
  private readonly now: () => number;
  private readonly iterators = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: StreamConsumerOptions) {
    this.client = opts.client;
    this.streamArn = opts.streamArn;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Refresh shard iterators (LATEST) for any shards we are not yet tracking. */
  private async refreshShards(): Promise<void> {
    const described = await this.client.send(
      new DescribeStreamCommand({ StreamArn: this.streamArn }),
    );
    for (const shard of described.StreamDescription?.Shards ?? []) {
      if (!shard.ShardId || this.iterators.has(shard.ShardId)) continue;
      const it = await this.client.send(
        new GetShardIteratorCommand({
          StreamArn: this.streamArn,
          ShardId: shard.ShardId,
          ShardIteratorType: "LATEST",
        }),
      );
      if (it.ShardIterator) this.iterators.set(shard.ShardId, it.ShardIterator);
    }
  }

  /** Drain available records from every tracked shard once, publishing accepted claims. */
  async pollOnce(): Promise<number> {
    await this.refreshShards();
    let published = 0;
    for (const [shardId, iterator] of [...this.iterators.entries()]) {
      const out = await this.client.send(new GetRecordsCommand({ ShardIterator: iterator }));
      for (const record of out.Records ?? []) {
        const event = parseStreamRecord(record, this.now());
        if (event) {
          ledger.publish(event);
          published++;
        }
      }
      if (out.NextShardIterator) this.iterators.set(shardId, out.NextShardIterator);
      else this.iterators.delete(shardId); // shard closed
    }
    return published;
  }

  start(intervalMs = 1000): void {
    if (this.timer) return;
    ledger.setStreamsActive(true);
    const tick = () => {
      this.pollOnce().catch((error) => console.error("stream poll failed:", error));
    };
    this.timer = setInterval(tick, intervalMs);
    tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    ledger.setStreamsActive(false);
  }
}

/** Build a Streams client from the environment (same region + optional local endpoint as the table). */
export function makeStreamsClient(): DynamoDBStreamsClient {
  return new DynamoDBStreamsClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.HALISI_DDB_ENDPOINT ? { endpoint: process.env.HALISI_DDB_ENDPOINT } : {}),
  });
}

/**
 * Lazily start the in-process Streams consumer when HALISI_STREAMS=on and the dynamo backend is active.
 * Idempotent and safe to call on every request (e.g. when a ledger subscriber connects). When off, the
 * claim path publishes to the ledger directly, which is the default for the demo.
 */
export async function ensureStreamConsumer(): Promise<void> {
  if (process.env.HALISI_STREAMS !== "on" || storeKind() !== "dynamo") return;
  const g = globalThis as unknown as { __halisiStreamStarted?: boolean };
  if (g.__halisiStreamStarted) return;
  g.__halisiStreamStarted = true;
  try {
    const ddb = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      ...(process.env.HALISI_DDB_ENDPOINT ? { endpoint: process.env.HALISI_DDB_ENDPOINT } : {}),
    });
    const described = await ddb.send(new DescribeTableCommand({ TableName: tableName() }));
    const streamArn = described.Table?.LatestStreamArn;
    if (!streamArn) {
      g.__halisiStreamStarted = false;
      return;
    }
    new StreamConsumer({ client: makeStreamsClient(), streamArn }).start(1000);
  } catch (error) {
    g.__halisiStreamStarted = false;
    console.error("failed to start stream consumer:", error);
  }
}
