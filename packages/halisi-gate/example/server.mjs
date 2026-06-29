/**
 * A throwaway "free signup" app that knows NOTHING about Halisi — except one import and one guard call.
 * Run a Halisi instance (npm run dev) and HALISI_ENDPOINT, then:  node example/server.mjs
 *
 * In a real app the import is `from "halisi-gate"`; here it is the relative path.
 */
import { createServer } from "node:http";
import { deviceCookie, guard } from "../index.mjs";

const endpoint = process.env.HALISI_ENDPOINT || "http://localhost:3000";
const decide = guard({ endpoint, context: "free-signup" });

const page = (msg, color) => `<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;background:#06070b;color:#eef1f7;display:grid;place-items:center;height:100vh;margin:0">
<form method="post" action="/signup" style="text-align:center">
  <h1>Acme — start your free trial</h1>
  ${msg ? `<p style="color:${color}">${msg}</p>` : "<p style='opacity:.6'>One free account per human.</p>"}
  <button style="font-size:16px;padding:12px 22px;border-radius:10px;border:0;background:#35e3b4;color:#04130f;font-weight:700;cursor:pointer">Create my free account</button>
  <p style="opacity:.5;font-size:13px">Try again, or open a new tab — Halisi denies the second one.</p>
</form></body>`;

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/signup") {
    const deviceId = deviceCookie(req, res);
    const result = await decide(deviceId);
    res.setHeader("content-type", "text/html");
    if (result.allowed) {
      res.end(page(`✓ Account created — welcome. (${result.decision}, ${result.latencyMs?.toFixed(2)}ms at the write)`, "#35e3b4"));
    } else {
      res.statusCode = 403;
      res.end(page(`✗ Denied: ${result.decision} — this device already used its free trial.`, "#ff6b81"));
    }
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(page(null));
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`acme free-signup (guarded by halisi-gate) → http://localhost:${port}  ·  Halisi at ${endpoint}`));
