import PasskeyDemo from "@/components/PasskeyDemo";

export const metadata = {
  title: "Halisi — one claim from a real passkey",
};

export default function PasskeyPage() {
  return (
    <main className="shell" style={{ paddingBottom: 80 }}>
      <header style={{ padding: "56px 0 24px" }}>
        <a href="/" className="chip" style={{ textDecoration: "none" }}>
          ← back to the collapse
        </a>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", marginTop: 22, fontWeight: 800 }}>
          The real-human beat
        </h1>
        <p className="muted" style={{ maxWidth: 620, marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
          The swarm runs on a simulated issuer for determinism. Here the attestation is genuine — a real
          WebAuthn passkey on this device — redeemed through the exact same conditional write.
        </p>
      </header>
      <PasskeyDemo />
    </main>
  );
}
