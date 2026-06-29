"use client";

import { useEffect, useState } from "react";
import type { ClaimDecision, ClaimWrite } from "@/lib/types";
import LiveLedger from "./LiveLedger";
import WriteReadout from "./WriteReadout";

interface CastResult {
  decision: ClaimDecision;
  latencyMs: number;
  fingerprint: string | null;
  write: ClaimWrite | null;
  assertion: unknown;
}

interface LatestClaim {
  decision: ClaimDecision;
  latencyMs: number;
  write: ClaimWrite | null;
  kind: "trial" | "replay";
}

const DECISION_COPY: Record<ClaimDecision, { label: string; color: string }> = {
  ACCEPTED: { label: "Free trial started — one per human", color: "var(--accent)" },
  DENIED_DUPLICATE_IDENTITY: { label: "Denied — this device already used its free trial", color: "var(--duplicate)" },
  DENIED_REPLAY: { label: "Denied — that token was already redeemed", color: "var(--replay)" },
  DENIED_FORGED: { label: "Denied — that credential never verified", color: "var(--forged)" },
};

function deviceId(): string {
  const KEY = "halisi-device";
  let id = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  if (!id) {
    id = `device_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export default function AbundantAction() {
  const [contextId, setContextId] = useState<string>("");
  const [device, setDevice] = useState<string>("");
  const [result, setResult] = useState<CastResult | null>(null);
  const [latest, setLatest] = useState<LatestClaim | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setContextId(`trial_${Math.random().toString(36).slice(2)}`);
    setDevice(deviceId());
  }, []);

  async function startTrial() {
    setBusy(true);
    try {
      const res = await fetch("/api/demo/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextId, deviceId: device }),
      });
      const r: CastResult = await res.json();
      setResult(r);
      setLatest({ decision: r.decision, latencyMs: r.latencyMs, write: r.write, kind: "trial" });
    } finally {
      setBusy(false);
    }
  }

  async function replayToken() {
    if (!result?.assertion) return;
    setBusy(true);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion: result.assertion, claimId: crypto.randomUUID() }),
      });
      const r = await res.json();
      setLatest({ decision: r.decision, latencyMs: r.latencyMs, write: r.write, kind: "replay" });
    } finally {
      setBusy(false);
    }
  }

  function newDevice() {
    localStorage.removeItem("halisi-device");
    setDevice(deviceId());
    setResult(null);
    setLatest(null);
  }

  const copy = latest ? DECISION_COPY[latest.decision] : null;

  return (
    <div className="panel" style={{ padding: 22, display: "grid", gap: 16 }}>
      <div>
        <div className="eyebrow">One free trial per human</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Start your free trial</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, maxWidth: 580 }}>
          Free trials are abundant — this one never expires, and any number of real people can start one.
          The only rule is <strong style={{ color: "var(--text)" }}>one trial per real human</strong>. Start
          a trial, then try to start another or replay the token — and watch DynamoDB deny it at the write
          below.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="btn btn-primary" onClick={startTrial} disabled={busy || !contextId}>
          Start your free trial
        </button>
        <button className="btn" onClick={startTrial} disabled={busy || !result}>
          Start another trial
        </button>
        <button className="btn" onClick={replayToken} disabled={busy || !result?.assertion}>
          Replay the same token
        </button>
        <button className="btn" onClick={newDevice} disabled={busy}>
          Use a new device
        </button>
      </div>

      {copy && latest && (
        <div
          className="rise"
          style={{
            border: `1px solid ${copy.color}`,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: copy.color, boxShadow: `0 0 10px ${copy.color}` }} />
          <strong style={{ color: copy.color }}>{copy.label}</strong>
          {latest.kind === "replay" && <span className="chip" style={{ borderColor: "var(--replay)" }}>replayed token</span>}
          {result?.fingerprint && latest.kind === "trial" && (
            <span className="chip mono" style={{ marginLeft: "auto" }}>credential {result.fingerprint}</span>
          )}
        </div>
      )}

      {latest && (
        <div className="rise">
          <WriteReadout decision={latest.decision} latencyMs={latest.latencyMs} write={latest.write} />
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        {contextId && <LiveLedger contextId={contextId} />}
      </div>
    </div>
  );
}
