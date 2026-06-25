import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Halisi rations identity, never a finite good. This guard keeps that promise honest: it fails if any
 * scarcity vocabulary creeps into the shipped source or docs. (The test file itself is excluded, since
 * it necessarily names the forbidden words.)
 */
const FORBIDDEN = [
  /\boversell\b/i,
  /\boversold\b/i,
  /\bsold[ -]?out\b/i,
  /\bcountdown\b/i,
  /\binventory\b/i,
  /\bin stock\b/i,
  /\bout of stock\b/i,
  /\bstockout\b/i,
  /\bstampede\b/i,
];

const ROOTS = [
  "src",
  "scripts",
  "README.md",
  "ARCHITECTURE.md",
  "DISTINCTNESS.md",
  "SUBMISSION.md",
  "DEPLOY.md",
  "THREAT_MODEL.md",
  "SECURITY.md",
];

function collectFiles(path: string, acc: string[]): void {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) collectFiles(join(path, entry), acc);
  } else if (/\.(ts|tsx|css|md|mjs|json)$/.test(path)) {
    acc.push(path);
  }
}

describe("distinctness: zero scarcity vocabulary", () => {
  it("no shipped source or doc uses scarcity language", () => {
    const files: string[] = [];
    for (const root of ROOTS) {
      try {
        collectFiles(root, files);
      } catch {
        /* optional path */
      }
    }

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file} :: ${pattern}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
