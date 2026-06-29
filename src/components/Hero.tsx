/** The opening statement: lead with the collapse, name the invariant, stay honest about the ceiling. */
export default function Hero() {
  return (
    <header style={{ padding: "72px 0 28px", textAlign: "center" }}>
      <span className="chip" style={{ margin: "0 auto" }}>
        <span className="dot" /> Swahili: <em>&nbsp;halisi</em> — genuine, authentic, real
      </span>
      <h1 style={{ fontSize: "clamp(40px, 7vw, 72px)", marginTop: 22, fontWeight: 800 }}>
        The database that{" "}
        <span
          style={{
            background: "linear-gradient(120deg, var(--accent), var(--accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          collapses a sybil swarm
        </span>
      </h1>
      <p
        className="muted"
        style={{ maxWidth: 680, margin: "22px auto 0", fontSize: 18, lineHeight: 1.6 }}
      >
        One free trial, one vote, one airdrop — <strong style={{ color: "var(--text)" }}>per real human</strong>.
        Halisi is the gate that keeps bot farms and AI-agent swarms out of human-only goods, making{" "}
        <strong style={{ color: "var(--text)" }}>one claim per attested credential</strong> a hard invariant
        inside Amazon DynamoDB — denied at the write, not flagged after the fact.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
        <a className="btn btn-primary" href="#collapse">Watch the collapse</a>
        <a className="btn" href="/proof">Two engines, one verdict</a>
        <a className="btn" href="#how">How it works</a>
        <a className="btn" href="#who-pays">Who pays</a>
        <a className="btn" href="/passkey">Try a real passkey</a>
      </div>
    </header>
  );
}
