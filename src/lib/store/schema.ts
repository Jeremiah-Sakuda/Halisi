/**
 * Single-table DynamoDB layout for Halisi.
 *
 * One table, three entity types discriminated by PK/SK. One global secondary index, GSI1, powers the
 * collapse query: every accepted claim in a context lands under the same GSI1 partition, so a single
 * Query returns one item per distinct credential — the collapse, never a scan.
 *
 *   Entity      PK                          SK            GSI1PK              GSI1SK
 *   ─────────────────────────────────────────────────────────────────────────────────────────────
 *   Context     CTX#<contextId>             CTX           —                   —
 *   Redemption  REDEMPTION#<tokenId>        REDEMPTION    —                   —
 *   Claim       CLAIM#<contextId>#<fp>      CLAIM         CTX#<contextId>     FP#<fp>#<claimId>
 *
 * The guarantee is the base table only: REDEMPTION#<tokenId> enforces single use, CLAIM#<ctx>#<fp>
 * enforces one-per-credential-per-context. GSI1 is eventually consistent and is used purely for the
 * collapse view — never to decide accept/deny.
 */

export const ATTR = {
  pk: "PK",
  sk: "SK",
  gsi1pk: "GSI1PK",
  gsi1sk: "GSI1SK",
} as const;

export const GSI1_NAME = "GSI1";

/** DynamoDB TTL attribute (epoch seconds). Only redemption tokens carry it — claims are durable. */
export const TTL_ATTR = "expiresAt";

/** How long a burned redemption token lingers before TTL reclaims it. Long enough to defeat any replay. */
export const REDEMPTION_TTL_DAYS = 90;

/** Compute the TTL epoch-seconds value for a write happening at `nowMs`. */
export function redemptionTtl(nowMs: number): number {
  return Math.floor(nowMs / 1000) + REDEMPTION_TTL_DAYS * 24 * 60 * 60;
}

export const SK = {
  context: "CTX",
  redemption: "REDEMPTION",
  claim: "CLAIM",
} as const;

export function contextPk(contextId: string): string {
  return `CTX#${contextId}`;
}

export function redemptionPk(tokenId: string): string {
  return `REDEMPTION#${tokenId}`;
}

export function claimPk(contextId: string, fingerprint: string): string {
  return `CLAIM#${contextId}#${fingerprint}`;
}

export function collapseGsi1Pk(contextId: string): string {
  return `CTX#${contextId}`;
}

export function claimGsi1Sk(fingerprint: string, claimId: string): string {
  return `FP#${fingerprint}#${claimId}`;
}

/** Item shapes (the attributes actually written), for typed marshalling. */
export interface ContextItem {
  PK: string;
  SK: "CTX";
  contextId: string;
  label: string;
  kind: string;
  createdAt: number;
}

export interface RedemptionItem {
  PK: string;
  SK: "REDEMPTION";
  tokenId: string;
  redeemedAt: number;
}

export interface ClaimItem {
  PK: string;
  SK: "CLAIM";
  GSI1PK: string;
  GSI1SK: string;
  claimId: string;
  fp: string;
  contextId: string;
  createdAt: number;
}
