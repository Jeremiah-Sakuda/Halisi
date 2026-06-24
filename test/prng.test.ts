import { describe, expect, it } from "vitest";

import { mulberry32, shuffle } from "@/lib/harness/prng";

describe("seeded PRNG", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffle is a permutation and reproducible by seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = shuffle([...items], mulberry32(99));
    const s2 = shuffle([...items], mulberry32(99));
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(items);
  });
});
