import { describe, expect, it } from "vitest";

import { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { buildSignedReceipt, runReceiptSwarm } from "@/lib/receipt";
// The standalone, zero-dependency verifier — the exact code a judge runs offline.
import { verifyReceipt } from "../scripts/verify-receipt.mjs";

async function makeReceipt(seed = 2026, count = 2_000, m = 4) {
  const issuer = new SimulatedIssuer("receipt-secret", "halisi.test");
  const req = { contextId: `r-${seed}`, count, distinctCredentials: m, mode: "mixed" as const, seed };
  const { attempts, collapse } = await runReceiptSwarm(issuer, new MemoryClaimStore(), req);
  return buildSignedReceipt(req, "halisi.test", attempts, collapse, 1_700_000_000_000);
}

describe("receipt — offline verification", () => {
  it("a genuine receipt passes every check and re-derives the collapse", async () => {
    const receipt = await makeReceipt(2026, 2_000, 4);
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(true);
    expect(result.derived.accepted).toBe(4);
    expect(receipt.collapse.distinctFingerprints).toBe(4);
  });

  it("flipping a denial to ACCEPTED fails the independent re-derivation", async () => {
    const receipt = await makeReceipt();
    const denied = receipt.attempts.find((a) => a.decision !== "ACCEPTED");
    expect(denied).toBeTruthy();
    denied!.decision = "ACCEPTED"; // tamper: claim a denied attempt got in
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name.startsWith("re-derived"))?.ok).toBe(false);
  });

  it("inflating the collapse count fails (signature + collapse check)", async () => {
    const receipt = await makeReceipt();
    receipt.collapse.distinctFingerprints = 9_999;
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(false);
  });

  it("editing an attempt without re-signing breaks the Merkle root", async () => {
    const receipt = await makeReceipt();
    receipt.attempts[0]!.tokenId = "tampered-token";
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.ok).toBe(false); // Merkle root check
  });

  it("a forged-only swarm re-derives to zero accepted", async () => {
    const issuer = new SimulatedIssuer("receipt-secret", "halisi.test");
    const req = { contextId: "r-forged", count: 500, distinctCredentials: 0, mode: "forged" as const, seed: 1 };
    const { attempts, collapse } = await runReceiptSwarm(issuer, new MemoryClaimStore(), req);
    const receipt = buildSignedReceipt(req, "halisi.test", attempts, collapse, 1_700_000_000_000);
    const result = verifyReceipt(receipt);
    expect(result.ok).toBe(true);
    expect(result.derived.accepted).toBe(0);
    expect(result.derived.deniedForged).toBe(500);
  });
});
