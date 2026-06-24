import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("reports liveness and the active store", async () => {
    process.env.HALISI_STORE = "memory";
    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    expect(body.store).toBe("memory");
    expect(body.table).toBeTruthy();
  });
});
