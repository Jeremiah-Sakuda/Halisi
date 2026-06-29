# Halisi

[![ci](https://github.com/Jeremiah-Sakuda/Halisi/actions/workflows/ci.yml/badge.svg)](https://github.com/Jeremiah-Sakuda/Halisi/actions/workflows/ci.yml)

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
                         │   GSI1 (CTX#<ctx>) ─ collapse ───┼──▶ N distinct credentials
                         │   Streams ── consumer (streams.ts) ─▶ live ledger
                         └─────────────────────────────────┘
              (default: the claim path publishes to the SSE ledger in-process;
               HALISI_STREAMS=on feeds it from DynamoDB Streams instead)
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

## Testing & correctness

The invariant is the spec, written first. `test/invariantSuite.ts` is a `fast-check` property suite —
generating random forge / replay / reuse / concurrency programs and checking every decision against a
canonical oracle — and it is applied to **both** stores. `MemoryClaimStore` runs it directly;
`DynamoClaimStore` runs it through `FakeDynamo`, a faithful in-process double that exercises the *real*
store code path (the same SDK commands, the same `TransactionCanceledException` + `CancellationReasons`,
the same pagination). A dedicated property then asserts the two stores make identical decisions on every
program, and a GSI-lag test confirms the guarantee never depends on an index read. The WebAuthn path is
proven against genuine ES256 and Ed25519 assertions. A guard test fails the build if any scarcity
vocabulary appears in the source.

```bash
npm test        # the full suite (memory + dynamo code paths)
npm run typecheck
```

## Offline-verifiable proof (the receipt)

You don't have to trust the demo. Any swarm can emit a **signed receipt** — every attempt's
`(fingerprint, token, decision)`, the final collapse, a Merkle root over the attempts, and an Ed25519
signature. The companion verifier runs with **no network and no npm install**, and it **re-derives** the
collapse from the raw attempts (it does not replay a log), so a tampered "everyone got in" receipt fails:

```bash
# download a receipt from the attacker console, then, with Wi-Fi off:
node scripts/verify-receipt.mjs halisi-receipt.json
#   ✓ Merkle root commits to the attempts
#   ✓ Ed25519 signature
#   ✓ re-derived 10000 decisions — all match
#   ✓ collapse to 3 distinct credentials
#   PASS · 9997 denials independently re-derived · collapse to 3 distinct credentials VERIFIED
```

## Drop it into any app (`halisi-gate`)

The same invariant is a one-line middleware. [`packages/halisi-gate`](./packages/halisi-gate) is a
zero-dependency package that keeps any action one-per-human by delegating the decision to a Halisi
endpoint:

```js
import { halisiGate } from "halisi-gate";

app.post("/free-signup", halisiGate({ endpoint: process.env.HALISI_ENDPOINT, context: "free-signup" }),
  (req, res) => res.send("welcome")); // only real, first-time humans reach here
```

A second signup from the same device gets a `403 DENIED_DUPLICATE_IDENTITY` — the guarantee teleports
into foreign code with no business-logic changes. There's a runnable example app under
`packages/halisi-gate/example`.

## Accessibility

Keyboard focus is always visible (`:focus-visible`), the collapse is exposed to assistive tech as a
labeled image with an `aria-live` result announcement, and `prefers-reduced-motion` is honored across
the animation, the counters, and entrance transitions.

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — data model, redemption algorithm, collapse query, the
  two-store seam, the honest ceiling.
- [`DISTINCTNESS.md`](./DISTINCTNESS.md) — what Halisi is, and what it deliberately is not.
- [`THREAT_MODEL.md`](./THREAT_MODEL.md) — what's defeated, the honest ceiling, recovery roadmap.
- [`SUBMISSION.md`](./SUBMISSION.md) — the submission writeup.
- [`SECURITY.md`](./SECURITY.md) — what counts as a vulnerability, and the honest ceiling.
- [`DEPLOY.md`](./DEPLOY.md) — provisioning, IAM policy, Vercel env, verification.
- [`docs/architecture.svg`](./docs/architecture.svg) — the architecture diagram.
- [`live-artifacts/`](./live-artifacts/) — how to capture the live DynamoDB run.

## License

MIT — see [`LICENSE`](./LICENSE).
