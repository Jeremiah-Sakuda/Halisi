import { newClaimId } from "@/lib/ids";
import type { Assertion } from "@/lib/issuer/Issuer";
import type { SimulatedAuthenticator, SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { fingerprint as fpOf } from "@/lib/hash";
import { redeem } from "@/lib/claim/redeem";
import type { ClaimDecision } from "@/lib/types";
import type { ClaimStore } from "@/lib/store/ClaimStore";
import { RP_ID, forged, genuine } from "./helpers";

/** An abstract action a generated program is built from. */
export type Action =
  | { k: "claim"; cred: number }
  | { k: "replay"; pick: number }
  | { k: "forge" };

/** A concrete, replayable submission plus the canonical decision the invariant demands for it. */
export interface Submission {
  assertion: Assertion;
  claimId: string;
  expected: ClaimDecision;
}

/**
 * Compile an abstract program into concrete submissions, computing the canonical expected decision for
 * each one with a tiny oracle that mirrors the invariant:
 *
 *   - a forged assertion is DENIED_FORGED and changes nothing;
 *   - a fresh token from an unclaimed credential is ACCEPTED (token burned, fingerprint claimed);
 *   - a credential that already claimed is DENIED_DUPLICATE_IDENTITY;
 *   - a token already burned is DENIED_REPLAY.
 *
 * Any correct ClaimStore must reproduce this sequence of decisions exactly.
 */
export async function buildProgram(
  issuer: SimulatedIssuer,
  authenticators: SimulatedAuthenticator[],
  contextId: string,
  actions: Action[],
): Promise<Submission[]> {
  const m = authenticators.length;
  const burned = new Set<string>();
  const claimed = new Set<string>();
  const genuineSubs: Submission[] = [];
  const out: Submission[] = [];

  const decide = (tokenId: string, fingerprint: string): ClaimDecision => {
    if (burned.has(tokenId)) return "DENIED_REPLAY";
    if (claimed.has(fingerprint)) return "DENIED_DUPLICATE_IDENTITY";
    burned.add(tokenId);
    claimed.add(fingerprint);
    return "ACCEPTED";
  };

  for (const action of actions) {
    if (action.k === "forge") {
      out.push({
        assertion: await forged(issuer, contextId),
        claimId: newClaimId(),
        expected: "DENIED_FORGED",
      });
      continue;
    }

    if (action.k === "replay" && genuineSubs.length > 0) {
      const prev = genuineSubs[action.pick % genuineSubs.length]!;
      const fingerprint = fpOf(prev.assertion.credentialId, RP_ID);
      out.push({
        assertion: prev.assertion,
        claimId: newClaimId(),
        expected: decide(prev.assertion.tokenId, fingerprint),
      });
      continue;
    }

    // 'claim', or 'replay' with nothing to replay yet: a genuine assertion from a chosen credential.
    const cred = action.k === "claim" ? action.cred % m : action.pick % m;
    const auth = authenticators[cred]!;
    const assertion = await genuine(issuer, auth, contextId);
    const sub: Submission = {
      assertion,
      claimId: newClaimId(),
      expected: decide(assertion.tokenId, fpOf(auth.credentialId, RP_ID)),
    };
    out.push(sub);
    genuineSubs.push(sub);
  }

  return out;
}

/** The distinct fingerprints a program ends up accepting — the collapse target. */
export function expectedDistinct(submissions: Submission[]): number {
  const fps = new Set<string>();
  for (const s of submissions) {
    if (s.expected === "ACCEPTED") fps.add(fpOf(s.assertion.credentialId, RP_ID));
  }
  return fps.size;
}

/** Run a compiled program against a store, returning the decisions it actually produced. */
export async function runAgainstStore(
  issuer: SimulatedIssuer,
  store: ClaimStore,
  submissions: Submission[],
): Promise<ClaimDecision[]> {
  const decisions: ClaimDecision[] = [];
  for (const sub of submissions) {
    const outcome = await redeem(issuer, store, sub.assertion, sub.claimId, 0);
    decisions.push(outcome.decision);
  }
  return decisions;
}
