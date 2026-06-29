import { Mutex } from "@/lib/mutex";
import type { CollapseResult, Context } from "@/lib/types";
import {
  buildClaimWrite,
  type ClaimInput,
  type ClaimStore,
  type CreateContextInput,
  type StoreClaimResult,
} from "@/lib/store/ClaimStore";
import { claimPk, redemptionPk } from "@/lib/store/schema";

interface StoredClaim {
  claimId: string;
  fp: string;
  contextId: string;
  createdAt: number;
}

/**
 * MemoryClaimStore — a faithful, zero-dependency model of the DynamoDB invariant. It reproduces the
 * conditional-transaction semantics exactly:
 *
 *   - a single-use token may be redeemed at most once  (REDEMPTION#<tokenId>, attribute_not_exists);
 *   - a credential may hold at most one claim per context (CLAIM#<ctx>#<fp>, attribute_not_exists);
 *   - both conditions commit or fail together — no state where the token is burned but no claim landed.
 *
 * The cancellation precedence matches DynamoDB's: a replay (the token already exists) is reported as
 * DENIED_REPLAY even though the duplicate claim would also fail; a credential reusing a fresh token is
 * reported as DENIED_DUPLICATE_IDENTITY. The property suite proves this store and the real DynamoDB
 * store produce identical decisions on every sequence.
 */
export class MemoryClaimStore implements ClaimStore {
  private readonly contexts = new Map<string, Context>();
  private readonly redemptions = new Set<string>();
  /** contextId -> (fingerprint -> claim). One claim per (context, fingerprint). */
  private readonly claimsByContext = new Map<string, Map<string, StoredClaim>>();
  private readonly lock = new Mutex();

  async createContext(input: CreateContextInput): Promise<Context> {
    const existing = this.contexts.get(input.contextId);
    if (existing) return existing;
    const ctx: Context = {
      contextId: input.contextId,
      label: input.label,
      kind: input.kind,
      createdAt: input.createdAt,
    };
    this.contexts.set(ctx.contextId, ctx);
    return ctx;
  }

  async getContext(contextId: string): Promise<Context | null> {
    return this.contexts.get(contextId) ?? null;
  }

  async claim(input: ClaimInput): Promise<StoreClaimResult> {
    return this.lock.run(async () => {
      // A real async boundary so the lock is doing real work under concurrency.
      await Promise.resolve();

      const keys = {
        redemption: redemptionPk(input.tokenId),
        claim: claimPk(input.contextId, input.fingerprint),
      };
      const bucket = this.claimsByContext.get(input.contextId);
      // Evaluate both conditions, exactly as the DynamoDB transaction reports them.
      const tokenExists = this.redemptions.has(input.tokenId);
      const claimExists = bucket?.has(input.fingerprint) ?? false;

      // Condition (a): the single-use token must not already be redeemed.
      if (tokenExists) {
        return {
          decision: "DENIED_REPLAY",
          claimId: input.claimId,
          write: buildClaimWrite(keys, false, !claimExists, false),
        };
      }

      // Condition (b): this credential must not already hold a claim in this context.
      if (claimExists) {
        return {
          decision: "DENIED_DUPLICATE_IDENTITY",
          claimId: input.claimId,
          write: buildClaimWrite(keys, true, false, false),
        };
      }

      // Both conditions pass: commit the redemption and the claim atomically.
      this.redemptions.add(input.tokenId);
      const target = bucket ?? new Map<string, StoredClaim>();
      if (!bucket) this.claimsByContext.set(input.contextId, target);
      target.set(input.fingerprint, {
        claimId: input.claimId,
        fp: input.fingerprint,
        contextId: input.contextId,
        createdAt: input.createdAt,
      });
      return {
        decision: "ACCEPTED",
        claimId: input.claimId,
        write: buildClaimWrite(keys, true, true, true),
      };
    });
  }

  async collapse(contextId: string): Promise<CollapseResult> {
    const bucket = this.claimsByContext.get(contextId);
    const fingerprints = bucket ? [...bucket.keys()] : [];
    return {
      contextId,
      distinctFingerprints: fingerprints.length,
      fingerprints,
    };
  }
}
