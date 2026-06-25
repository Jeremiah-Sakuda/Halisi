"use client";

import { useEffect, useState } from "react";
import LiveLedger from "./LiveLedger";

interface AllocResult {
  decision: string;
  latencyMs: number;
  fingerprint: string | null;
  wallet: string;
}

const COPY: Record<string, { label: string; color: string }> = {
  ACCEPTED: { label: "Allocation granted", color: "var(--accent)" },
  DENIED_DUPLICATE_IDENTITY: { label: "Denied — this credential already has an allocation", color: "var(--duplicate)" },
  DENIED_REPLAY: { label: "Denied — that token was already redeemed", color: "var(--replay)" },
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

function sampleWallet(): string {
  const hex = "0123456789abcdef";
  let w = "0x";
  for (let i = 0; i < 40; i++) w += hex[Math.floor(Math.random() * 16)];
  return w;
}

export default function AllocationDemo() {
  const [campaignId, setCampaignId] = useState("");
  const [device, setDevice] = useState("");
  const [wallet, setWallet] = useState("");
  const [result, setResult] = useState<AllocResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCampaignId(`airdrop_${Math.random().toString(36).slice(2)}`);
    setDevice(deviceId());
    setWallet(sampleWallet());
  }, []);

  async function claim() {
    if (!wallet) return;
    setBusy(true);
    try {
      const res = await fetch("/api/demo/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, deviceId: device, wallet }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  function newWallet() {
    setWallet(sampleWallet());
  }

  function newDevice() {
    localStorage.removeItem("halisi-device");
    setDevice(deviceId());
    setResult(null);
  }

  const copy = result ? COPY[result.decision] : null;

  return (
    <div className="panel" style={{ padding: 22, display: "grid", gap: 16 }}>
      <div>
        <div className="eyebrow">Airdrop · one allocation per human</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Claim your token allocation</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, maxWidth: 580 }}>
          One allocation per attested credential — bound to your wallet. The fingerprint is anchored to the
          device, not the wallet, so a single device <strong style={{ color: "var(--text)" }}>cannot farm
          allocations across many wallets</strong>. Change the wallet and claim again from the same device:
          the database denies it.
        </p>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
          Wallet address
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="mono"
            value={wallet}
            onChange={(e) => setWallet(e.target.value.trim())}
            spellCheck={false}
            aria-label="Wallet address"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              padding: "10px 12px",
              fontSize: 13,
            }}
          />
          <button className="btn" onClick={newWallet} disabled={busy}>New wallet</button>
        </div>
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="btn btn-primary" onClick={claim} disabled={busy || !wallet || !campaignId}>
          Claim allocation
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
          {result?.decision === "ACCEPTED" && (
            <span className="chip mono" style={{ maxWidth: "100%" }}>→ {result.wallet.slice(0, 10)}…{result.wallet.slice(-6)}</span>
          )}
          <span className="mono muted" style={{ fontSize: 12, marginLeft: "auto" }}>{result?.latencyMs.toFixed(2)} ms at the write</span>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        {campaignId && <LiveLedger contextId={campaignId} />}
      </div>
    </div>
  );
}
