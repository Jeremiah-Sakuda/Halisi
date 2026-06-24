export default function NotFound() {
  return (
    <main className="shell" style={{ minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <div className="eyebrow">404</div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", marginTop: 16, fontWeight: 800 }}>
          Nothing here to collapse
        </h1>
        <p className="muted" style={{ marginTop: 14, fontSize: 16 }}>
          That page doesn&apos;t exist.
        </p>
        <a className="btn btn-primary" href="/" style={{ display: "inline-block", marginTop: 24 }}>
          Back to the collapse
        </a>
      </div>
    </main>
  );
}
