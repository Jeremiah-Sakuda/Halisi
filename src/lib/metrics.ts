/**
 * Latency percentiles and a transparent AWS write-cost estimate for the live readouts.
 */

/** The p-th percentile (0–100) of a set of latency samples, via nearest-rank. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

/**
 * DynamoDB on-demand pricing (us-east-1 standard tables): $1.25 per million write request units.
 * Each claim is a TransactWriteItems over two small (<1 KB) items; a transactional write costs 2 WRU
 * per item, so 2 items × 2 = 4 WRU per attempt that reaches the table. A conditional failure
 * (replay / duplicate) still consumes capacity; a forged assertion never reaches the table, so it
 * costs nothing.
 */
export const WRU_PER_CLAIM_TRANSACTION = 4;
export const USD_PER_WRU = 1.25 / 1_000_000;

/** Estimated USD for the write attempts that actually reached DynamoDB. */
export function estimateWriteCostUsd(writeAttempts: number): number {
  return writeAttempts * WRU_PER_CLAIM_TRANSACTION * USD_PER_WRU;
}

/** Format a tiny dollar amount the way the demo shows it (always reads as pennies, never "$0.00"). */
export function formatCostUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(2)}`;
}
