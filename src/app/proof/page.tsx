import LockstepView from "@/components/LockstepView";

export const metadata = {
  title: "Halisi — two engines, identical decisions",
};

export default function ProofPage() {
  return (
    <main className="shell" style={{ paddingBottom: 80 }}>
      <header style={{ padding: "56px 0 24px" }}>
        <a href="/" className="chip" style={{ textDecoration: "none" }}>
          ← back to the collapse
        </a>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", marginTop: 22, fontWeight: 800 }}>
          The two engines agree
        </h1>
        <p className="muted" style={{ maxWidth: 660, marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
          The honest answer to &ldquo;but the real DynamoDB might behave differently.&rdquo; The same swarm
          runs through the in-process engine and the real DynamoDB store code path (over a faithful
          in-process double) at once — and every decision lands the same way.
        </p>
      </header>
      <LockstepView />
    </main>
  );
}
