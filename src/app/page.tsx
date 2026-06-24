import AbundantAction from "@/components/AbundantAction";
import ArchitecturePeek from "@/components/ArchitecturePeek";
import CollapseLab from "@/components/CollapseLab";
import Hero from "@/components/Hero";

export default function Home() {
  return (
    <main className="shell" style={{ paddingBottom: 80 }}>
      <Hero />

      <section style={{ display: "grid", gap: 16 }}>
        <AbundantAction />
        <div id="collapse" style={{ scrollMarginTop: 24 }}>
          <CollapseLab />
        </div>
      </section>

      <div style={{ height: 36 }} />
      <ArchitecturePeek />

      <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span className="faint" style={{ fontSize: 13 }}>
          Halisi — one durable identity per attested human credential.
        </span>
        <span className="faint mono" style={{ fontSize: 13 }}>
          Amazon DynamoDB · Next.js · Vercel
        </span>
      </footer>
    </main>
  );
}
