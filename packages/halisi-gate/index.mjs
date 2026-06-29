import { randomBytes } from "node:crypto";

/**
 * halisi-gate — the same "one claim per attested human" invariant, dropped into any app.
 *
 * The gate forwards a per-device claim to a Halisi endpoint and lets the request through only on
 * ACCEPTED. The decision is made by Halisi's real conditional `TransactWriteItems` — the foreign app
 * needs to know nothing about the mechanism. Zero npm dependencies; Node 18+ (uses global fetch).
 */

const DEFAULT_ENDPOINT = process.env.HALISI_ENDPOINT || "http://localhost:3000";

/**
 * Framework-agnostic decision function. `decide(deviceId)` resolves to
 * `{ allowed, decision, write, latencyMs }`. `fetchImpl` is injectable for tests.
 *
 * @param {{ endpoint?: string, context?: string, fetchImpl?: (url: string, init: object) => Promise<{ json(): Promise<any> }> }} [options]
 */
export function guard({ endpoint = DEFAULT_ENDPOINT, context = "default", fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("halisi-gate: global fetch is unavailable; use Node 18+ or pass fetchImpl");
  }
  return async function decide(deviceId) {
    const res = await doFetch(`${endpoint}/api/demo/cast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contextId: context, deviceId }),
    });
    const out = await res.json();
    return {
      allowed: out.decision === "ACCEPTED",
      decision: out.decision,
      write: out.write ?? null,
      latencyMs: out.latencyMs ?? null,
    };
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Read (or set) the per-device id cookie on a Node/Express req/res pair. */
export function deviceCookie(req, res, name = "halisi_did") {
  const id = parseCookies(req.headers?.cookie)[name];
  if (id) return id;
  const fresh = `did_${randomBytes(16).toString("hex")}`;
  const cookie = `${name}=${fresh}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
  const existing = res.getHeader?.("Set-Cookie");
  res.setHeader?.("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
  return fresh;
}

/**
 * Express / Connect middleware. Drop `app.use(halisiGate({ context: "free-signup" }))` ahead of the
 * action you want to keep one-per-human. ACCEPTED → next(); a duplicate or replay → 403; if Halisi is
 * unreachable it fails closed (503) rather than letting a swarm through.
 */
export function halisiGate({ endpoint = DEFAULT_ENDPOINT, context = "default", cookie = "halisi_did" } = {}) {
  const decide = guard({ endpoint, context });
  return async function halisiGateMiddleware(req, res, next) {
    let result;
    try {
      const deviceId = deviceCookie(req, res, cookie);
      result = await decide(deviceId);
    } catch {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "halisi-gate: decision service unavailable" }));
      return;
    }
    if (result.allowed) {
      req.halisi = result;
      return next();
    }
    res.statusCode = 403;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: `halisi-gate denied: ${result.decision}`, decision: result.decision }));
  };
}

export default halisiGate;
