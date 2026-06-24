/**
 * Standalone swarm benchmark against the configured store.
 *
 *   npx tsx scripts/swarm-bench.ts                       # memory
 *   HALISI_STORE=dynamo AWS_REGION=us-east-1 npm run swarm
 *   SWARM_COUNT=10000 SWARM_M=7 SWARM_MODE=mixed npm run swarm
 */
import { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { type SwarmMode, runSwarm } from "@/lib/harness/swarm";
import { formatCostUsd } from "@/lib/metrics";
import { getStore, storeKind } from "@/lib/runtime";

const count = Number(process.env.SWARM_COUNT || 10_000);
const m = Number(process.env.SWARM_M || 7);
const mode = (process.env.SWARM_MODE || "mixed") as SwarmMode;

async function main(): Promise<void> {
  const store = getStore();
  const issuer = new SimulatedIssuer();
  const contextId = `bench-${mode}`;
  await store.createContext({ contextId, label: "Bench", kind: "trial", createdAt: Date.now() });

  console.log(`swarm: ${count} ${mode} attempts behind ${m} credentials on store=${storeKind()}`);
  const summary = await runSwarm(issuer, store, { contextId, count, distinctCredentials: m, mode, seed: 2026 });

  console.log({
    attempts: summary.attempts,
    accepted: summary.accepted,
    distinct: summary.distinctFingerprints,
    deniedForged: summary.deniedForged,
    deniedReplay: summary.deniedReplay,
    deniedDuplicate: summary.deniedDuplicate,
    p50: `${summary.p50LatencyMs.toFixed(2)}ms`,
    p99: `${summary.p99LatencyMs.toFixed(2)}ms`,
    totalMs: Math.round(summary.totalMs),
    cost: formatCostUsd(summary.estimatedCostUsd),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
