import type { ClaimStore } from "@/lib/store/ClaimStore";
import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { DynamoClaimStore } from "@/lib/store/DynamoClaimStore";
import { makeDocClient, tableName } from "@/lib/store/client";
import type { Issuer } from "@/lib/issuer/Issuer";
import { SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";

/**
 * Process-wide singletons selected by environment, so identical application code runs on either
 * backend:
 *
 *   HALISI_STORE=memory  (default) — the in-process engine (local dev, CI, the property suite)
 *   HALISI_STORE=dynamo            — real Amazon DynamoDB (the deployed app + the captured live run)
 *
 * The store is a singleton because MemoryClaimStore holds state in process; the deployed app uses
 * `dynamo`, where the durable state lives in the table and any instance is interchangeable.
 */
// Stash singletons on globalThis so every route module shares one instance. This matters on the
// memory backend, where the durable state lives in process — without it, /api/stats would read a
// different store than /api/claim wrote to. On dynamo the state lives in the table, so it is moot.
const g = globalThis as unknown as {
  __halisiStore?: ClaimStore;
  __halisiIssuer?: SimulatedIssuer;
};

export function getStore(): ClaimStore {
  if (g.__halisiStore) return g.__halisiStore;
  const kind = (process.env.HALISI_STORE || "memory").toLowerCase();
  g.__halisiStore =
    kind === "dynamo" ? new DynamoClaimStore(makeDocClient(), tableName()) : new MemoryClaimStore();
  return g.__halisiStore;
}

export function storeKind(): "memory" | "dynamo" {
  return (process.env.HALISI_STORE || "memory").toLowerCase() === "dynamo" ? "dynamo" : "memory";
}

/**
 * The simulated issuer drives the demo swarm and the interactive flow. The production WebAuthn issuer
 * implements the same {@link Issuer} interface and slots in behind the same redemption code.
 */
export function getSimulatedIssuer(): SimulatedIssuer {
  if (!g.__halisiIssuer) g.__halisiIssuer = new SimulatedIssuer();
  return g.__halisiIssuer;
}

export function getIssuer(): Issuer {
  return getSimulatedIssuer();
}
