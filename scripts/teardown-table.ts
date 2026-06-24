/**
 * Delete the Halisi table (cleanup after a live run).
 *
 *   AWS_REGION=us-east-1 HALISI_TABLE=Halisi npx tsx scripts/teardown-table.ts
 */
import {
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.HALISI_TABLE || "Halisi";

const client = new DynamoDBClient({
  region,
  ...(process.env.HALISI_DDB_ENDPOINT ? { endpoint: process.env.HALISI_DDB_ENDPOINT } : {}),
});

async function main(): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: table }));
    console.log(`→ delete requested for "${table}".`);
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      console.log(`→ table "${table}" does not exist; nothing to do.`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("teardown failed:", error);
  process.exitCode = 1;
});
