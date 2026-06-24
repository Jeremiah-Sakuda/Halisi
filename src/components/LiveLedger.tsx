"use client";

import { useEffect, useRef, useState } from "react";

interface Entry {
  id: number;
  fingerprint?: string;
  decision: string;
}

/**
 * The live ledger feed (Server-Sent Events). In production this is fed by DynamoDB Streams; in the demo
 * the claim path publishes directly. Either way, each accepted identity arrives here as it lands.
 */
export default function LiveLedger({ contextId }: { contextId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [distinct, setDistinct] = useState(0);
  const counter = useRef(0);

  useEffect(() => {
    if (!contextId) return;
    setEntries([]);
    setDistinct(0);
    const source = new EventSource(`/api/ledger/${encodeURIComponent(contextId)}`);
    const seen = new Set<string>();

    source.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "hello") {
        setDistinct(data.distinct ?? 0);
        return;
      }
      if (data.type === "event" && data.decision === "ACCEPTED") {
        if (data.fingerprint && !seen.has(data.fingerprint)) {
          seen.add(data.fingerprint);
          setDistinct(seen.size);
        }
        setEntries((prev) => [{ id: counter.current++, fingerprint: data.fingerprint, decision: data.decision }, ...prev].slice(0, 12));
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [contextId]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
          Live ledger
        </span>
        <span className="chip mono">
          <span className="dot" /> {distinct} distinct
        </span>
      </div>
      {entries.length === 0 ? (
        <span className="faint" style={{ fontSize: 13 }}>Accepted identities appear here as they land.</span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entries.map((e) => (
            <span key={e.id} className="chip mono rise" style={{ borderColor: "rgba(53,227,180,0.35)" }}>
              <span className="dot" /> {e.fingerprint}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
