import { newClaimId } from "@/lib/ids";
import type { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { redeem } from "@/lib/claim/redeem";
import { shortFingerprint } from "@/lib/hash";
import type { ClaimOutcome } from "@/lib/types";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { DynamoClaimStore } from "@/lib/store/DynamoClaimStore";
import { FakeDynamo } from "@/lib/store/fakeDynamo";
import { type SwarmRequest, buildSwarm } from "@/lib/harness/swarm";

/**
 * The honest answer to "but the real DynamoDB might behave differently."
 *
 * Build ONE swarm, then run the identical sequence of attempts through TWO engines side by side — the
 * in-process MemoryClaimStore and the real DynamoClaimStore code path over FakeDynamo — comparing the
 * decision on every single attempt. The two engines move in lockstep because they enforce the same
 * invariant, not because the animation is hardcoded. This is NOT a live AWS run; the right engine is the
 * DynamoDB store's actual code (TransactWriteItems, CancellationReasons, collapse Query) over a faithful
 * in-process double.
 */

export interface EngineTally {
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  distinctFingerprints: number;
  acceptedFingerprints: string[];
}

export interface LockstepResult {
  mode: string;
  seed: number;
  count: number;
  distinctCredentials: number;
  total: number;
  matches: number;
  /** Index of the first decision that differed, or -1 if every decision matched. */
  mismatchIndex: number;
  memory: EngineTally;
  dynamo: EngineTally;
}

interface MutableTally {
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  fps: Set<string>;
}

function blank(): MutableTally {
  return { accepted: 0, deniedForged: 0, deniedReplay: 0, deniedDuplicate: 0, fps: new Set() };
}

function record(tally: MutableTally, outcome: ClaimOutcome): void {
  switch (outcome.decision) {
    case "ACCEPTED":
      tally.accepted++;
      if (outcome.fingerprint) tally.fps.add(shortFingerprint(outcome.fingerprint));
      break;
    case "DENIED_FORGED":
      tally.deniedForged++;
      break;
    case "DENIED_REPLAY":
      tally.deniedReplay++;
      break;
    case "DENIED_DUPLICATE_IDENTITY":
      tally.deniedDuplicate++;
      break;
  }
}

export async function runLockstep(issuer: SimulatedIssuer, req: SwarmRequest): Promise<LockstepResult> {
  const attempts = await buildSwarm(issuer, req);

  const memory = new MemoryClaimStore();
  const dynamo = new DynamoClaimStore(new FakeDynamo(), "Halisi");
  const ctx = req.contextId;
  await memory.createContext({ contextId: ctx, label: "Lockstep", kind: "trial", createdAt: 0 });
  await dynamo.createContext({ contextId: ctx, label: "Lockstep", kind: "trial", createdAt: 0 });

  const tallyM = blank();
  const tallyD = blank();
  let matches = 0;
  let mismatchIndex = -1;

  for (let i = 0; i < attempts.length; i++) {
    // The SAME assertion and claim id flow to both engines, so the only variable is the store itself.
    const claimId = newClaimId();
    const assertion = attempts[i]!.assertion;
    const om = await redeem(issuer, memory, assertion, claimId, 0);
    const od = await redeem(issuer, dynamo, assertion, claimId, 0);
    record(tallyM, om);
    record(tallyD, od);
    if (om.decision === od.decision) matches++;
    else if (mismatchIndex < 0) mismatchIndex = i;
  }

  const distinctM = (await memory.collapse(ctx)).distinctFingerprints;
  const distinctD = (await dynamo.collapse(ctx)).distinctFingerprints;

  const finalize = (t: MutableTally, distinct: number): EngineTally => ({
    accepted: t.accepted,
    deniedForged: t.deniedForged,
    deniedReplay: t.deniedReplay,
    deniedDuplicate: t.deniedDuplicate,
    distinctFingerprints: distinct,
    acceptedFingerprints: [...t.fps],
  });

  return {
    mode: req.mode,
    seed: req.seed ?? 0x1a2b3c,
    count: req.count,
    distinctCredentials: req.distinctCredentials,
    total: attempts.length,
    matches,
    mismatchIndex,
    memory: finalize(tallyM, distinctM),
    dynamo: finalize(tallyD, distinctD),
  };
}
