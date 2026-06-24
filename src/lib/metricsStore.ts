import { estimateWriteCostUsd, percentile } from "@/lib/metrics";
import type { ClaimDecision, ContextStats } from "@/lib/types";

/**
 * Process-level telemetry per context: attempts, the denial breakdown, and a bounded sample of write
 * latencies for percentiles. DB-derived facts (accepted, distinct credentials) come from the store's
 * collapse query; this layer adds the attempt/latency story the live readouts show.
 *
 * In production these would be derived from CloudWatch + Streams; here they are aggregated in process,
 * which is all the demo's readouts need.
 */
const MAX_SAMPLES = 5000;

interface Bucket {
  attempts: number;
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  writeAttempts: number;
  latencies: number[];
}

function emptyBucket(): Bucket {
  return {
    attempts: 0,
    accepted: 0,
    deniedForged: 0,
    deniedReplay: 0,
    deniedDuplicate: 0,
    writeAttempts: 0,
    latencies: [],
  };
}

class MetricsStore {
  private readonly buckets = new Map<string, Bucket>();

  private bucket(contextId: string): Bucket {
    let b = this.buckets.get(contextId);
    if (!b) {
      b = emptyBucket();
      this.buckets.set(contextId, b);
    }
    return b;
  }

  record(contextId: string, decision: ClaimDecision, latencyMs: number): void {
    const b = this.bucket(contextId);
    b.attempts++;
    if (decision === "ACCEPTED") b.accepted++;
    else if (decision === "DENIED_FORGED") b.deniedForged++;
    else if (decision === "DENIED_REPLAY") b.deniedReplay++;
    else if (decision === "DENIED_DUPLICATE_IDENTITY") b.deniedDuplicate++;

    if (decision !== "DENIED_FORGED") {
      b.writeAttempts++;
      if (b.latencies.length < MAX_SAMPLES) b.latencies.push(latencyMs);
    }
  }

  stats(contextId: string, distinctFingerprints: number): ContextStats {
    const b = this.buckets.get(contextId) ?? emptyBucket();
    return {
      contextId,
      attempts: b.attempts,
      accepted: b.accepted,
      deniedForged: b.deniedForged,
      deniedReplay: b.deniedReplay,
      deniedDuplicate: b.deniedDuplicate,
      distinctFingerprints,
      p50LatencyMs: percentile(b.latencies, 50),
      p99LatencyMs: percentile(b.latencies, 99),
      estimatedCostUsd: estimateWriteCostUsd(b.writeAttempts),
    };
  }
}

const g = globalThis as unknown as { __halisiMetrics?: MetricsStore };
export const metrics: MetricsStore = g.__halisiMetrics ?? (g.__halisiMetrics = new MetricsStore());
