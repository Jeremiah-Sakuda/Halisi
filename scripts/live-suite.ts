/**
 * Run the invariant + a sybil swarm against the REAL DynamoDB table and capture a transcript.
 *
 *   AWS_REGION=us-east-1 HALISI_TABLE=Halisi npx tsx scripts/live-suite.ts
 *   LIVE_COUNT=10000 LIVE_M=7 npx tsx scripts/live-suite.ts     # the headline 10k run
 *
 * Writes the transcript to live-artifacts/live-run.txt — the captured proof that DynamoDB, not the
 * in-process simulator, enforces the invariant. This is the artifact a database hackathon needs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { newClaimId, newCredentialId } from "@/lib/ids";
import { SimulatedAuthenticator, SimulatedIssuer } from "@/lib/issuer/SimulatedIssuer";
import { redeem } from "@/lib/claim/redeem";
import { runSwarm } from "@/lib/harness/swarm";
import { formatCostUsd } from "@/lib/metrics";
import { DynamoClaimStore, type DocClient } from "@/lib/store/DynamoClaimStore";
import { makeDocClient, tableName } from "@/lib/store/client";
import { FakeDynamo } from "@/lib/store/fakeDynamo";
import { ATTR, GSI1_NAME } from "@/lib/store/schema";
import type { ClaimDecision } from "@/lib/types";

const region = process.env.AWS_REGION || "us-east-1";
const table = tableName();
const count = Number(process.env.LIVE_COUNT || 2000);
const M = Number(process.env.LIVE_M || 5);
/** A local dry run validates the whole flow with no AWS account; it is NOT the live artifact. */
const useFake = process.env.HALISI_FAKE === "1";

const lines: string[] = [];
function out(line = ""): void {
  lines.push(line);
  console.log(line);
}

let passed = 0;
let failed = 0;
function check(label: string, actual: ClaimDecision, expected: ClaimDecision): void {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  out(`   [${ok ? "PASS" : "FAIL"}] ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

async function describe(): Promise<void> {
  if (useFake) {
    out("── table shape (LOCAL DRY RUN — not a live AWS run) ────────────");
    out(`   name:    ${table}`);
    out(`   keys:    ${ATTR.pk}/HASH, ${ATTR.sk}/RANGE`);
    out(`   gsi:     ${GSI1_NAME} [${ATTR.gsi1pk}/HASH, ${ATTR.gsi1sk}/RANGE]`);
    out("   note:    run `npm run live` with AWS credentials to produce the live artifact.");
    out("");
    return;
  }
  const client = new DynamoDBClient({
    region,
    ...(process.env.HALISI_DDB_ENDPOINT ? { endpoint: process.env.HALISI_DDB_ENDPOINT } : {}),
  });
  const { Table } = await client.send(new DescribeTableCommand({ TableName: table }));
  out("── table shape (live) ─────────────────────────────────────────");
  out(`   name:    ${Table?.TableName}`);
  out(`   status:  ${Table?.TableStatus}`);
  out(`   billing: ${Table?.BillingModeSummary?.BillingMode ?? "PROVISIONED"}`);
  out(`   keys:    ${(Table?.KeySchema ?? []).map((k) => `${k.AttributeName}/${k.KeyType}`).join(", ")}`);
  for (const gsi of Table?.GlobalSecondaryIndexes ?? []) {
    out(`   gsi:     ${gsi.IndexName} [${(gsi.KeySchema ?? []).map((k) => `${k.AttributeName}/${k.KeyType}`).join(", ")}] (${gsi.IndexStatus})`);
  }
  out(`   stream:  ${Table?.StreamSpecification?.StreamEnabled ? Table.StreamSpecification.StreamViewType : "disabled"}`);
  out(`   items:   ${Table?.ItemCount ?? 0}`);
  out("");
}

async function scenarios(issuer: SimulatedIssuer, store: DynamoClaimStore): Promise<void> {
  const ctx = `live-scn-${Date.now()}`;
  await store.createContext({ contextId: ctx, label: "Live scenario", kind: "vote", createdAt: Date.now() });
  out("── invariant, scenario by scenario (live table) ───────────────");

  const auth = new SimulatedAuthenticator(newCredentialId());
  auth.registerWith(issuer);
  const a1 = auth.assert(await issuer.issueChallenge(ctx));
  check("genuine claim accepted", (await redeem(issuer, store, a1, newClaimId(), Date.now())).decision, "ACCEPTED");
  check("same token replayed → denied", (await redeem(issuer, store, a1, newClaimId(), Date.now())).decision, "DENIED_REPLAY");

  const a2 = auth.assert(await issuer.issueChallenge(ctx));
  check("same credential, fresh token → duplicate", (await redeem(issuer, store, a2, newClaimId(), Date.now())).decision, "DENIED_DUPLICATE_IDENTITY");

  const stranger = new SimulatedAuthenticator(newCredentialId());
  const fa = stranger.assert(await issuer.issueChallenge(ctx), { forgeAttestation: true });
  check("forged credential → denied before the table", (await redeem(issuer, store, fa, newClaimId(), Date.now())).decision, "DENIED_FORGED");

  const collapse = await store.collapse(ctx);
  const ok = collapse.distinctFingerprints === 1;
  if (ok) passed++;
  else failed++;
  out(`   [${ok ? "PASS" : "FAIL"}] collapse(ctx) = ${collapse.distinctFingerprints} distinct credential${collapse.distinctFingerprints === 1 ? "" : "s"}`);
  out("");
}

async function swarm(issuer: SimulatedIssuer, store: DynamoClaimStore): Promise<void> {
  const ctx = `live-swarm-${Date.now()}`;
  await store.createContext({ contextId: ctx, label: "Live swarm", kind: "trial", createdAt: Date.now() });
  out(`── sybil swarm on the live table (${count} attempts, ${M} real credentials) ──`);
  const summary = await runSwarm(issuer, store, { contextId: ctx, count, distinctCredentials: M, mode: "mixed", seed: 2026 });

  const collapsedToM = summary.distinctFingerprints === M;
  if (collapsedToM) passed++;
  else failed++;
  out(`   attempts:           ${summary.attempts}`);
  out(`   accepted:           ${summary.accepted}`);
  out(`   denied (forged):    ${summary.deniedForged}`);
  out(`   denied (replay):    ${summary.deniedReplay}`);
  out(`   denied (duplicate): ${summary.deniedDuplicate}`);
  out(`   [${collapsedToM ? "PASS" : "FAIL"}] collapsed to ${summary.distinctFingerprints} distinct credentials (target ${M})`);
  out(`   write latency:      p50 ${summary.p50LatencyMs.toFixed(2)}ms · p99 ${summary.p99LatencyMs.toFixed(2)}ms`);
  out(`   estimated cost:     ${formatCostUsd(summary.estimatedCostUsd)}`);
  out("");
}

async function main(): Promise<void> {
  if (process.env.HALISI_STORE !== "dynamo") process.env.HALISI_STORE = "dynamo";
  out(`═══ Halisi · ${useFake ? "DynamoDB store dry run (local fake)" : "live DynamoDB run"} ═══════════`);
  out(`   when:   ${new Date().toISOString()}`);
  out(`   region: ${region}`);
  out(`   table:  ${table}`);
  out("");

  const client: DocClient = useFake ? new FakeDynamo() : makeDocClient();
  const store = new DynamoClaimStore(client, table);
  const issuer = new SimulatedIssuer();

  await describe();
  await scenarios(issuer, store);
  await swarm(issuer, store);

  out("═══ result ════════════════════════════════════════════════════");
  out(`   ${passed} checks passed, ${failed} failed`);
  out(failed === 0 ? "   ✓ the live table enforced the invariant on every check." : "   ✗ see failures above.");

  const outfile = useFake ? "live-artifacts/dry-run.txt" : "live-artifacts/live-run.txt";
  mkdirSync("live-artifacts", { recursive: true });
  writeFileSync(outfile, lines.join("\n") + "\n");
  out("");
  out(`   transcript → ${outfile}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("live-suite failed:", error);
  process.exitCode = 1;
});
