import type { CollapseResult, Context, ContextKind } from "@/lib/types";

/**
 * The ClaimStore is the seam that expresses Halisi's invariant. Two implementations live behind it —
 * an in-process engine and real Amazon DynamoDB — and the property suite proves they are behaviorally
 * indistinguishable. The application code above this interface is identical on both.
 *
 * The decisive guarantee lives in `claim`: a single atomic conditional write that burns a single-use
 * token AND records one-claim-per-credential-per-context, succeeding or failing together.
 */

export interface CreateContextInput {
  contextId: string;
  label: string;
  kind: ContextKind;
  createdAt: number;
}

/**
 * Input to a redemption. By the time we are here, the assertion has already been verified by the
 * Issuer and a fingerprint derived — a forged token never reaches the store.
 */
export interface ClaimInput {
  contextId: string;
  /** The verified credential-fingerprint hash (the identity anchor). */
  fingerprint: string;
  /** The single-use redemption key (the verified token id). */
  tokenId: string;
  /** Client-generated claim id (idempotent; no read-before-write). */
  claimId: string;
  createdAt: number;
}

/** Only the store-level outcomes. Forgery is decided above the store, by the Issuer. */
export type StoreDecision =
  | "ACCEPTED"
  | "DENIED_REPLAY"
  | "DENIED_DUPLICATE_IDENTITY";

export interface StoreClaimResult {
  decision: StoreDecision;
  claimId: string;
}

export interface ClaimStore {
  /** Idempotently record an abundant-action definition. */
  createContext(input: CreateContextInput): Promise<Context>;

  getContext(contextId: string): Promise<Context | null>;

  /**
   * Redeem a verified token for a claim. Atomic: burns REDEMPTION#<tokenId> and writes
   * CLAIM#<context>#<fingerprint>, both conditional on non-existence, in one transaction.
   */
  claim(input: ClaimInput): Promise<StoreClaimResult>;

  /**
   * The collapse query: reduce every accepted claim in a context to its distinct credentials.
   * A single index Query, never a scan. The count IS the number of real humans behind the swarm.
   */
  collapse(contextId: string): Promise<CollapseResult>;

  /** Release any held resources (DynamoDB client sockets, etc.). Optional. */
  close?(): Promise<void>;
}
