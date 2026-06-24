import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { ledger } from "@/lib/ledger";
import { metrics } from "@/lib/metricsStore";
import { getSimulatedIssuer, getStore } from "@/lib/runtime";
import { type SwarmMode, runSwarm } from "@/lib/harness/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODES: SwarmMode[] = ["genuine", "forged", "replayed", "reused", "mixed"];
const MAX_COUNT = 20_000;

interface Body {
  contextId?: string;
  count?: number;
  distinctCredentials?: number;
  mode?: string;
  seed?: number;
}

/**
 * Fire a sybil swarm at a context: many attempts behind only a handful of real credentials. The store
 * lets at most that handful through, so the swarm collapses. Returns the summary the collapse view
 * animates; publishes the accepted identities to the live ledger.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.contextId)) {
    return badRequest("contextId is required");
  }
  const mode = (body.mode ?? "mixed") as SwarmMode;
  if (!MODES.includes(mode)) {
    return badRequest(`mode must be one of ${MODES.join(", ")}`);
  }
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(body.count ?? 10_000)));
  const distinctCredentials = Math.max(0, Math.floor(body.distinctCredentials ?? 7));

  const store = getStore();
  await store.createContext({
    contextId: body.contextId,
    label: "Swarm context",
    kind: "trial",
    createdAt: Date.now(),
  });

  const summary = await runSwarm(
    getSimulatedIssuer(),
    store,
    { contextId: body.contextId, count, distinctCredentials, mode, seed: body.seed },
    (_, decision, fingerprint) => {
      metrics.record(body.contextId!, decision, 0);
      if (decision === "ACCEPTED" && fingerprint) {
        ledger.publish({
          contextId: body.contextId!,
          decision,
          fingerprint,
          latencyMs: 0,
          at: Date.now(),
        });
      }
    },
  );

  return ok(summary);
}
