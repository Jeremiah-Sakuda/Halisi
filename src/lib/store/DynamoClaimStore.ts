import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import type { CollapseResult, Context } from "@/lib/types";
import type {
  ClaimInput,
  ClaimStore,
  CreateContextInput,
  StoreClaimResult,
} from "@/lib/store/ClaimStore";
import {
  ATTR,
  GSI1_NAME,
  SK,
  TTL_ATTR,
  claimGsi1Sk,
  claimPk,
  collapseGsi1Pk,
  contextPk,
  redemptionPk,
  redemptionTtl,
} from "@/lib/store/schema";

/** Just the one method DynamoClaimStore needs — satisfied by a real DocumentClient or the fake. */
export interface DocClient {
  send(command: unknown): Promise<unknown>;
}

interface CancellationReason {
  Code?: string;
}

function isTransactionCanceled(error: unknown): error is { CancellationReasons?: CancellationReason[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "TransactionCanceledException"
  );
}

/**
 * DynamoClaimStore — the invariant on real Amazon DynamoDB.
 *
 * The decisive operation is `claim`: one conditional TransactWriteItems that burns the single-use
 * token and writes the one-per-credential claim, both `attribute_not_exists`. The transaction's
 * CancellationReasons distinguish a replayed token (item 0 failed) from a duplicate identity (item 1
 * failed). The collapse is a single GSI1 Query, paginated, never a scan.
 */
export class DynamoClaimStore implements ClaimStore {
  constructor(
    private readonly client: DocClient,
    private readonly table: string,
  ) {}

  async createContext(input: CreateContextInput): Promise<Context> {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          [ATTR.pk]: contextPk(input.contextId),
          [ATTR.sk]: SK.context,
          contextId: input.contextId,
          label: input.label,
          kind: input.kind,
          createdAt: input.createdAt,
        },
      }),
    );
    return {
      contextId: input.contextId,
      label: input.label,
      kind: input.kind,
      createdAt: input.createdAt,
    };
  }

  async getContext(contextId: string): Promise<Context | null> {
    const out = (await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { [ATTR.pk]: contextPk(contextId), [ATTR.sk]: SK.context },
      }),
    )) as { Item?: Record<string, unknown> };
    if (!out.Item) return null;
    return {
      contextId: String(out.Item.contextId),
      label: String(out.Item.label),
      kind: out.Item.kind as Context["kind"],
      createdAt: Number(out.Item.createdAt),
    };
  }

  async claim(input: ClaimInput): Promise<StoreClaimResult> {
    const command = new TransactWriteCommand({
      TransactItems: [
        {
          // (a) burn the single-use token
          Put: {
            TableName: this.table,
            Item: {
              [ATTR.pk]: redemptionPk(input.tokenId),
              [ATTR.sk]: SK.redemption,
              tokenId: input.tokenId,
              redeemedAt: input.createdAt,
              // TTL bounds redemption-row growth; claims (the durable record) carry no TTL.
              [TTL_ATTR]: redemptionTtl(input.createdAt),
            },
            ConditionExpression: `attribute_not_exists(${ATTR.pk})`,
          },
        },
        {
          // (b) record one claim per credential per context
          Put: {
            TableName: this.table,
            Item: {
              [ATTR.pk]: claimPk(input.contextId, input.fingerprint),
              [ATTR.sk]: SK.claim,
              [ATTR.gsi1pk]: collapseGsi1Pk(input.contextId),
              [ATTR.gsi1sk]: claimGsi1Sk(input.fingerprint, input.claimId),
              claimId: input.claimId,
              fp: input.fingerprint,
              contextId: input.contextId,
              createdAt: input.createdAt,
              ...(input.metadata ? { meta: input.metadata } : {}),
            },
            ConditionExpression: `attribute_not_exists(${ATTR.pk})`,
          },
        },
      ],
    });

    try {
      await this.client.send(command);
      return { decision: "ACCEPTED", claimId: input.claimId };
    } catch (error) {
      if (isTransactionCanceled(error)) {
        const reasons = error.CancellationReasons ?? [];
        // Token already burned takes precedence: it is the defining feature of a replay.
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          return { decision: "DENIED_REPLAY", claimId: input.claimId };
        }
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          return { decision: "DENIED_DUPLICATE_IDENTITY", claimId: input.claimId };
        }
      }
      throw error;
    }
  }

  async collapse(contextId: string): Promise<CollapseResult> {
    const fingerprints = new Set<string>();
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const out = (await this.client.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: GSI1_NAME,
          KeyConditionExpression: `${ATTR.gsi1pk} = :pk`,
          ExpressionAttributeValues: { ":pk": collapseGsi1Pk(contextId) },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )) as { Items?: Array<{ fp?: unknown }>; LastEvaluatedKey?: Record<string, unknown> };

      for (const item of out.Items ?? []) {
        if (item.fp != null) fingerprints.add(String(item.fp));
      }
      exclusiveStartKey = out.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return {
      contextId,
      distinctFingerprints: fingerprints.size,
      fingerprints: [...fingerprints],
    };
  }
}
