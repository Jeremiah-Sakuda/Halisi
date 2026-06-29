#!/usr/bin/env node
/**
 * Offline, zero-dependency verifier for a Halisi sybil-collapse receipt.
 *
 *   node scripts/verify-receipt.mjs receipt.json
 *
 * Uses only Node built-ins — no network, no npm install, no trust in the team. It (1) re-derives the
 * Merkle root over the raw attempts, (2) checks the Ed25519 signature, and (3) INDEPENDENTLY re-runs the
 * invariant from the raw attempts — it re-derives the collapse rather than replaying a log, so a tampered
 * "everyone got in" receipt fails. Turn Wi-Fi off and run it: the proof survives the room emptying.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sha256hex(s) {
  return createHash("sha256").update(s).digest("hex");
}

function leafHash(a) {
  return sha256hex(`${a.i}|${a.fp ?? ""}|${a.tokenId}|${a.decision}`);
}

function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256hex("");
  let level = leaves.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? a;
      next.push(sha256hex(a + b));
    }
    level = next;
  }
  return level[0];
}

function signedMessage(root, meta, collapse) {
  return sha256hex(`${root}|${JSON.stringify(meta)}|${JSON.stringify(collapse)}`);
}

/** Verify a receipt object. Returns { ok, checks, derived }. */
export function verifyReceipt(receipt) {
  const checks = [];

  // 1. The Merkle root commits to exactly these attempts.
  const recomputedRoot = merkleRoot((receipt.attempts ?? []).map(leafHash));
  checks.push({ name: "Merkle root commits to the attempts", ok: recomputedRoot === receipt.merkleRoot });

  // 2. The signature proves the receipt was not altered after signing.
  let sigOk = false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(receipt.signature.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    sigOk = verify(
      null,
      Buffer.from(signedMessage(receipt.merkleRoot, receipt.meta, receipt.collapse)),
      pub,
      Buffer.from(receipt.signature.value, "base64"),
    );
  } catch {
    sigOk = false;
  }
  checks.push({ name: "Ed25519 signature", ok: sigOk });

  // 3. Independently re-run the invariant from the raw attempts (re-derive, don't replay).
  const burned = new Set();
  const claimed = new Set();
  const accepted = new Set();
  let mismatches = 0;
  let deniedReplay = 0;
  let deniedDuplicate = 0;
  let deniedForged = 0;
  for (const a of receipt.attempts ?? []) {
    let expected;
    if (a.fp === null || a.fp === undefined) {
      expected = "DENIED_FORGED";
      deniedForged++;
    } else if (burned.has(a.tokenId)) {
      expected = "DENIED_REPLAY";
      deniedReplay++;
    } else if (claimed.has(a.fp)) {
      expected = "DENIED_DUPLICATE_IDENTITY";
      deniedDuplicate++;
    } else {
      expected = "ACCEPTED";
      burned.add(a.tokenId);
      claimed.add(a.fp);
      accepted.add(a.fp);
    }
    if (expected !== a.decision) mismatches++;
  }
  const total = (receipt.attempts ?? []).length;
  checks.push({
    name: `re-derived ${total} decisions`,
    ok: mismatches === 0,
    detail: mismatches === 0 ? "all match" : `${mismatches} mismatch`,
  });

  // 4. The collapse claim is forced by the data: accepted == distinct credentials.
  const collapseOk =
    accepted.size === receipt.collapse?.distinctFingerprints && accepted.size === receipt.collapse?.accepted;
  checks.push({ name: `collapse to ${accepted.size} distinct credentials`, ok: collapseOk });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    derived: { accepted: accepted.size, deniedReplay, deniedDuplicate, deniedForged },
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node scripts/verify-receipt.mjs <receipt.json>");
    process.exit(2);
  }
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  const result = verifyReceipt(receipt);
  console.log(`Halisi receipt · ${path}`);
  for (const c of result.checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  const d = result.derived;
  if (result.ok) {
    console.log(
      `\nPASS · ${d.deniedForged + d.deniedReplay + d.deniedDuplicate} denials independently re-derived · collapse to ${d.accepted} distinct credentials VERIFIED`,
    );
  } else {
    console.log("\nFAIL · the receipt is not internally consistent");
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
