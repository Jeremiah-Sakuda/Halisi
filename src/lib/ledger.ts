import type { ClaimDecision } from "@/lib/types";

/**
 * The live ledger: a per-context, in-process pub/sub that fans claim events out to the collapse view.
 *
 * In production this is fed by DynamoDB Streams (an accepted/denied write fans out to a consumer). In
 * the demo the claim path publishes directly, so the SSE feed works with no extra infrastructure. The
 * shape is identical either way, so the UI does not know or care which is wired up.
 */
export interface LedgerEvent {
  contextId: string;
  decision: ClaimDecision;
  /** Short fingerprint of the accepted identity (present only when ACCEPTED). */
  fingerprint?: string;
  latencyMs: number;
  at: number;
}

type Listener = (event: LedgerEvent) => void;

class Ledger {
  private readonly listeners = new Map<string, Set<Listener>>();
  /** Running distinct-fingerprint set per context, so a late subscriber can render the collapse count. */
  private readonly distinct = new Map<string, Set<string>>();
  /** When a Streams consumer owns the feed, the claim path stops publishing to avoid duplicates. */
  private streamsActive = false;

  /** A Streams consumer calls this on start to become the source of truth for the feed. */
  setStreamsActive(active: boolean): void {
    this.streamsActive = active;
  }

  get streamsOwned(): boolean {
    return this.streamsActive;
  }

  /**
   * Publish from the claim path. A no-op when a Streams consumer owns the feed — in that mode the
   * accepted-claim event arrives via DynamoDB Streams instead, exactly as it would in production.
   */
  publishFromClaim(event: LedgerEvent): void {
    if (this.streamsActive) return;
    this.publish(event);
  }

  subscribe(contextId: string, listener: Listener): () => void {
    let set = this.listeners.get(contextId);
    if (!set) {
      set = new Set();
      this.listeners.set(contextId, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  publish(event: LedgerEvent): void {
    if (event.decision === "ACCEPTED" && event.fingerprint) {
      let set = this.distinct.get(event.contextId);
      if (!set) {
        set = new Set();
        this.distinct.set(event.contextId, set);
      }
      set.add(event.fingerprint);
    }
    for (const listener of this.listeners.get(event.contextId) ?? []) listener(event);
  }

  distinctCount(contextId: string): number {
    return this.distinct.get(contextId)?.size ?? 0;
  }
}

/** Survive Next.js hot-reload / route module duplication by stashing the ledger on globalThis. */
const g = globalThis as unknown as { __halisiLedger?: Ledger };
export const ledger: Ledger = g.__halisiLedger ?? (g.__halisiLedger = new Ledger());
