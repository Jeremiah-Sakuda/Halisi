# Halisi — submission

**One claim per attested human credential, enforced at the Amazon DynamoDB write.**

Track: **Monetizable B2C.** Database: **Amazon DynamoDB.** Frontend: **Next.js on Vercel** (region-pinned
to `us-east-1` / `iad1`).

## What it is

The internet's *abundant* goods — votes, signups, free trials, reviews, allocations — drown in synthetic
identities. The usual defense is heuristic and retrospective: score the traffic, ban accounts tomorrow.
By then the vote is stuffed and the trials are farmed.

Halisi inverts that. Uniqueness becomes a **synchronous invariant at the database write**. Each protected
action requires a server-issued, single-use, cryptographically-verifiable attestation (a WebAuthn / passkey
assertion) the client cannot self-mint. Redemption is one atomic DynamoDB conditional transaction: a
replayed token is denied at the write, a forged token never earns a fingerprint to write with, and a
second claim from the same credential fails its condition. A GSI keyed on the credential fingerprint
buckets accepted claims, so **10,000 synthetic identities collapse to N distinct humans** — as a database
query, not an ML guess.

## How it uses Amazon DynamoDB

- **Single-table design.** One table, three entity types (Context, Redemption, Claim) discriminated by
  `PK`/`SK`.
- **Conditional `TransactWriteItems`.** The atomic heart: burn the single-use token *and* write the
  one-per-credential claim, both `attribute_not_exists`, succeed or fail together. `CancellationReasons`
  distinguish a replay from a duplicate identity.
- **One GSI for the collapse.** `GSI1` partitions every claim under its context, so counting distinct
  credentials is a single `Query`, never a scan.
- **Streams** fan each accepted claim out to the live ledger (SSE) that drives the collapse view.
- **On-demand capacity** — the cost story is pennies at 10k writes.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data model and the redemption algorithm.

## Features

- A clean consumer **"cast your one vote"** surface: vote once, try again (denied — duplicate), replay the
  same token (denied — replay), or switch device (accepted — a new credential).
- The **collapse**: fire a swarm of up to 10,000 forged / replayed / reused attempts behind a handful of
  real credentials and watch it shrink to N glowing identity nodes, live, with p99 write latency and the
  estimated AWS cost.
- A **live ledger** (DynamoDB Streams → SSE) of accepted identities as they land.
- An **architecture peek** showing the single table, the conditional transaction, and the collapse query.

## Engineering

- The invariant is written first as a **property suite** (the spec) that holds **both** an in-process
  engine and the real DynamoDB store to identical behavior — proven by `fast-check` over thousands of
  randomized forge/replay/reuse programs, plus replay / forgery / concurrency / GSI-lag scenario tests.
- The same application code runs on either backend via `HALISI_STORE=memory|dynamo`.
- Two attestation issuers behind one interface: a simulated server-keypair issuer (demo + tests) and a
  real **WebAuthn** issuer verifying genuine ES256 / Ed25519 passkey assertions.
- The live DynamoDB run (invariant + a swarm against a real table) is captured in `live-artifacts/`.

## Who pays for it (B2C-facing, B2B-paid)

End users experience an abundant action; platforms pay Halisi to keep it honest. Wedges: Web3 token
distribution (airdrop sybil resistance) and growth/PLG platforms fighting free-trial abuse and fake
signups; adjacent: community voting, review integrity, waitlist fairness. Usage-based pricing **per
accepted unique claim** — denials are free; we only charge when exactly one real human is let through.

## What makes it distinct

See [`DISTINCTNESS.md`](./DISTINCTNESS.md). In one line: Halisi rations **identity**, not a finite good,
and reframes the database as the agent of **collapse / unmasking** — not de-duplication, not allocation.

## Try it

```bash
npm install
npm test        # the invariant property suite (both stores)
npm run dev     # the demo at http://localhost:3000
```
