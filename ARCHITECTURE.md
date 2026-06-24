# Architecture

Halisi makes **one claim per attested human credential** a synchronous invariant at the Amazon
DynamoDB write. This document covers the data model, the redemption algorithm, the collapse query, and
the seam that lets the identical application code run on an in-process engine and on real DynamoDB.

## The invariant, formally

For any credential fingerprint `f` and abundant-action context `c`:

- there is **at most one** accepted claim `(f, c)`;
- every attestation token `t` is redeemable **at most once**;
- a claim is accepted **iff** `t` carries a valid server-issued signature over its challenge, **and** `t`
  is unredeemed, **and** `(f, c)` has no prior accepted claim — all decided atomically at the write.

Threat model: an adversary controls **M** real credentials and attempts **N ≫ M** claims by forging,
replaying, and reusing them. The invariant guarantees **at most M accepted claims** per context. A flood
of N attempts collapses to M distinct credentials.

## Components

```
  Browser / harness                    Next.js on Vercel (region us-east-1 / iad1)
  ─────────────────                    ────────────────────────────────────────────
  passkey assertion  ───────────────▶  Issuer.verify()         (forged → denied here, no DB write)
   (or simulated)                          │  fingerprint + single-use token
                                           ▼
                                      ClaimStore.claim()
                                           │
                                           ▼
                         ┌───────────────────────────────────────────┐
                         │   Amazon DynamoDB — single table `Halisi`  │
                         │   conditional TransactWriteItems           │
                         │     • Put REDEMPTION#<tokenId>             │  attribute_not_exists → REPLAY
                         │     • Put CLAIM#<ctx>#<fp>                 │  attribute_not_exists → DUPLICATE
                         │   GSI1 (CTX#<ctx>) ── collapse Query ──────┼──▶ N distinct credentials
                         │   Streams (enabled) ───── prod consumer ───┼┄▶ SSE live ledger
                         └───────────────────────────────────────────┘
   In the demo the claim path publishes to the SSE ledger in-process (ledger.ts); the table has Streams
   enabled (NEW_IMAGE) so a production consumer can drive the same feed without code changes downstream.
```

The two seams:

- **`Issuer`** — turns an unforgeable attestation into a verified fingerprint. `SimulatedIssuer`
  (server keypair; drives the demo + property suite) and `WebAuthnIssuer` (real passkey assertions,
  ES256/Ed25519) implement the same generic interface, so the redemption code never changes.
- **`ClaimStore`** — expresses the invariant. `MemoryClaimStore` (faithful in-process semantics) and
  `DynamoClaimStore` (real table) are proven behaviorally identical by one property suite.

## Data model (single table `Halisi`)

Partition key `PK`, sort key `SK`. One global secondary index `GSI1` (`GSI1PK`, `GSI1SK`).

| Entity | PK | SK | Key attributes | Purpose |
| --- | --- | --- | --- | --- |
| Context | `CTX#<contextId>` | `CTX` | `label, kind, createdAt` | the abundant-action definition |
| Redemption | `REDEMPTION#<tokenId>` | `REDEMPTION` | `redeemedAt` | single-use token guard |
| Claim | `CLAIM#<contextId>#<fp>` | `CLAIM` | `claimId, fp, contextId, createdAt`, `GSI1PK=CTX#<contextId>`, `GSI1SK=FP#<fp>#<claimId>` | one per credential per context |

Billing is **on-demand** (pay per request) — the cost story is pennies at 10k writes. Streams are
enabled with `NEW_IMAGE` to fan accepted claims out to the live ledger.

## The redemption algorithm

```
claim(assertion a, context c):
  1. fp, ok = Issuer.verify(a)              # signature + issued-challenge check
     if not ok: return DENIED_FORGED         # never reaches the database
  2. claimId = uuidv4()                       # client-generated, idempotent — no read-before-write
  3. DynamoDB TransactWriteItems:
       a. Put REDEMPTION#<a.tokenId>  if attribute_not_exists(PK)   # single-use token
       b. Put CLAIM#<c>#<fp>          if attribute_not_exists(PK)   # one per credential per context
     on TransactionCanceled, reason[0] failed → DENIED_REPLAY
     on TransactionCanceled, reason[1] failed → DENIED_DUPLICATE_IDENTITY
  4. return ACCEPTED(claimId)
```

Both conditions commit in **one** `TransactWriteItems` — the token burn and the uniqueness check
succeed or fail together, so there is never a state where a token is spent but no claim landed. The
`CancellationReasons` array tells the two failures apart: a replay trips item (a); a reused credential
with a fresh token trips item (b). Replay precedence is deliberate — a replayed assertion trips both
conditions, and reporting it as `DENIED_REPLAY` names the defining cause (the token was already spent).

## The collapse query

`GSI1` partitions every accepted claim under `CTX#<contextId>`, so the collapse is a single `Query`,
never a scan:

```
Query GSI1 where GSI1PK = CTX#<contextId>   →  one item per (context, fp)  →  count = N distinct credentials
```

Because the base table guarantees one claim per `(context, fp)`, each fingerprint appears exactly once
under the partition, so the item count **is** the number of distinct attested credentials behind the
swarm. The UI labels this **"N distinct attested credentials,"** never "N people."

**Consistency note.** GSI1 is eventually consistent. The guarantee lives entirely on the base-table
conditional transaction; the index is used only for the collapse view. A test injects index lag and
confirms accept/deny decisions are unaffected (`test/dynamo.test.ts`).

## The two stores are one spec

`test/invariantSuite.ts` is parameterized over a store factory. It is applied to both
`MemoryClaimStore` and `DynamoClaimStore` (the latter through a faithful in-process `FakeDynamo` double
that runs the real store code path — the same command objects, the same `TransactionCanceledException`,
the same pagination). A separate property asserts the two stores produce identical decisions on every
generated program. The captured live run (`live-artifacts/`) then proves the same behavior on a real
table.

## Honest ceiling

Halisi proves *one claim per attested credential*, not philosophical personhood. It resists synthetic
swarms, replay, forgery, and credential reuse — raising the cost of a fake by orders of magnitude. It
does not claim a perfect count of humans, and it stores fingerprint **hashes**, never identities or PII.
