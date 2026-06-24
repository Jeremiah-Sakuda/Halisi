import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { getWebAuthnIssuer } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  contextId?: string;
}

/** Issue a single-use challenge for a passkey assertion (navigator.credentials.get). */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.contextId)) {
    return badRequest("contextId is required");
  }
  return ok(await getWebAuthnIssuer().issueChallenge(body.contextId));
}
