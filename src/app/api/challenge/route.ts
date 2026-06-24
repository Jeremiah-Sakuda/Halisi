import { badRequest, isNonEmptyString, ok, readJson } from "@/lib/api";
import { getSimulatedIssuer } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  contextId?: string;
}

/** Issue a single-use challenge bound to a token + context. Stateless: the token is the redemption key. */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isNonEmptyString(body.contextId)) {
    return badRequest("contextId is required");
  }
  const challenge = await getSimulatedIssuer().issueChallenge(body.contextId);
  return ok(challenge);
}
