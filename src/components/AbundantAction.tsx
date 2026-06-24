"use client";

import { useEffect, useState } from "react";

interface CastResult {
  decision: string;
  latencyMs: number;
  fingerprint: string | null;
  assertion: unknown;
}

const DECISION_COPY: Record<string, { label: string; color: string }> = {
  ACCEPTED: { label: "Accepted — your one vote is recorded", color: "var(--accent)" },
  DENIED_DUPLICATE_IDENTITY: { label: "Denied — this device already voted", color: "var(--duplicate)" },
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
  const [replay, setReplay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setContextId(`vote_${Math.random().toString(36).slice(2)}`);
    setDevice(deviceId());
  }, []);

  async function cast() {
    setBusy(true);
    setReplay(null);
    try {
      const res = await fetch("/api/demo/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextId, deviceId: device }),
      });
      setResult(await res.json());
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
      setReplay(r.decision);
    } finally {
      setBusy(false);
    }
  }

  function newDevice() {
    localStorage.removeItem("halisi-device");
    setDevice(deviceId());
    setResult(null);
    setReplay(null);
  }

  const copy = result ? DECISION_COPY[result.decision] : null;

  return (
    <div className="panel" style={{ padding: 22, display: "grid", gap: 16 }}>
      <div>
        <div className="eyebrow">One vote</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Cast your one vote</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, maxWidth: 560 }}>
          Nothing here is scarce — the poll never closes and never sells out. The only rule is{" "}
          <strong style={{ color: "var(--text)" }}>one vote per real device</strong>. Vote, then try to
          vote again or replay the same token: the database denies it at the write.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="btn btn-primary" onClick={cast} disabled={busy || !contextId}>
          Cast your one vote
        </button>
        <button className="btn" onClick={cast} disabled={busy || !result}>
          Try to vote again
        </button>
        <button className="btn" onClick={replayToken} disabled={busy || !result?.assertion}>
          Replay the same token
        </button>
        <button className="btn" onClick={newDevice} disabled={busy}>
          Use a new device
        </button>
      </div>

      {copy && (
        <div
          className="rise"
          style={{
            border: `1px solid ${copy.color}`,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: copy.color, boxShadow: `0 0 10px ${copy.color}` }} />
          <strong style={{ color: copy.color }}>{copy.label}</strong>
          {result?.fingerprint && (
            <span className="chip mono" style={{ marginLeft: "auto" }}>credential {result.fingerprint}</span>
          )}
          <span className="mono muted" style={{ fontSize: 12 }}>{result?.latencyMs.toFixed(2)} ms at the write</span>
        </div>
      )}

      {replay && (
        <div className="mono" style={{ fontSize: 13, color: "var(--replay)" }}>
          replay of the same token → {replay}
        </div>
      )}
    </div>
  );
}
