import { describe, expect, it } from "vitest";

import { POST as castPOST } from "@/app/api/demo/cast/route";
// The actual published gate code — driven against Halisi's REAL claim handler (no network).
import { guard } from "../packages/halisi-gate/index.mjs";

// Route the gate's fetch straight into the real Next.js cast route handler.
const fetchImpl = async (_url: string, init: RequestInit) =>
  castPOST(new Request("http://halisi.local/api/demo/cast", init));

describe("halisi-gate governs a foreign app via the real Halisi invariant", () => {
  it("admits the first human, denies the second from the same device", async () => {
    const decide = guard({ endpoint: "http://halisi.local", context: "gate-signup", fetchImpl });

    const first = await decide("device-1");
    expect(first.allowed).toBe(true);
    expect(first.decision).toBe("ACCEPTED");
    // The real per-write payload teleports into the foreign app too.
    expect(first.write?.committed).toBe(true);

    const second = await decide("device-1");
    expect(second.allowed).toBe(false);
    expect(second.decision).toBe("DENIED_DUPLICATE_IDENTITY");

    const other = await decide("device-2");
    expect(other.allowed).toBe(true);
  });

  it("isolates contexts — a device admitted to one action can still claim another", async () => {
    const trial = guard({ endpoint: "http://halisi.local", context: "gate-trial", fetchImpl });
    const vote = guard({ endpoint: "http://halisi.local", context: "gate-vote", fetchImpl });
    expect((await trial("dev-x")).allowed).toBe(true);
    expect((await vote("dev-x")).allowed).toBe(true); // different action, same device → still one each
    expect((await trial("dev-x")).allowed).toBe(false); // but not twice in the same action
  });
});
