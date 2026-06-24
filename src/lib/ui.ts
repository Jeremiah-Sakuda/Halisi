/** A completed swarm run, in the shape the collapse view animates. Pure types — safe for the client. */
export interface CollapseRun {
  runId: number;
  mode: string;
  attempts: number;
  accepted: number;
  deniedForged: number;
  deniedReplay: number;
  deniedDuplicate: number;
  distinctFingerprints: number;
  /** Short fingerprints of the accepted identities — the nodes the swarm collapses onto. */
  fingerprints: string[];
  p50LatencyMs: number;
  p99LatencyMs: number;
  estimatedCostUsd: number;
}

export const SWARM_MODES = [
  { value: "mixed", label: "Mixed swarm", hint: "forged + replayed + reused" },
  { value: "forged", label: "Forged only", hint: "bad signatures" },
  { value: "replayed", label: "Replayed only", hint: "valid but already redeemed" },
  { value: "reused", label: "Reused credentials", hint: "same few, many attempts" },
] as const;
