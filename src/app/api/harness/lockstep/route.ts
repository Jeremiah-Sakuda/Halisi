import { badRequest, ok, readJson } from "@/lib/api";
import { getSimulatedIssuer } from "@/lib/runtime";
import type { SwarmMode } from "@/lib/harness/swarm";
import { runLockstep } from "@/lib/harness/lockstep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODES: SwarmMode[] = ["genuine", "forged", "replayed", "reused", "mixed"];
const MAX_COUNT = 10_000;

interface Body {
  count?: number;
  distinctCredentials?: number;
  mode?: string;
  seed?: number;
}

/**
 * Run one swarm through both engines (MemoryClaimStore and the DynamoDB code path over FakeDynamo) and
 * report how many decisions matched. Always a fresh, in-process comparison — never a live AWS call.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  const mode = (body?.mode ?? "mixed") as SwarmMode;
  if (!MODES.includes(mode)) return badRequest(`mode must be one of ${MODES.join(", ")}`);

  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(body?.count ?? 10_000)));
  const distinctCredentials = Math.max(0, Math.floor(body?.distinctCredentials ?? 3));

  const result = await runLockstep(getSimulatedIssuer(), {
    contextId: `lockstep-${body?.seed ?? 0}-${count}-${distinctCredentials}-${mode}`,
    count,
    distinctCredentials,
    mode,
    seed: body?.seed,
  });

  return ok(result);
}
