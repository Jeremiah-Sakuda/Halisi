#!/usr/bin/env node
/**
 * halisi-gate CLI.
 *
 *   npx halisi-gate health                 # check a Halisi endpoint is reachable + on dynamo
 *   npx halisi-gate protect --context X    # print the drop-in middleware snippet
 */
const args = process.argv.slice(2);
const cmd = args[0] || "help";

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const endpoint = flag("endpoint", process.env.HALISI_ENDPOINT || "http://localhost:3000");
const context = flag("context", "free-signup");

async function health() {
  try {
    const res = await fetch(`${endpoint}/api/health`);
    const body = await res.json();
    console.log(`halisi-gate · ${endpoint}`);
    console.log(`  ok:    ${body.ok}`);
    console.log(`  store: ${body.store}${body.store === "dynamo" ? " (Amazon DynamoDB)" : ""}`);
    console.log(`  table: ${body.table}`);
    process.exit(body.ok ? 0 : 1);
  } catch (e) {
    console.error(`halisi-gate: ${endpoint} is unreachable — ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

function snippet() {
  console.log(`# Keep "${context}" one-per-human. Add to your Express app:

  import { halisiGate } from "halisi-gate";

  app.post("/${context}", halisiGate({
    endpoint: "${endpoint}",
    context: "${context}",
  }), (req, res) => {
    // only real, first-time humans reach here — req.halisi has the decision
    res.send("welcome");
  });

# Set HALISI_ENDPOINT to your deployed Halisi (running on dynamo). That's it.`);
}

switch (cmd) {
  case "health":
    await health();
    break;
  case "protect":
  case "snippet":
    snippet();
    break;
  default:
    console.log(`halisi-gate — one claim per attested human, dropped into any app.

  halisi-gate health                  check a Halisi endpoint
  halisi-gate protect --context NAME  print the drop-in middleware

  --endpoint URL   (default: $HALISI_ENDPOINT or http://localhost:3000)
  --context NAME   the action to keep one-per-human (default: free-signup)`);
}
