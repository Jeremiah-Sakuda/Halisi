import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Halisi — one claim per attested human credential",
  description:
    "Halisi collapses a swarm of synthetic identities down to the real humans behind them — making one claim per attested credential a hard invariant inside Amazon DynamoDB, denied at the write.",
  metadataBase: new URL("https://halisi.vercel.app"),
  openGraph: {
    title: "Halisi",
    description:
      "A swarm of synthetic identities collapses to the real humans behind it — enforced at the DynamoDB write.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
