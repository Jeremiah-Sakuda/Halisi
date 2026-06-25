import { describe, expect, it } from "vitest";

import { POST as allocatePOST } from "@/app/api/demo/allocate/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/demo/allocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("airdrop allocation route", () => {
  it("binds the first allocation to a wallet and resists multi-wallet farming from one device", async () => {
    const campaignId = `camp-${Math.random().toString(36).slice(2)}`;

    const first = await (await allocatePOST(post({ campaignId, deviceId: "dev-A", wallet: "0xaaa" }))).json();
    expect(first.decision).toBe("ACCEPTED");
    expect(first.wallet).toBe("0xaaa");

    // same device, different wallet — the anti-farming guarantee
    const farm = await (await allocatePOST(post({ campaignId, deviceId: "dev-A", wallet: "0xbbb" }))).json();
    expect(farm.decision).toBe("DENIED_DUPLICATE_IDENTITY");

    // a different device gets its own allocation
    const second = await (await allocatePOST(post({ campaignId, deviceId: "dev-B", wallet: "0xccc" }))).json();
    expect(second.decision).toBe("ACCEPTED");
  });

  it("requires campaignId, deviceId, and wallet", async () => {
    const res = await allocatePOST(post({ campaignId: "c", deviceId: "d" }));
    expect(res.status).toBe(400);
  });
});
