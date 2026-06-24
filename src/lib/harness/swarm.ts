import { newClaimId, newCredentialId } from "@/lib/ids";
import type { Assertion } from "@/lib/issuer/Issuer";
import { SimulatedAuthenticator, type SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { shortFingerprint } from "@/lib/hash";
import { redeem } from "@/lib/claim/redeem";
import { estimateWriteCostUsd, percentile } from "@/lib/metrics";
import type { ClaimDecision } from "@/lib/types";
import type { ClaimStore } from "@/lib/store/ClaimStore";
import { mulberry32, shuffle } from "@/lib/harness/prng";

/**
 * A swarm models the realistic sybil attack: an adversary who truly controls only M credentials tries
 * to mint many claims by forging, replaying, and reusing them. The store lets at most M through, so a
 * flood of `count` attempts collapses to M distinct credentials.
 */
export type SwarmMode = "genuine" | "forged" | "replayed" | "reused" | "mixed";

/** The intent behind a single attempt, surfaced in the per-attempt stream for the collapse view. */
export type AttemptLabel = "genuine" | "forged" | "replayed" | "reused";

export interface SwarmRequest {
  contextId: string;
  count: number;
  /** M — the number of real credentials behind the swarm (the collapse target for adversarial modes). */
  distinctCredentials: number;
  mode: SwarmMode;
  seed?: number;
}

export interface SwarmSummary {
  contextId: string;
  mode: SwarmMode;
  attempts: number;
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  distinctFingerprints: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  totalMs: number;
  estimatedCostUsd: number;
  /** Short fingerprints of the accepted identities — the nodes the swarm collapses onto. */
  acceptedFingerprints: string[];
}

interface PreparedAttempt {
  assertion: Assertion;
  label: AttemptLabel;
}

function makeRegistered(issuer: SimulatedIssuer, m: number): SimulatedAuthenticator[] {
  const auths: SimulatedAuthenticator[] = [];
  for (let i = 0; i < m; i++) {
    const auth = new SimulatedAuthenticator(newCredentialId());
    auth.registerWith(issuer);
    auths.push(auth);
  }
  return auths;
}

/** Build the full attack sequence for a swarm request (deterministic given the seed). */
export async function buildSwarm(
  issuer: SimulatedIssuer,
  req: SwarmRequest,
): Promise<PreparedAttempt[]> {
  const rand = mulberry32(req.seed ?? 0x1a2b3c);
  const m = Math.max(0, Math.min(req.distinctCredentials, req.count));
  const attempts: PreparedAttempt[] = [];

  const genuineFrom = async (auth: SimulatedAuthenticator): Promise<Assertion> =>
    auth.assert(await issuer.issueChallenge(req.contextId));

  if (req.mode === "genuine") {
    // Each attempt is a distinct, freshly registered credential — all accepted.
    for (let i = 0; i < req.count; i++) {
      const auth = new SimulatedAuthenticator(newCredentialId());
      auth.registerWith(issuer);
      attempts.push({ assertion: await genuineFrom(auth), label: "genuine" });
    }
    return attempts;
  }

  if (req.mode === "forged") {
    const strangers = makeStrangers(Math.min(req.count, 32));
    for (let i = 0; i < req.count; i++) {
      const stranger = strangers[i % strangers.length]!;
      const challenge = await issuer.issueChallenge(req.contextId);
      attempts.push({
        assertion: stranger.assert(challenge, { forgeAttestation: true }),
        label: "forged",
      });
    }
    return attempts;
  }

  const registered = makeRegistered(issuer, Math.max(1, m));
  const seeds = await Promise.all(registered.map((a) => genuineFrom(a)));
  // The M genuine seeds are the only attempts that can be accepted.
  for (const assertion of seeds) attempts.push({ assertion, label: "genuine" });

  const noise = req.count - attempts.length;
  for (let i = 0; i < noise; i++) {
    const pick = req.mode === "mixed" ? Math.floor(rand() * 3) : modeChannel(req.mode);
    if (pick === 0) {
      // forged: a credential never registered
      const stranger = makeStrangers(1)[0]!;
      const challenge = await issuer.issueChallenge(req.contextId);
      attempts.push({
        assertion: stranger.assert(challenge, { forgeAttestation: true }),
        label: "forged",
      });
    } else if (pick === 1) {
      // replayed: resubmit one of the genuine seeds (same token)
      attempts.push({ assertion: seeds[Math.floor(rand() * seeds.length)]!, label: "replayed" });
    } else {
      // reused: same credential, a fresh token — duplicate after its seed
      const auth = registered[Math.floor(rand() * registered.length)]!;
      attempts.push({ assertion: await genuineFrom(auth), label: "reused" });
    }
  }

  // Keep the genuine seeds interleaved with the noise so the collapse looks like real traffic.
  return shuffle(attempts, rand);
}

function makeStrangers(n: number): SimulatedAuthenticator[] {
  const out: SimulatedAuthenticator[] = [];
  for (let i = 0; i < n; i++) out.push(new SimulatedAuthenticator(newCredentialId()));
  return out;
}

/** For the single-channel adversarial modes, fix which kind of noise to generate. */
function modeChannel(mode: SwarmMode): 0 | 1 | 2 {
  if (mode === "forged") return 0;
  if (mode === "replayed") return 1;
  return 2; // reused
}

/** Run a prepared swarm against a store, tallying decisions, latency, cost, and the collapse. */
export async function runSwarm(
  issuer: SimulatedIssuer,
  store: ClaimStore,
  req: SwarmRequest,
  onAttempt?: (label: AttemptLabel, decision: ClaimDecision, fingerprint: string | null) => void,
): Promise<SwarmSummary> {
  const attempts = await buildSwarm(issuer, req);
  const latencies: number[] = [];
  const acceptedFps = new Set<string>();
  let accepted = 0;
  let deniedForged = 0;
  let deniedReplay = 0;
  let deniedDuplicate = 0;
  let writeAttempts = 0;

  const t0 = performance.now();
  for (const attempt of attempts) {
    const outcome = await redeem(issuer, store, attempt.assertion, newClaimId(), 0);
    latencies.push(outcome.latencyMs);
    let fp: string | null = null;
    switch (outcome.decision) {
      case "ACCEPTED": {
        accepted++;
        writeAttempts++;
        if (outcome.fingerprint) {
          fp = shortFingerprint(outcome.fingerprint);
          acceptedFps.add(outcome.fingerprint);
        }
        break;
      }
      case "DENIED_REPLAY":
        deniedReplay++;
        writeAttempts++;
        break;
      case "DENIED_DUPLICATE_IDENTITY":
        deniedDuplicate++;
        writeAttempts++;
        break;
      case "DENIED_FORGED":
        deniedForged++;
        break;
    }
    onAttempt?.(attempt.label, outcome.decision, fp);
  }
  const totalMs = performance.now() - t0;

  const collapse = await store.collapse(req.contextId);
  return {
    contextId: req.contextId,
    mode: req.mode,
    attempts: attempts.length,
    accepted,
    deniedForged,
    deniedReplay,
    deniedDuplicate,
    distinctFingerprints: collapse.distinctFingerprints,
    p50LatencyMs: percentile(latencies, 50),
    p99LatencyMs: percentile(latencies, 99),
    totalMs,
    estimatedCostUsd: estimateWriteCostUsd(writeAttempts),
    acceptedFingerprints: [...acceptedFps].map(shortFingerprint),
  };
}
