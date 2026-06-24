import { describe, expect, it } from "vitest";

import { ledger } from "@/lib/ledger";

describe("ledger pub/sub", () => {
  it("delivers events to subscribers of the same context only", () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = ledger.subscribe("ctx-a", (e) => a.push(e.decision));
    const offB = ledger.subscribe("ctx-b", (e) => b.push(e.decision));

    ledger.publish({ contextId: "ctx-a", decision: "ACCEPTED", fingerprint: "f1", latencyMs: 1, at: 0 });
    ledger.publish({ contextId: "ctx-b", decision: "DENIED_REPLAY", latencyMs: 1, at: 0 });

    expect(a).toEqual(["ACCEPTED"]);
    expect(b).toEqual(["DENIED_REPLAY"]);
    offA();
    offB();
  });

  it("tracks a running distinct-fingerprint count for accepted claims", () => {
    const ctx = `ledger-distinct-${Math.random()}`;
    ledger.publish({ contextId: ctx, decision: "ACCEPTED", fingerprint: "fa", latencyMs: 1, at: 0 });
    ledger.publish({ contextId: ctx, decision: "ACCEPTED", fingerprint: "fb", latencyMs: 1, at: 0 });
    ledger.publish({ contextId: ctx, decision: "ACCEPTED", fingerprint: "fa", latencyMs: 1, at: 0 }); // dup fp
    ledger.publish({ contextId: ctx, decision: "DENIED_REPLAY", latencyMs: 1, at: 0 });
    expect(ledger.distinctCount(ctx)).toBe(2);
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const off = ledger.subscribe("ctx-unsub", (e) => seen.push(e.decision));
    off();
    ledger.publish({ contextId: "ctx-unsub", decision: "ACCEPTED", fingerprint: "f", latencyMs: 1, at: 0 });
    expect(seen).toEqual([]);
  });
});
