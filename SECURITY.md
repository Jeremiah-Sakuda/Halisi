# Security

Halisi is an identity-uniqueness layer; its correctness *is* its security. If you find a way to make
the database accept more than one claim per attested credential per context — a replay that lands, a
forged assertion that verifies, a duplicate that slips through, or a race that double-accepts — that is a
vulnerability worth reporting.

## Reporting

Please open a private report via GitHub Security Advisories on the repository, or email the maintainer.
Include a minimal reproduction (a sequence of issue / claim / replay / forge / reuse operations) and the
decision you observed versus the one the invariant requires.

## Scope and honest ceiling

In scope: anything that breaks the marquee invariant — *at most one accepted claim per `(credential,
context)`*, single-use token redemption, forged assertions never reaching the table, and atomicity under
concurrency.

Out of scope by design: Halisi proves *one claim per attested credential*, not philosophical personhood.
An adversary who controls many genuine, separately-registered authenticators can obtain one claim per
authenticator — that is the stated ceiling, not a bug. Halisi raises the cost of a fake by orders of
magnitude; it does not claim to make it impossible.

## What we store

Credential **fingerprint hashes**, never the credential itself and never personal data.
