"use client";

import type { ClaimDecision, ClaimWrite } from "@/lib/types";

/**
 * The live write-readout: the ACTUAL two-condition DynamoDB TransactWriteItems and the decoded
 * CancellationReasons that decided this claim. This is Halisi's deepest truth made visible — the
 * invariant is enforced AT the write, and you can watch which condition failed.
 */

const DECISION_COLOR: Record<ClaimDecision, string> = {
  ACCEPTED: "var(--accent)",
  DENIED_REPLAY: "var(--replay)",
  DENIED_DUPLICATE_IDENTITY: "var(--duplicate)",
  DENIED_FORGED: "var(--forged)",
};

const DECISION_NOTE: Record<ClaimDecision, string> = {
  ACCEPTED: "both conditions held — committed",
  DENIED_REPLAY: "redemption token already burned",
  DENIED_DUPLICATE_IDENTITY: "this credential already holds a claim",
  DENIED_FORGED: "no write attempted",
};

function shortKey(k: string): string {
  if (k.length <= 32) return k;
  return `${k.slice(0, 24)}…${k.slice(-6)}`;
}

export default function WriteReadout({
  decision,
  latencyMs,
  write,
}: {
  decision: ClaimDecision;
  latencyMs: number;
  write: ClaimWrite | null | undefined;
}) {
  const color = DECISION_COLOR[decision];
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--bg-elev)",
        padding: "14px 16px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.04em" }}>
          {write ? "DynamoDB · TransactWriteItems" : "Issuer.verify"}
        </span>
        <span className="mono faint" style={{ fontSize: 12 }}>{latencyMs.toFixed(2)} ms at the write</span>
      </div>

      {write ? (
        write.conditions.map((c, i) => {
          const ok = c.status === "ok";
          return (
            <div key={i} className="mono" style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
              <span style={{ color: ok ? "var(--accent)" : "var(--forged)", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
              <span style={{ color: "var(--muted)" }}>Put</span>
              <span style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{shortKey(c.key)}</span>
              <span className="faint">if&nbsp;{c.condition}</span>
              {!ok && (
                <span style={{ color: "var(--forged)", marginLeft: "auto", whiteSpace: "nowrap" }}>ConditionalCheckFailed</span>
              )}
            </div>
          );
        })
      ) : (
        <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>
          signature did not verify — the forged token never reached DynamoDB
        </div>
      )}

      <div
        className="mono"
        style={{ fontSize: 13, fontWeight: 700, color, paddingTop: 6, marginTop: 2, borderTop: "1px solid var(--border)" }}
      >
        → {decision}
        <span className="faint" style={{ fontWeight: 400, marginLeft: 10 }}>{DECISION_NOTE[decision]}</span>
      </div>
    </div>
  );
}
