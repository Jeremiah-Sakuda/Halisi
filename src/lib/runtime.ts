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
let storeSingleton: ClaimStore | null = null;

export function getStore(): ClaimStore {
  if (storeSingleton) return storeSingleton;
  const kind = (process.env.HALISI_STORE || "memory").toLowerCase();
  storeSingleton =
    kind === "dynamo" ? new DynamoClaimStore(makeDocClient(), tableName()) : new MemoryClaimStore();
  return storeSingleton;
}

export function storeKind(): "memory" | "dynamo" {
  return (process.env.HALISI_STORE || "memory").toLowerCase() === "dynamo" ? "dynamo" : "memory";
}

let issuerSingleton: SimulatedIssuer | null = null;

/**
 * The simulated issuer drives the demo swarm and the interactive flow. The production WebAuthn issuer
 * implements the same {@link Issuer} interface and slots in behind the same redemption code.
 */
export function getSimulatedIssuer(): SimulatedIssuer {
  if (!issuerSingleton) issuerSingleton = new SimulatedIssuer();
  return issuerSingleton;
}

export function getIssuer(): Issuer {
  return getSimulatedIssuer();
}
