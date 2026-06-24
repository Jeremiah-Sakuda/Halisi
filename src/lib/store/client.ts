import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import type { DocClient } from "@/lib/store/DynamoClaimStore";

/**
 * Build a real DynamoDB document client from the environment. The standard AWS credential chain
 * applies (env vars, shared config, or an attached role). HALISI_DDB_ENDPOINT can point at a local
 * DynamoDB-compatible endpoint for offline runs.
 */
export function makeDocClient(): DocClient {
  const base = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.HALISI_DDB_ENDPOINT ? { endpoint: process.env.HALISI_DDB_ENDPOINT } : {}),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  }) as unknown as DocClient;
}

export function tableName(): string {
  return process.env.HALISI_TABLE || "Halisi";
}
