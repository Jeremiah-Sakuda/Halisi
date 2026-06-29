/**
 * The business case, in the product itself: B2C-facing, B2B-paid. End users experience an abundant
 * action; platforms pay Halisi to keep it honest. Kept on-message — Halisi rations identity, never a
 * finite good.
 */
export default function BuyerPanel() {
  return (
    <section id="who-pays" style={{ padding: "20px 0 8px", display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow">Who pays for this</div>
        <h2 style={{ fontSize: 26, marginTop: 8 }}>Consumer-facing, platform-paid.</h2>
        <p className="muted" style={{ maxWidth: 720, marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
          End users just start a free trial (or vote, or claim an allocation). Platforms pay Halisi to keep
          that action human: a usage-based fee <strong style={{ color: "var(--text)" }}>per accepted unique
          human</strong>. Denials are free — and that is the pricing guarantee, not a caveat:{" "}
          <strong style={{ color: "var(--text)" }}>you pay only for the real humans we let through, never the
          swarm</strong>. The &ldquo;one credential, not one person&rdquo; ceiling is exactly the unit you
          are billed on.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <Wedge
          tag="Wedge · PLG"
          title="Free-trial & fake-signup abuse"
          body="Trial farming burns infra spend and pollutes activation metrics — and AI agents now spin up signups at scale. “One trial per real human” is a deny-at-write gate, not ban-tomorrow."
          href="/"
          cta="Try the free-trial gate ↑"
        />
        <Wedge
          tag="Wedge · Web3"
          title="Airdrop sybil resistance"
          body="Token distributions routinely lose double-digit percentages of allocation to sybils. “One allocation per attested human” turns that loss into a write-time guarantee."
          href="/airdrop"
          cta="Try the airdrop flow →"
        />
        <Wedge
          tag="Adjacent"
          title="Voting · reviews · waitlists"
          body="Community polls, review integrity, and early-access fairness are the same shape — an abundant action that has to stay one-per-human."
        />
      </div>

      <div className="panel" style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <ROI value="≈ $0.00001" label="cost per denied fake at the write" sub="forged tokens never reach the table" />
        <ROI value="orders of magnitude" label="increase in cost-to-fake" sub="every fake needs a real, registered authenticator" />
        <ROI value="pennies / 10k" label="DynamoDB write cost" sub="on-demand, high-margin per-claim pricing" />
      </div>
    </section>
  );
}

function Wedge({ tag, title, body, href, cta }: { tag: string; title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ color: "var(--accent-2)" }}>{tag}</div>
      <h3 style={{ fontSize: 16, marginTop: 10 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{body}</p>
      {href && cta && (
        <a href={href} style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
          {cta}
        </a>
      )}
    </div>
  );
}

function ROI({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--text)", marginTop: 4 }}>{label}</div>
      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
