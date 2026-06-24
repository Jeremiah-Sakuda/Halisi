import { ok } from "@/lib/api";
import { storeKind } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + which backend is wired — handy for verifying a deployment runs on `dynamo`. */
export async function GET() {
  return ok({
    ok: true,
    store: storeKind(),
    region: process.env.AWS_REGION ?? null,
    table: process.env.HALISI_TABLE ?? "Halisi",
  });
}
