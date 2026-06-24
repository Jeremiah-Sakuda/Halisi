import { beforeEach, describe, expect, it } from "vitest";

import { POST as contextsPOST } from "@/app/api/contexts/route";
import { POST as challengePOST } from "@/app/api/challenge/route";
import { POST as castPOST } from "@/app/api/demo/cast/route";
import { POST as swarmPOST } from "@/app/api/harness/swarm/route";
import { GET as statsGET } from "@/app/api/stats/[contextId]/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// A fresh, shared in-memory store/issuer across routes (globalThis singletons) for each test file run.
beforeEach(() => {
  process.env.HALISI_STORE = "memory";
});

describe("API routes (in-process)", () => {
  it("rejects a context without a label", async () => {
    const res = await contextsPOST(post({ kind: "vote" }));
    expect(res.status).toBe(400);
  });

  it("creates a context and issues a challenge", async () => {
    const created = await (await contextsPOST(post({ label: "Spring vote", kind: "vote" }))).json();
    expect(created.context.contextId).toBeTruthy();

    const challenge = await (await challengePOST(post({ contextId: created.context.contextId }))).json();
    expect(challenge.tokenId).toBeTruthy();
    expect(typeof challenge.challenge).toBe("string");
  });

  it("casts a vote, denies the duplicate, and reflects it in stats", async () => {
    const ctx = `api-vote-${Math.random().toString(36).slice(2)}`;
    const first = await (await castPOST(post({ contextId: ctx, deviceId: "dev-1" }))).json();
    expect(first.decision).toBe("ACCEPTED");
    expect(first.fingerprint).toBeTruthy();

    const dup = await (await castPOST(post({ contextId: ctx, deviceId: "dev-1" }))).json();
    expect(dup.decision).toBe("DENIED_DUPLICATE_IDENTITY");

    const stats = await (
      await statsGET(new Request("http://localhost"), { params: Promise.resolve({ contextId: ctx }) })
    ).json();
    expect(stats.accepted).toBe(1);
    expect(stats.distinctFingerprints).toBe(1);
    expect(stats.deniedDuplicate).toBe(1);
  });

  it("runs a swarm and collapses to M", async () => {
    const ctx = `api-swarm-${Math.random().toString(36).slice(2)}`;
    const res = await swarmPOST(post({ contextId: ctx, count: 1000, distinctCredentials: 5, mode: "mixed" }));
    const summary = await res.json();
    expect(summary.attempts).toBe(1000);
    expect(summary.distinctFingerprints).toBe(5);
    expect(summary.accepted).toBe(5);
    expect(summary.store).toBe("memory");
  });

  it("rejects an invalid swarm mode", async () => {
    const res = await swarmPOST(post({ contextId: "x", count: 10, mode: "nope" }));
    expect(res.status).toBe(400);
  });
});
