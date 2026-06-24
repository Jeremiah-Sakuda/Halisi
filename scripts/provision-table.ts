/**
 * Provision the Halisi single table + GSI1 on real DynamoDB.
 *
 *   AWS_REGION=us-east-1 HALISI_TABLE=Halisi npx tsx scripts/provision-table.ts
 *
 * Idempotent: if the table already exists it reports and exits. Uses the AWS SDK directly, so no AWS
 * CLI is required — only credentials in the standard chain.
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

import { ATTR, GSI1_NAME, TTL_ATTR } from "@/lib/store/schema";

const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.HALISI_TABLE || "Halisi";
const endpoint = process.env.HALISI_DDB_ENDPOINT;

const client = new DynamoDBClient({ region, ...(endpoint ? { endpoint } : {}) });

async function exists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: table }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return false;
    throw error;
  }
}

async function main(): Promise<void> {
  console.log(`Halisi · provision table "${table}" in ${region}${endpoint ? ` (${endpoint})` : ""}`);

  if (await exists()) {
    console.log("→ table already exists; nothing to do.");
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST", // on-demand: pay per request, pennies at demo scale
      AttributeDefinitions: [
        { AttributeName: ATTR.pk, AttributeType: "S" },
        { AttributeName: ATTR.sk, AttributeType: "S" },
        { AttributeName: ATTR.gsi1pk, AttributeType: "S" },
        { AttributeName: ATTR.gsi1sk, AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: ATTR.pk, KeyType: "HASH" },
        { AttributeName: ATTR.sk, KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: GSI1_NAME,
          KeySchema: [
            { AttributeName: ATTR.gsi1pk, KeyType: "HASH" },
            { AttributeName: ATTR.gsi1sk, KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_IMAGE", // fans accepted claims out to the live ledger
      },
    }),
  );

  console.log("→ create requested; waiting for ACTIVE…");
  await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: table });

  // Bound redemption-row growth: TTL reclaims burned tokens (claims carry no TTL and are durable).
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: table,
      TimeToLiveSpecification: { Enabled: true, AttributeName: TTL_ATTR },
    }),
  );

  console.log(`→ table "${table}" is ACTIVE with ${GSI1_NAME}, Streams, and TTL on ${TTL_ATTR}.`);
}

main().catch((error) => {
  console.error("provision failed:", error);
  process.exitCode = 1;
});
