import { randomUUID } from "node:crypto";

import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { getStore, storeKind } from "@/lib/runtime";
import type { ContextKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: ContextKind[] = ["vote", "trial", "signup", "review", "allocation"];

interface Body {
  label?: string;
  kind?: string;
  contextId?: string;
}

/** Create an abundant-action definition. Creating one allocates nothing — it just names the action. */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.label)) {
    return badRequest("label is required");
  }
  const kind = (body.kind ?? "vote") as ContextKind;
  if (!KINDS.includes(kind)) {
    return badRequest(`kind must be one of ${KINDS.join(", ")}`);
  }

  const contextId = isNonEmptyString(body.contextId) ? body.contextId : randomUUID();
  const context = await getStore().createContext({
    contextId,
    label: body.label,
    kind,
    createdAt: Date.now(),
  });

  return ok({ context, store: storeKind() }, { status: 201 });
}
