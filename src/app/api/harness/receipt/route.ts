import { badRequest, ok, readJson } from "@/lib/api";
import { getSimulatedIssuer } from "@/lib/runtime";
import { rpId } from "@/lib/issuer/serverSecret";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import type { SwarmMode } from "@/lib/harness/swarm";
import { buildSignedReceipt, runReceiptSwarm } from "@/lib/receipt";

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
 * Run a swarm and return a signed, offline-verifiable receipt. The swarm runs on a fresh in-process
 * engine so the receipt is self-contained; verify it anywhere with `node scripts/verify-receipt.mjs`.
 */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  const mode = (body?.mode ?? "mixed") as SwarmMode;
  if (!MODES.includes(mode)) return badRequest(`mode must be one of ${MODES.join(", ")}`);

  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(body?.count ?? 10_000)));
  const distinctCredentials = Math.max(0, Math.floor(body?.distinctCredentials ?? 3));
  const req = {
    contextId: `receipt-${body?.seed ?? 0}-${count}-${distinctCredentials}-${mode}`,
    count,
    distinctCredentials,
    mode,
    seed: body?.seed,
  };

  const issuer = getSimulatedIssuer();
  const { attempts, collapse } = await runReceiptSwarm(issuer, new MemoryClaimStore(), req);
  const receipt = buildSignedReceipt(req, rpId(), attempts, collapse, Date.now());

  return ok(receipt, {
    headers: { "Content-Disposition": 'attachment; filename="halisi-receipt.json"' },
  });
}
