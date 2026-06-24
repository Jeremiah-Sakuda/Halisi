/**
 * How it works — DynamoDB as the protagonist. The single table, the one conditional transaction, the
 * collapse query. Kept legible and secondary to the collapse itself.
 */
export default function ArchitecturePeek() {
  return (
    <section id="how" style={{ padding: "20px 0 8px", display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow">How it works</div>
        <h2 style={{ fontSize: 26, marginTop: 8 }}>One table. One conditional transaction. One query.</h2>
        <p className="muted" style={{ maxWidth: 680, marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
          The guarantee is a DynamoDB primitive, not application logic. A single conditional{" "}
          <span className="mono">TransactWriteItems</span> burns the single-use token and writes the
          one-per-credential claim together — succeed or fail as one.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <Card title="Single-table design" accent>
          <Row pk="CTX#<context>" sk="CTX" note="the abundant action" />
          <Row pk="REDEMPTION#<tokenId>" sk="REDEMPTION" note="single-use token" />
          <Row pk="CLAIM#<context>#<fp>" sk="CLAIM" note="one per credential" />
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            GSI1 partitions every claim under <span className="mono">CTX#&lt;context&gt;</span> so the
            collapse is one Query, never a scan.
          </p>
        </Card>

        <Card title="The redemption transaction">
          <Line>TransactWriteItems</Line>
          <Line indent>
            Put <span className="mono">REDEMPTION#…</span>
          </Line>
          <Line indent faint>
            if attribute_not_exists(PK) → else <span style={{ color: "var(--replay)" }}>DENIED_REPLAY</span>
          </Line>
          <Line indent>
            Put <span className="mono">CLAIM#…</span>
          </Line>
          <Line indent faint>
            if attribute_not_exists(PK) → else <span style={{ color: "var(--duplicate)" }}>DENIED_DUPLICATE</span>
          </Line>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            A forged assertion never verifies, so it never reaches the table at all.
          </p>
        </Card>

        <Card title="The collapse query">
          <Line>
            Query GSI1 where <span className="mono">GSI1PK = CTX#&lt;context&gt;</span>
          </Line>
          <Line faint>→ one item per distinct credential</Line>
          <Line>
            count = <span style={{ color: "var(--accent)" }}>N distinct attested credentials</span>
          </Line>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            The index is eventually consistent; the guarantee lives only on the base-table transaction,
            never on a GSI read.
          </p>
        </Card>
      </div>

      <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 720 }}>
        Honest ceiling: Halisi proves <em>one claim per attested credential</em>, not philosophical
        personhood. It resists synthetic swarms, replay, forgery, and credential reuse — raising the cost
        of a fake by orders of magnitude. It does not claim a perfect count of humans.
      </p>
    </section>
  );
}

function Card({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: 18, borderColor: accent ? "rgba(53,227,180,0.3)" : undefined }}>
      <h3 style={{ fontSize: 15, marginBottom: 12 }}>{title}</h3>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function Row({ pk, sk, note }: { pk: string; sk: string; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
      <span className="mono" style={{ color: "var(--text)" }}>{pk}</span>
      <span className="mono faint">/ {sk}</span>
      <span className="faint" style={{ marginLeft: "auto" }}>{note}</span>
    </div>
  );
}

function Line({ children, indent, faint }: { children: React.ReactNode; indent?: boolean; faint?: boolean }) {
  return (
    <div className="mono" style={{ fontSize: 12.5, paddingLeft: indent ? 16 : 0, color: faint ? "var(--faint)" : "var(--text)" }}>
      {children}
    </div>
  );
}
