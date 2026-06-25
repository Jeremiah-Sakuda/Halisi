import AllocationDemo from "@/components/AllocationDemo";

export const metadata = {
  title: "Halisi — one airdrop allocation per human",
};

export default function AirdropPage() {
  return (
    <main className="shell" style={{ paddingBottom: 80 }}>
      <header style={{ padding: "56px 0 24px" }}>
        <a href="/" className="chip" style={{ textDecoration: "none" }}>
          ← back to the collapse
        </a>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", marginTop: 22, fontWeight: 800 }}>
          Airdrop sybil resistance
        </h1>
        <p className="muted" style={{ maxWidth: 640, marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
          Token distributions lose double-digit percentages of allocation to sybils. Halisi makes
          &ldquo;one allocation per attested credential&rdquo; a write-time guarantee — the same invariant,
          applied to a wallet-bound claim.
        </p>
      </header>
      <AllocationDemo />
    </main>
  );
}
