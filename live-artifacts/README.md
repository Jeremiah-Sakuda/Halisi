# Live artifacts

Proof that **Amazon DynamoDB**, not the in-process simulator, enforces the invariant.

| File | What it is | How to produce it |
| --- | --- | --- |
| `live-run.txt` | Transcript of the invariant + a sybil swarm against the real table | `npm run live` (with AWS credentials) |
| `dry-run.txt` | The same suite against the local fake — proves the harness works, **not** a live run | `HALISI_FAKE=1 npm run live` |
| `table.png` | AWS console screenshot of the table + GSI1 + on-demand billing | AWS console → DynamoDB → Tables → Halisi |
| `cost.png` | Cost/usage view showing the run cost pennies | AWS console → Billing, or CloudWatch |

## Capturing the live run

```bash
# 1. credentials in the standard AWS chain, then provision the table once
AWS_REGION=us-east-1 HALISI_TABLE=Halisi npm run provision

# 2. run the invariant + the headline 10k swarm against the real table
HALISI_STORE=dynamo AWS_REGION=us-east-1 LIVE_COUNT=10000 LIVE_M=7 npm run live
```

The transcript records the live table shape (keys, GSI1, Streams), each invariant check
(genuine → accepted, replay → denied, duplicate → denied, forged → denied before the table),
and the swarm collapse to exactly M distinct credentials with p50/p99 write latency and estimated cost.
