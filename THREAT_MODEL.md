# Threat model

Halisi's guarantee is narrow and precise: **at most one accepted claim per attested credential per
context**, decided at the DynamoDB write. This document is explicit about what that does and does not
defeat, so the claim is never read as more than it is.

## The trust anchor: registration is the cost

The security does not come from the signature alone — it comes from the fact that **getting a credential
registered is expensive**. In production (WebAuthn), registration requires a real platform authenticator
and a user-presence/verification gesture; you cannot cheaply mint a thousand of them. Halisi vouches for a
registered credential with a server attestation (an HMAC over `credentialId + publicKey`), so a client
cannot fabricate a credential the relying party never registered.

In the simulation, `SimulatedIssuer.register()` is deliberately free so the harness can *choose* how many
real credentials **M** sit behind a swarm. That models the real world, where M is bounded by how many
authenticators an attacker actually controls — not by anything the simulation makes cheap.

## What Halisi defeats (in scope)

For an adversary controlling **M** registered credentials who attempts **N ≫ M** claims:

| Attack | Mechanism | Outcome |
| --- | --- | --- |
| **Forgery** | a credential the RP never registered, or a tampered signature | `DENIED_FORGED` — never reaches the table |
| **Replay** | re-submitting an already-redeemed token | `DENIED_REPLAY` — the redemption condition fails |
| **Credential reuse** | the same few credentials across many synthetic accounts | `DENIED_DUPLICATE_IDENTITY` after the first per credential |
| **Wallet/account farming** | one credential, many target wallets/accounts | one claim total — the fingerprint is anchored to the credential, not the target |
| **Concurrency** | C simultaneous claims on one credential | exactly one accepted (the conditional transaction, not luck) |

Net: **N attempts yield at most M accepted claims.** The swarm collapses to M.

## What Halisi does NOT defeat (the honest ceiling)

- **A genuine fleet of real authenticators.** An adversary who actually registers M real credentials gets
  M claims — one each. Halisi raises the *cost per fake* by orders of magnitude; it does not make a real
  device free. This is the stated ceiling, not a defect.
- **A stolen-but-valid credential's first claim.** If an attacker fully compromises a real authenticator
  and uses it once, that claim is — by construction — indistinguishable from the legitimate owner's. The
  invariant still holds (one claim for that credential); attribution is out of scope.
- **Personhood.** Halisi proves *one claim per attested credential*, never "one per human." One person
  with two authenticators is two credentials; that is acknowledged everywhere in the product.

## Not part of the guarantee

- **The collapse index.** GSI1 is eventually consistent. Accept/deny is decided only by the base-table
  conditional transaction; a stale index read can never change a decision (proven in `test/dynamo.test.ts`).
- **Cost/latency readouts** on the in-process engine reflect local CPU, not DynamoDB; the UI says so when
  `store=memory`.

## Recovery & rotation (roadmap)

Binding a claim to a single credential means a lost or rotated authenticator cannot re-claim — which is
correct for the demo but real friction for production. The intended path:

1. **Account-bound identity.** Bind several credentials to one account-level anchor; the fingerprint
   derives from the anchor, so any of the account's authenticators satisfies "one per human."
2. **Attested rotation.** Allow a registered credential to attest a successor, transferring the anchor
   without opening a second claim.
3. **Out-of-band recovery** (email/social) gated behind the same write-time uniqueness, so recovery never
   becomes a sybil vector.

These are out of scope for the hackathon build and noted as the next step, not claimed as done.
