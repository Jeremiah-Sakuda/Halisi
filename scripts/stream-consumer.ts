/**
 * Tail the Halisi DynamoDB stream and log each accepted-claim event — the standalone equivalent of the
 * production Lambda that fans Streams out to the live ledger.
 *
 *   AWS_REGION=us-east-1 HALISI_TABLE=Halisi npx tsx scripts/stream-consumer.ts
 *
 * Validates that the stream emits a CLAIM insertion per accepted claim. (The in-process consumer used
 * by the running web app is started automatically when HALISI_STREAMS=on; see src/lib/streams.ts.)
 */
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";

import { parseStreamRecord } from "@/lib/streams";

const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.HALISI_TABLE || "Halisi";

async function main(): Promise<void> {
  const ddb = new DynamoDBClient({ region });
  const described = await ddb.send(new DescribeTableCommand({ TableName: table }));
  const streamArn = described.Table?.LatestStreamArn;
  if (!streamArn) throw new Error(`table "${table}" has no stream enabled`);
  console.log(`tailing stream for "${table}" (${streamArn})`);

  const streams = new DynamoDBStreamsClient({ region });
  const desc = await streams.send(new DescribeStreamCommand({ StreamArn: streamArn }));
  const iterators = new Map<string, string>();
  for (const shard of desc.StreamDescription?.Shards ?? []) {
    if (!shard.ShardId) continue;
    const it = await streams.send(
      new GetShardIteratorCommand({ StreamArn: streamArn, ShardId: shard.ShardId, ShardIteratorType: "LATEST" }),
    );
    if (it.ShardIterator) iterators.set(shard.ShardId, it.ShardIterator);
  }

  // Poll forever, logging accepted-claim events as they arrive.
  for (;;) {
    for (const [shardId, iterator] of [...iterators.entries()]) {
      const out = await streams.send(new GetRecordsCommand({ ShardIterator: iterator }));
      for (const record of out.Records ?? []) {
        const event = parseStreamRecord(record, Date.now());
        if (event) console.log(`accepted ${event.fingerprint} in ${event.contextId}`);
      }
      if (out.NextShardIterator) iterators.set(shardId, out.NextShardIterator);
      else iterators.delete(shardId);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((error) => {
  console.error("stream-consumer failed:", error);
  process.exitCode = 1;
});
