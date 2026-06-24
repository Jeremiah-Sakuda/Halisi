import { ok } from "@/lib/api";
import { metrics } from "@/lib/metricsStore";
import { getStore, storeKind } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Attempts, accepted, the denial breakdown, distinct credentials, write-latency percentiles, cost. */
export async function GET(_request: Request, { params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  const collapse = await getStore().collapse(contextId);
  const stats = metrics.stats(contextId, collapse.distinctFingerprints);
  return ok({ ...stats, store: storeKind(), fingerprints: collapse.fingerprints });
}
