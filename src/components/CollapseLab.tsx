"use client";

import { useMemo, useState } from "react";
import { SWARM_MODES, type CollapseRun } from "@/lib/ui";
import CollapseCanvas from "./CollapseCanvas";
import StatsBar from "./StatsBar";

const COUNTS = [1_000, 5_000, 10_000];
const CREDENTIALS = [1, 3, 7, 12];

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ctx-${Math.random().toString(36).slice(2)}`;
}

export default function CollapseLab() {
  const [baseId, setBaseId] = useState(uuid);
  const [fireCount, setFireCount] = useState(0);
  const [mode, setMode] = useState<string>("mixed");
  const [count, setCount] = useState(10_000);
  const [m, setM] = useState(3);
  const [seed, setSeed] = useState(2026);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<CollapseRun | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire() {
    setRunning(true);
    setError(null);
    // A fresh context per fire keeps each run independent — so the SAME seed reproduces the SAME result.
    const fc = fireCount + 1;
    setFireCount(fc);
    try {
      const res = await fetch("/api/harness/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextId: `${baseId}-${fc}`,
          count,
          distinctCredentials: mode === "forged" ? 0 : m,
          mode,
          seed,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "swarm failed");
      const s = await res.json();
      setStore(s.store ?? null);
      setRun({
        runId: Date.now(),
        mode: s.mode,
        attempts: s.attempts,
        accepted: s.accepted,
        deniedForged: s.deniedForged,
        deniedReplay: s.deniedReplay,
        deniedDuplicate: s.deniedDuplicate,
        distinctFingerprints: s.distinctFingerprints,
        fingerprints: s.acceptedFingerprints ?? [],
        p50LatencyMs: s.p50LatencyMs,
        p99LatencyMs: s.p99LatencyMs,
        estimatedCostUsd: s.estimatedCostUsd,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "swarm failed");
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setBaseId(uuid());
    setRun(null);
    setError(null);
  }

  async function downloadReceipt() {
    const res = await fetch("/api/harness/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, distinctCredentials: mode === "forged" ? 0 : m, mode, seed }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "halisi-receipt.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel" style={{ padding: 20, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="eyebrow">Attacker console</div>
          <h2 style={{ fontSize: 22, marginTop: 6 }}>Build your own sybil army</h2>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6, maxWidth: 580, lineHeight: 1.5 }}>
            You set the attacker&apos;s true power. Fire as many fakes as you like — the database accepts
            exactly the number of{" "}
            <strong style={{ color: "var(--text)" }}>real authenticators you actually control</strong>, never
            the size of the swarm.
          </p>
        </div>
        {store && (
          <span className="chip" title="The active ClaimStore backend">
            <span className="dot" style={{ background: store === "dynamo" ? "var(--accent)" : "var(--replay)" }} />
            {store === "dynamo" ? "Amazon DynamoDB" : "in-process engine"}
          </span>
        )}
      </div>

      <Controls
        mode={mode}
        setMode={setMode}
        count={count}
        setCount={setCount}
        m={m}
        setM={setM}
        seed={seed}
        setSeed={setSeed}
        onRandomizeSeed={() => setSeed(Math.floor(Math.random() * 100000))}
        running={running}
        hasRun={!!run}
        onFire={fire}
        onReset={reset}
      />

      <div
        style={{
          position: "relative",
          height: "clamp(280px, 56vw, 360px)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          background: "radial-gradient(600px 300px at 50% 40%, rgba(124,92,255,0.08), transparent 70%)",
          overflow: "hidden",
        }}
      >
        <CollapseCanvas run={run} />
      </div>

      <ResultHeadline run={run} />

      <div className="sr-only" role="status" aria-live="polite">
        {run
          ? `${run.attempts.toLocaleString()} attempts collapsed to ${run.distinctFingerprints} distinct attested credentials. ${run.accepted} accepted, ${run.deniedForged + run.deniedReplay + run.deniedDuplicate} denied at the write. p99 ${run.p99LatencyMs.toFixed(1)} milliseconds.`
          : ""}
      </div>

      {error && <div style={{ color: "var(--forged)", fontSize: 13 }}>⚠ {error}</div>}

      <StatsBar run={run} />
      {run && store === "memory" && (
        <div className="faint" style={{ fontSize: 12 }}>
          Latency and cost are measured on the in-process engine — run on <span className="mono">HALISI_STORE=dynamo</span>{" "}
          for live DynamoDB figures. The collapse count is exact on either backend.
        </div>
      )}
      <DenialLegend run={run} />
      <NodeList run={run} />

      <div
        style={{
          border: "1px dashed var(--border-strong)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button className="btn" onClick={downloadReceipt} disabled={running}>
            Download signed receipt
          </button>
          <span className="faint" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            Take the proof home — turn Wi-Fi off and re-verify the collapse yourself, no trust required.
          </span>
        </div>
        <code className="mono" style={{ fontSize: 12, color: "var(--muted)", overflowWrap: "anywhere" }}>
          node scripts/verify-receipt.mjs halisi-receipt.json
        </code>
      </div>

      <a href="/proof" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
        Think the real DynamoDB would behave differently? See both engines run in lockstep →
      </a>
    </div>
  );
}

function Controls(props: {
  mode: string;
  setMode: (m: string) => void;
  count: number;
  setCount: (c: number) => void;
  m: number;
  setM: (m: number) => void;
  seed: number;
  setSeed: (s: number) => void;
  onRandomizeSeed: () => void;
  running: boolean;
  hasRun: boolean;
  onFire: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Field label="Attack mode">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SWARM_MODES.map((opt) => (
            <button
              key={opt.value}
              className="btn"
              onClick={() => props.setMode(opt.value)}
              style={props.mode === opt.value ? activeStyle : undefined}
              title={opt.hint}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <Field label="Fake attempts to fire (N)">
          <Segmented options={COUNTS.map((c) => ({ value: c, label: c.toLocaleString() }))} value={props.count} onChange={props.setCount} />
        </Field>
        <Field label="Real authenticators you control (M)">
          <Segmented options={CREDENTIALS.map((c) => ({ value: c, label: String(c) }))} value={props.m} onChange={props.setM} disabled={props.mode === "forged"} />
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4, maxWidth: 300 }}>
            {props.mode === "forged"
              ? "Forged-only: zero real credentials → zero accepted."
              : "The one thing the attacker can't fake. In production a hardware passkey; here a simulated HMAC."}
          </span>
        </Field>
        <Field label="Seed">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="mono"
              type="number"
              value={props.seed}
              onChange={(e) => props.setSeed(Number(e.target.value) || 0)}
              aria-label="Swarm seed"
              style={{
                width: 96,
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                padding: "10px 10px",
                fontSize: 13,
              }}
            />
            <button className="btn" onClick={props.onRandomizeSeed} disabled={props.running} title="Randomize the seed" aria-label="Randomize seed">
              ⟳
            </button>
          </div>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={props.onFire} disabled={props.running}>
          {props.running ? "Collapsing…" : "Fire the swarm"}
        </button>
        {props.hasRun && (
          <button className="btn" onClick={props.onFire} disabled={props.running} title="Same seed → byte-identical collapse">
            Re-fire identical seed
          </button>
        )}
        <button className="btn" onClick={props.onReset} disabled={props.running}>
          Reset
        </button>
      </div>
    </div>
  );
}

/** The punchline: a flood of fakes resolving to exactly the number of real humans the attacker controls. */
function ResultHeadline({ run }: { run: CollapseRun | null }) {
  if (!run) return null;
  return (
    <div style={{ textAlign: "center", padding: "2px 0" }}>
      <span className="mono" style={{ fontSize: "clamp(17px, 3.4vw, 26px)", fontWeight: 700 }}>
        <span style={{ color: "var(--muted)" }}>{run.attempts.toLocaleString()} fakes</span>
        <span style={{ color: "var(--faint)", margin: "0 12px" }}>→</span>
        <span style={{ color: "var(--accent)", textShadow: "0 0 24px rgba(53,227,180,0.5)" }}>
          {run.distinctFingerprints} real {run.distinctFingerprints === 1 ? "human" : "humans"}
        </span>
      </span>
    </div>
  );
}

const activeStyle: React.CSSProperties = {
  borderColor: "var(--accent)",
  color: "var(--accent)",
  background: "rgba(53,227,180,0.08)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      {options.map((o) => (
        <button key={o.value} className="btn mono" onClick={() => onChange(o.value)} style={value === o.value ? activeStyle : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DenialLegend({ run }: { run: CollapseRun | null }) {
  const rows = [
    { key: "accepted", label: "Accepted (real)", color: "var(--accent)", value: run?.accepted },
    { key: "forged", label: "Forged — bad signature", color: "var(--forged)", value: run?.deniedForged },
    { key: "replay", label: "Replayed — already redeemed", color: "var(--replay)", value: run?.deniedReplay },
    { key: "duplicate", label: "Reused — same credential", color: "var(--duplicate)", value: run?.deniedDuplicate },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
          <span className="muted">{r.label}</span>
          <span className="mono" style={{ marginLeft: "auto", color: "var(--text)" }}>
            {r.value != null ? r.value.toLocaleString() : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function NodeList({ run }: { run: CollapseRun | null }) {
  const fps = useMemo(() => run?.fingerprints ?? [], [run]);
  if (!run || fps.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
        {fps.length} distinct attested credential{fps.length === 1 ? "" : "s"}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {fps.map((fp) => (
          <span key={fp} className="chip mono" style={{ borderColor: "rgba(53,227,180,0.35)" }}>
            <span className="dot" /> {fp}
          </span>
        ))}
      </div>
    </div>
  );
}
