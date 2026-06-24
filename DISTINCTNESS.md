# What makes Halisi distinct

Halisi is an **identity-uniqueness** layer. Its job is to take a flood of synthetic identities and
**collapse** it to the real humans behind it — to *unmask*, in one database query, how many distinct
attested credentials a swarm of attempts actually represents.

That framing is deliberately narrow, and it is what sets Halisi apart from neighboring ideas that also
enforce correctness at the database write:

- **It does not guard a finite pool.** There is no scarce supply, nothing decrements, nothing is ever
  exhausted. The protected action — a vote, a signup, a free trial — is *abundant*. Halisi rations
  **identity**, never a finite good. If anything here ever "ran out," it would be the wrong product.

- **It is not a tamper-evident log or a notary.** Halisi does not exist to prove that a record was not
  altered. It exists to prove **how many distinct humans** are behind a set of claims. The conditional
  write is plumbing; the headline is the **collapse**.

- **It is not metering or usage accounting.** Halisi does not count events per customer. It enforces a
  single durable identity per attested credential and then **counts the credentials**, not the activity.

The marquee is the collapse — 10,000 attempts shrinking to N glowing identity nodes, live, with the
per-write latency and the (pennies) AWS cost ticking alongside. The atomic conditional transaction that
makes it true is necessary and correct, but it is supporting cast. Halisi's identity is **unmasking**:
the database as the agent that reveals the real humans, not as a ledger, a lock, or an allocator.

**Honest ceiling.** Halisi proves *one claim per attested credential*, not philosophical personhood. It
defeats synthetic swarms, replay, forgery, and credential reuse — raising the cost of a fake by orders of
magnitude — and it says so plainly rather than overclaiming.
