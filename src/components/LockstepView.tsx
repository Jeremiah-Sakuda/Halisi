"use client";

import { useState } from "react";
import type { CollapseRun } from "@/lib/ui";
import CollapseCanvas from "./CollapseCanvas";

const COUNTS = [1_000, 5_000, 10_000];
const CREDENTIALS = [1, 3, 7, 12];

interface EngineTally {
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  distinctFingerprints: number;
  acceptedFingerprints: string[];
}

interface LockstepResult {
  mode: string;
  seed: number;
  count: number;
  total: number;
  matches: number;
  mismatchIndex: number;
  memory: EngineTally;
  dynamo: EngineTally;
}

function toRun(t: EngineTally, total: number, mode: string, runId: number): CollapseRun {
  return {
    runId,
    mode,
    attempts: total,
    accepted: t.accepted,
    deniedForged: t.deniedForged,
    deniedReplay: t.deniedReplay,
    deniedDuplicate: t.deniedDuplicate,
    distinctFingerprints: t.distinctFingerprints,
    fingerprints: t.acceptedFingerprints,
    p50LatencyMs: 0,
    p99LatencyMs: 0,
    estimatedCostUsd: 0,
  };
}

export default function LockstepView() {
  const [count, setCount] = useState(10_000);
  const [m, setM] = useState(3);
  const [seed, setSeed] = useState(2026);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LockstepResult | null>(null);
  const [runs, setRuns] = useState<{ memory: CollapseRun; dynamo: CollapseRun } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/harness/lockstep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, distinctCredentials: m, mode: "mixed", seed }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "lockstep failed");
      const r: LockstepResult = await res.json();
      const runId = Date.now();
      setResult(r);
      setRuns({ memory: toRun(r.memory, r.total, r.mode, runId), dynamo: toRun(r.dynamo, r.total, r.mode, runId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "lockstep failed");
    } finally {
      setRunning(false);
    }
  }

  const matched = result ? result.matches === result.total : false;

  return (
    <div className="panel" style={{ padding: 20, display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow">Two-engine lockstep</div>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Same swarm, two engines, identical decisions</h2>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
          One prepared swarm runs through both backends at once. They move in lockstep because they enforce
          the same invariant — not because anything is hardcoded. The right panel is the real DynamoDB store
          code (conditional <span className="mono">TransactWriteItems</span>, cancellation reasons, collapse
          query) over a faithful in-process double — <strong style={{ color: "var(--text)" }}>not a live AWS
          call</strong>.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" }}>
        <Field label="Fakes (N)">
          <Segmented options={COUNTS.map((c) => ({ value: c, label: c.toLocaleString() }))} value={count} onChange={setCount} />
        </Field>
        <Field label="Real authenticators (M)">
          <Segmented options={CREDENTIALS.map((c) => ({ value: c, label: String(c) }))} value={m} onChange={setM} />
        </Field>
        <Field label="Seed">
          <input
            className="mono"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            aria-label="Swarm seed"
            style={{ width: 96, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "10px", fontSize: 13 }}
          />
        </Field>
        <button className="btn btn-primary" onClick={run} disabled={running}>
          {running ? "Running both engines…" : "Run the lockstep"}
        </button>
      </div>

      {error && <div style={{ color: "var(--forged)", fontSize: 13 }}>⚠ {error}</div>}

      <div className="lockstep-grid">
        <EnginePanel title="In-process engine" subtitle="MemoryClaimStore" run={runs?.memory ?? null} />
        <Seam result={result} matched={matched} running={running} />
        <EnginePanel title="DynamoDB code path" subtitle="FakeDynamo · not live AWS" run={runs?.dynamo ?? null} accent />
      </div>

      {result && (
        <div className="sr-only" role="status" aria-live="polite">
          {result.matches} of {result.total} decisions matched across the two engines.
        </div>
      )}
    </div>
  );
}

function EnginePanel({ title, subtitle, run, accent }: { title: string; subtitle: string; run: CollapseRun | null; accent?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: accent ? "var(--accent)" : "var(--text)" }}>{title}</div>
        <div className="mono faint" style={{ fontSize: 11.5 }}>{subtitle}</div>
      </div>
      <div
        style={{
          position: "relative",
          height: "clamp(220px, 40vw, 300px)",
          borderRadius: 14,
          border: `1px solid ${accent ? "rgba(53,227,180,0.3)" : "var(--border)"}`,
          background: "radial-gradient(500px 240px at 50% 40%, rgba(124,92,255,0.07), transparent 70%)",
          overflow: "hidden",
        }}
      >
        <CollapseCanvas run={run} />
      </div>
      {run && (
        <div className="mono faint" style={{ fontSize: 11.5, textAlign: "center" }}>
          {run.distinctFingerprints} accepted · {(run.deniedForged + run.deniedReplay + run.deniedDuplicate).toLocaleString()} denied
        </div>
      )}
    </div>
  );
}

function Seam({ result, matched, running }: { result: LockstepResult | null; matched: boolean; running: boolean }) {
  const color = matched ? "var(--accent)" : result ? "var(--forged)" : "var(--faint)";
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 6, minWidth: 120, padding: "8px 4px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)" }}>
        decisions
      </div>
      <div className="mono" style={{ fontSize: "clamp(18px, 2.4vw, 24px)", fontWeight: 800, color, textShadow: matched ? "0 0 22px rgba(53,227,180,0.5)" : "none", textAlign: "center" }}>
        {running ? "…" : result ? `${result.matches.toLocaleString()} / ${result.total.toLocaleString()}` : "—"}
      </div>
      <div style={{ fontSize: 12, color }}>
        {running ? "comparing…" : result ? (matched ? "✓ MATCH" : `✗ diverged @ ${result.mismatchIndex}`) : "run to compare"}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>{label}</span>
      {children}
    </div>
  );
}

const activeStyle: React.CSSProperties = {
  borderColor: "var(--accent)",
  color: "var(--accent)",
  background: "rgba(53,227,180,0.08)",
};

function Segmented<T extends number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <button key={o.value} className="btn mono" onClick={() => onChange(o.value)} style={value === o.value ? activeStyle : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
