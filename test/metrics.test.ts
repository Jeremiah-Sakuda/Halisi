import { describe, expect, it } from "vitest";

import {
  USD_PER_WRU,
  WRU_PER_CLAIM_TRANSACTION,
  estimateWriteCostUsd,
  formatCostUsd,
  percentile,
} from "@/lib/metrics";

describe("percentile", () => {
  it("returns 0 for an empty sample", () => {
    expect(percentile([], 99)).toBe(0);
  });

  it("computes nearest-rank percentiles", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 99)).toBe(10);
    expect(percentile(xs, 100)).toBe(10);
  });

  it("is order-independent", () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });
});

describe("cost estimate", () => {
  it("charges only for write attempts that reached the table", () => {
    expect(estimateWriteCostUsd(0)).toBe(0);
    expect(estimateWriteCostUsd(10_000)).toBeCloseTo(10_000 * WRU_PER_CLAIM_TRANSACTION * USD_PER_WRU, 10);
  });

  it("a 10k swarm costs pennies", () => {
    expect(estimateWriteCostUsd(10_000)).toBeLessThan(0.1);
  });

  it("formats tiny amounts without collapsing to $0.00", () => {
    expect(formatCostUsd(0)).toBe("$0.00");
    expect(formatCostUsd(estimateWriteCostUsd(10_000))).toMatch(/^\$0\.0\d+$/);
  });
});
