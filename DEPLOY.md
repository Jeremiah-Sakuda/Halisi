# Deploying Halisi

Halisi runs on **Vercel** with **Amazon DynamoDB** as the backend, region-pinned to `us-east-1`
(`iad1`) so the API functions sit next to the table.

## 1. Provision the DynamoDB table

With AWS credentials in the standard chain (env vars, shared config, or a role):

```bash
AWS_REGION=us-east-1 HALISI_TABLE=Halisi npm run provision
```

This creates the single table with `GSI1` and Streams enabled, on-demand billing. It is idempotent.

Capture the proof:

```bash
HALISI_STORE=dynamo AWS_REGION=us-east-1 LIVE_COUNT=10000 LIVE_M=7 npm run live
# → live-artifacts/live-run.txt  (invariant + 10k swarm against the real table)
```

Add an AWS console screenshot of the table + GSI to `live-artifacts/table.png`.

## 2. Create an IAM policy for the app

The app needs only these actions on the table and its index:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:TransactWriteItems"],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/Halisi",
        "arn:aws:dynamodb:us-east-1:*:table/Halisi/index/GSI1"
      ]
    }
  ]
}
```

## 3. Configure Vercel

`vercel.json` already pins functions to `iad1`. Set these environment variables in the Vercel project:

| Variable | Value |
| --- | --- |
| `HALISI_STORE` | `dynamo` |
| `HALISI_TABLE` | `Halisi` |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | _(an access key for the IAM policy above)_ |
| `AWS_SECRET_ACCESS_KEY` | _(the secret)_ |
| `HALISI_SERVER_SECRET` | _(a long random string — the attestation secret)_ |
| `HALISI_ORIGIN` | _(your deployed origin, e.g. `https://halisi.vercel.app`)_ |
| `HALISI_RP_ID` | _(your domain, e.g. `halisi.vercel.app`)_ |

Then deploy:

```bash
vercel --prod
```

## 4. Verify the deployment

- The home page loads and the **store badge reads "Amazon DynamoDB."**
- Firing a swarm collapses to N and the latency/cost readouts update.
- Casting a vote, voting again (duplicate), and replaying the token (replay) all behave.

## Local development

Defaults to the in-process engine — no AWS needed:

```bash
cp .env.example .env.local
npm run dev
```

Set `HALISI_STORE=dynamo` (plus credentials, or `HALISI_DDB_ENDPOINT` for a local DynamoDB) to run
against the real backend locally.
