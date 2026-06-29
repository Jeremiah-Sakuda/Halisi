import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";

import { newClaimId } from "@/lib/ids";
import type { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { redeem } from "@/lib/claim/redeem";
import { type SwarmRequest, buildSwarm } from "@/lib/harness/swarm";
import type { ClaimStore } from "@/lib/store/ClaimStore";
import type { ClaimDecision } from "@/lib/types";

/**
 * The Receipt: a signed, offline-verifiable proof of a sybil collapse.
 *
 * A swarm emits one JSON artifact — every attempt's (fingerprint, token, decision), the final collapse,
 * a Merkle root over the attempts, and an Ed25519 signature over the root. The companion
 * `scripts/verify-receipt.mjs` runs with no network and no npm dependencies: it re-derives the root,
 * checks the signature, and INDEPENDENTLY re-runs the invariant from the raw attempts — it re-derives the
 * collapse, it does not replay a log. A tampered "everyone accepted" receipt fails that re-derivation.
 */

export interface ReceiptAttempt {
  i: number;
  /** The verified credential fingerprint, or null for a forged attempt that never reached the table. */
  fp: string | null;
  tokenId: string;
  label: string;
  decision: ClaimDecision;
}

export interface ReceiptMeta {
  contextId: string;
  mode: string;
  count: number;
  distinctCredentials: number;
  seed: number;
  rpId: string;
  issuedAt: number;
}

export interface ReceiptCollapse {
  attempts: number;
  accepted: number;
  denied: number;
  distinctFingerprints: number;
}

export interface SignedReceipt {
  version: 1;
  meta: ReceiptMeta;
  attempts: ReceiptAttempt[];
  collapse: ReceiptCollapse;
  merkleRoot: string;
  signature: { alg: "Ed25519"; publicKey: string; value: string };
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical leaf hash for one attempt — the verifier recomputes this identically. */
export function leafHash(a: ReceiptAttempt): string {
  return sha256hex(`${a.i}|${a.fp ?? ""}|${a.tokenId}|${a.decision}`);
}

/** Binary Merkle root over leaf hashes (last leaf duplicated when a level is odd). */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256hex("");
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = level[i + 1] ?? a;
      next.push(sha256hex(a + b));
    }
    level = next;
  }
  return level[0]!;
}

/** The message the signature covers — binds the Merkle root to the meta + collapse claim. */
export function signedMessage(root: string, meta: ReceiptMeta, collapse: ReceiptCollapse): string {
  return sha256hex(`${root}|${JSON.stringify(meta)}|${JSON.stringify(collapse)}`);
}

interface ReceiptKeyPair {
  publicKeyB64: string;
  privateKey: KeyObject;
}

/** A process-stable Ed25519 receipt-signing key; the public key is embedded in every receipt. */
function getReceiptKeyPair(): ReceiptKeyPair {
  const g = globalThis as unknown as { __halisiReceiptKey?: ReceiptKeyPair };
  if (g.__halisiReceiptKey) return g.__halisiReceiptKey;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  g.__halisiReceiptKey = {
    publicKeyB64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey,
  };
  return g.__halisiReceiptKey;
}

/** Run a swarm and record the raw per-attempt decisions a receipt needs. */
export async function runReceiptSwarm(
  issuer: SimulatedIssuer,
  store: ClaimStore,
  req: SwarmRequest,
): Promise<{ attempts: ReceiptAttempt[]; collapse: ReceiptCollapse }> {
  await store.createContext({ contextId: req.contextId, label: "Receipt", kind: "trial", createdAt: 0 });
  const prepared = await buildSwarm(issuer, req);

  const attempts: ReceiptAttempt[] = [];
  let accepted = 0;
  let denied = 0;
  for (let i = 0; i < prepared.length; i++) {
    const a = prepared[i]!;
    const outcome = await redeem(issuer, store, a.assertion, newClaimId(), 0);
    attempts.push({
      i,
      fp: outcome.decision === "DENIED_FORGED" ? null : outcome.fingerprint ?? null,
      tokenId: a.assertion.tokenId,
      label: a.label,
      decision: outcome.decision,
    });
    if (outcome.decision === "ACCEPTED") accepted++;
    else denied++;
  }

  const collapse = await store.collapse(req.contextId);
  return {
    attempts,
    collapse: {
      attempts: attempts.length,
      accepted,
      denied,
      distinctFingerprints: collapse.distinctFingerprints,
    },
  };
}

/** Build and sign a receipt from a recorded swarm. */
export function buildSignedReceipt(
  req: SwarmRequest,
  rpId: string,
  attempts: ReceiptAttempt[],
  collapse: ReceiptCollapse,
  issuedAt: number,
): SignedReceipt {
  const meta: ReceiptMeta = {
    contextId: req.contextId,
    mode: req.mode,
    count: req.count,
    distinctCredentials: req.distinctCredentials,
    seed: req.seed ?? 0x1a2b3c,
    rpId,
    issuedAt,
  };
  const root = merkleRoot(attempts.map(leafHash));
  const { publicKeyB64, privateKey } = getReceiptKeyPair();
  const value = sign(null, Buffer.from(signedMessage(root, meta, collapse)), privateKey).toString("base64");

  return {
    version: 1,
    meta,
    attempts,
    collapse,
    merkleRoot: root,
    signature: { alg: "Ed25519", publicKey: publicKeyB64, value },
  };
}
