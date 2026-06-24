"use client";

import type { CollapseRun } from "@/lib/ui";
import { formatCostUsd } from "@/lib/metrics";
import { useCountUp } from "./useCountUp";

/** The live readouts under the collapse: attempts, the handful accepted, latency, and cost. */
export default function StatsBar({ run }: { run: CollapseRun | null }) {
  const trigger = run?.runId ?? 0;
  const attempts = useCountUp(run?.attempts ?? 0, trigger);
  const accepted = useCountUp(run?.accepted ?? 0, trigger);
  const distinct = useCountUp(run?.distinctFingerprints ?? 0, trigger);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
      }}
    >
      <Stat label="Attempts fired" value={Math.round(attempts).toLocaleString()} tone="muted" />
      <Stat
        label="Distinct credentials"
        value={Math.round(distinct).toLocaleString()}
        tone="accent"
        sub={`${Math.round(accepted)} accepted`}
      />
      <Stat
        label="p99 write latency"
        value={run ? `${run.p99LatencyMs.toFixed(1)} ms` : "—"}
        tone="muted"
      />
      <Stat
        label="Estimated AWS cost"
        value={run ? formatCostUsd(run.estimatedCostUsd) : "—"}
        tone="muted"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "accent" | "muted";
}) {
  return (
    <div className="panel" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 26,
          fontWeight: 700,
          marginTop: 6,
          color: tone === "accent" ? "var(--accent)" : "var(--text)",
          textShadow: tone === "accent" ? "0 0 24px rgba(53,227,180,0.45)" : "none",
        }}
      >
        {value}
      </div>
      {sub && <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
