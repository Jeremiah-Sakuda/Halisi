import { describe, expect, it } from "vitest";

import { fingerprint, sha256Hex, shortFingerprint } from "@/lib/hash";

describe("credential fingerprint", () => {
  it("is stable for the same credential + relying party", () => {
    expect(fingerprint("cred-1", "halisi.app")).toBe(fingerprint("cred-1", "halisi.app"));
  });

  it("changes with the credential", () => {
    expect(fingerprint("cred-1", "halisi.app")).not.toBe(fingerprint("cred-2", "halisi.app"));
  });

  it("is anchored to the relying party (same credential, different rp → different fingerprint)", () => {
    expect(fingerprint("cred-1", "halisi.app")).not.toBe(fingerprint("cred-1", "evil.app"));
  });

  it("is a 64-char hex digest; short form is 10 chars", () => {
    const fp = fingerprint("cred-1", "halisi.app");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(shortFingerprint(fp)).toHaveLength(10);
  });

  it("sha256Hex matches a known vector", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
