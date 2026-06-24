# Halisi

**One claim per attested human credential — enforced at the database write.**

Halisi collapses a swarm of synthetic identities down to the real humans behind them. Uniqueness
is not scored after the fact; it is a **synchronous invariant at the Amazon DynamoDB write**. A flood
of 10,000 sign-up / vote / trial attempts collapses to **N distinct attested credentials** — proven by a
DynamoDB query, not guessed by a model.

> *Halisi* is Swahili for *genuine / authentic / real*. The product proves which claimants are the real
> humans, so the name is the promise.

---

## The idea in one breath

The internet's **abundant** goods — votes, signups, free trials, reviews, allocations — drown in fake
identities. There is no scarce pool here: nothing sells out, nothing decrements. The only thing worth
rationing is **identity itself**: *one durable claim per real, attested credential.*

Halisi makes that a hard rule inside the database:

1. The server hands out a **single-use challenge** bound to an action ("one vote", "one trial").
2. The client answers with a **WebAuthn / passkey assertion** it cannot forge — signed by an
   authenticator it actually holds.
3. The server verifies the signature and derives a **credential-fingerprint hash** (the identity anchor)
   and a **single-use redemption key**.
4. Redemption is a single conditional **`TransactWriteItems`** that atomically *burns the token* and
   *writes the one-per-credential claim*. A replay fails. A duplicate credential fails. A forged token
   never earns a fingerprint, so it never reaches the transaction.
5. A **GSI keyed on the fingerprint hash** buckets every accepted claim by the credential behind it — so
   the swarm **collapses** to the true number of humans as a single query.

The guarantee lives entirely on the **base-table conditional write** — never on an (eventually
consistent) index read.

## Why it matters

Sybil abuse is a horizontal tax on every platform with an abundant good: fake signups, vote-stuffing,
review fraud, free-trial farming, allocation draining. The standard defense is heuristic and
retrospective — score the traffic, ban accounts tomorrow. By then the damage is done. Halisi moves the
defense to **deny-at-write**, and is honest about its ceiling: it proves *one-claim-per-attested-credential*,
not philosophical personhood. A fraudster controlling **M** real credentials and firing **N ≫ M** attempts
gets **at most M** accepted claims — the rest fail at the write, in single-digit milliseconds.

## Architecture at a glance

```
 Browser ──passkey assertion──▶ Next.js API (Vercel, region-pinned us-east-1)
                                     │
                                     │ verify signature + single-use challenge  →  fingerprint
                                     ▼
                         ┌─────────────────────────────────┐
                         │   DynamoDB single table `Halisi` │
                         │   conditional TransactWriteItems │
                         │   • burn  REDEMPTION#<tokenId>   │  attribute_not_exists  → replay denied
                         │   • write CLAIM#<ctx>#<fp>       │  attribute_not_exists  → duplicate denied
                         │   GSI1 (FP#<fp>) ── collapse ────┼──▶ N distinct credentials
                         │   Streams ───────────────────────┼──▶ live ledger / collapse feed
                         └─────────────────────────────────┘
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data model, the redemption algorithm, and the
collapse query.

## Running it

```bash
npm install
npm test            # the invariant property suite — runs against the in-memory + dynamo code paths
npm run dev         # the demo app at http://localhost:3000
```

The same application code runs on two `ClaimStore` backends, selected by `HALISI_STORE`:

| `HALISI_STORE` | backend | used for |
| --- | --- | --- |
| `memory` (default) | faithful in-process engine | local dev, CI, the property suite |
| `dynamo` | real Amazon DynamoDB | the deployed app + the captured live run |

Both implement the **identical** conditional-transaction semantics; the property suite proves they are
behaviorally indistinguishable on the invariant. Copy `.env.example` to `.env.local` to configure.

### Provisioning the real table

```bash
# requires AWS credentials in the environment (standard AWS chain)
HALISI_TABLE=Halisi AWS_REGION=us-east-1 npm run provision     # creates the table + GSI1
HALISI_STORE=dynamo npm run live                                # property suite + a swarm, live, captured
```

## Project layout

```
src/lib/issuer/      Issuer interface — SimulatedIssuer (demo/test) + WebAuthnIssuer (real passkeys)
src/lib/store/       ClaimStore interface — MemoryClaimStore + DynamoClaimStore (+ schema, fake-ddb)
src/lib/harness/     attack generators (forged / replayed / reused / mixed swarms)
src/app/api/         contexts, challenge, claim, ledger (SSE), harness/swarm, stats
src/app/             the abundant-action surface + the collapse view
test/                the invariant property suite (the spec) + scenario tests
scripts/             provision-table, live-suite, swarm-bench
```

## License

MIT — see [`LICENSE`](./LICENSE).
