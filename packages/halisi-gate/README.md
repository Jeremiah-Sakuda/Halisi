# halisi-gate

**One claim per attested human — dropped into any app.** A ~5-line middleware that keeps bot farms and
AI-agent swarms out of a human-only action (a free trial, a vote, an airdrop), with the decision made by
a [Halisi](../../README.md) endpoint's real conditional `TransactWriteItems`. Zero npm dependencies;
Node 18+.

## Use it

```js
import { halisiGate } from "halisi-gate";

// only real, first-time humans get past this line
app.post("/free-signup", halisiGate({
  endpoint: process.env.HALISI_ENDPOINT, // your deployed Halisi (running on DynamoDB)
  context: "free-signup",
}), (req, res) => res.send("welcome"));
```

A second attempt from the same device — or a replayed token — gets a `403` with
`{ decision: "DENIED_DUPLICATE_IDENTITY" }`. If Halisi is unreachable the gate **fails closed** (503), so
an outage never lets a swarm through.

Framework-agnostic core, if you're not on Express:

```js
import { guard } from "halisi-gate";
const decide = guard({ endpoint, context: "vote" });
const { allowed, decision } = await decide(deviceId);
```

## CLI

```bash
npx halisi-gate health                  # is the endpoint up + on DynamoDB?
npx halisi-gate protect --context vote  # print the drop-in snippet
```

## Try the example

A throwaway "free signup" app that knows nothing about Halisi except the one import:

```bash
# in one terminal, from the repo root:
npm run dev
# in another:
HALISI_ENDPOINT=http://localhost:3000 node packages/halisi-gate/example/server.mjs
# open http://localhost:4000 — create an account, then try again or open a new tab
```

## How it decides

The gate forwards `{ context, deviceId }` to `POST /api/demo/cast` on your Halisi endpoint; the device id
is a per-browser cookie. Halisi verifies, runs the two-condition transaction, and returns the decision —
the gate just enforces it. For production WebAuthn, forward a passkey assertion to `POST /api/claim`
instead; the gate contract is identical.

## License

MIT
