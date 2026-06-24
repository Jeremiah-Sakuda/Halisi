import { newClaimId, newCredentialId } from "@/lib/ids";
import type { Assertion } from "@/lib/issuer/Issuer";
import { SimulatedAuthenticator, SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { fingerprint as fp } from "@/lib/hash";
import type { ClaimDecision, Context } from "@/lib/types";
import type { ClaimStore } from "@/lib/store/ClaimStore";

export const RP_ID = "halisi.test";

/** A test issuer with M registered authenticators (the credentials an attacker truly controls). */
export function setupIssuer(m: number): {
  issuer: SimulatedIssuer;
  authenticators: SimulatedAuthenticator[];
} {
  const issuer = new SimulatedIssuer("test-secret", RP_ID);
  const authenticators: SimulatedAuthenticator[] = [];
  for (let i = 0; i < m; i++) {
    const auth = new SimulatedAuthenticator(newCredentialId());
    auth.registerWith(issuer);
    authenticators.push(auth);
  }
  return { issuer, authenticators };
}

/** The fingerprint a given authenticator will resolve to under the test rp. */
export function fingerprintOf(auth: SimulatedAuthenticator): string {
  return fp(auth.credentialId, RP_ID);
}

/** Issue a fresh challenge and produce a genuine assertion from `auth`. */
export async function genuine(
  issuer: SimulatedIssuer,
  auth: SimulatedAuthenticator,
  contextId: string,
): Promise<Assertion> {
  const challenge = await issuer.issueChallenge(contextId);
  return auth.assert(challenge);
}

/** A forged assertion: a credential the relying party never registered. */
export async function forged(
  issuer: SimulatedIssuer,
  contextId: string,
): Promise<Assertion> {
  const stranger = new SimulatedAuthenticator(newCredentialId());
  const challenge = await issuer.issueChallenge(contextId);
  return stranger.assert(challenge, { forgeAttestation: true });
}

export async function makeContext(store: ClaimStore, contextId: string): Promise<Context> {
  return store.createContext({
    contextId,
    label: "Test action",
    kind: "vote",
    createdAt: 0,
  });
}

export { newClaimId };
export type { ClaimDecision };
