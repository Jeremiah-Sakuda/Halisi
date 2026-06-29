/**
 * Halisi domain types.
 *
 * The product protects an ABUNDANT action — one vote, one trial, one signup. There is no finite pool
 * behind a claim; the only thing rationed is identity itself: at most one durable claim per attested
 * credential per context.
 */

/** The kind of abundant action a context represents. None of these is a scarce good. */
export type ContextKind = "vote" | "trial" | "signup" | "review" | "allocation";

/** An abundant-action definition. Creating one does not allocate or reserve anything. */
export interface Context {
  contextId: string;
  label: string;
  kind: ContextKind;
  createdAt: number;
}

/**
 * The outcome of a claim attempt, as seen by the application.
 *
 * - ACCEPTED                    — exactly one durable identity recorded for (credential, context).
 * - DENIED_FORGED               — the assertion did not verify; it never reached the database.
 * - DENIED_REPLAY               — the single-use token was already redeemed (burned at the write).
 * - DENIED_DUPLICATE_IDENTITY   — this credential already holds a claim in this context.
 */
export type ClaimDecision =
  | "ACCEPTED"
  | "DENIED_FORGED"
  | "DENIED_REPLAY"
  | "DENIED_DUPLICATE_IDENTITY";

/**
 * One condition inside the redemption transaction. `ok` = the `attribute_not_exists` condition held;
 * `blocked` = it failed (ConditionalCheckFailed) — which is what decides DENIED_REPLAY vs
 * DENIED_DUPLICATE_IDENTITY. Surfaced so the demo can render the real per-write decision.
 */
export interface WriteCondition {
  entity: "redemption" | "claim";
  key: string;
  condition: string;
  status: "ok" | "blocked";
}

/** The actual `TransactWriteItems` the store ran, for the on-screen write-readout. */
export interface ClaimWrite {
  operation: "TransactWriteItems";
  conditions: WriteCondition[];
  committed: boolean;
}

/** A decision plus the evidence the demo surfaces: which claim, how fast, and the real write. */
export interface ClaimOutcome {
  decision: ClaimDecision;
  contextId: string;
  /** Present only when ACCEPTED. */
  claimId?: string;
  /** The verified credential fingerprint, when the assertion verified (accepted or denied at write). */
  fingerprint?: string;
  /** Wall-clock time spent inside the store's conditional write, in milliseconds. */
  latencyMs: number;
  /** The two-condition transaction that produced the decision. Absent when the assertion was forged. */
  write?: ClaimWrite;
}

/** The result of the collapse query: a swarm of attempts reduced to its distinct credentials. */
export interface CollapseResult {
  contextId: string;
  /** Number of distinct attested credentials that hold a claim in this context. */
  distinctFingerprints: number;
  /** The fingerprint hashes themselves (for the live ledger / collapse view). */
  fingerprints: string[];
}

/** Aggregate stats for a context. DB-derived facts plus process-level attempt/latency telemetry. */
export interface ContextStats {
  contextId: string;
  attempts: number;
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  distinctFingerprints: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  /** Rough AWS write cost for the accepted+denied write attempts, in USD. */
  estimatedCostUsd: number;
}
