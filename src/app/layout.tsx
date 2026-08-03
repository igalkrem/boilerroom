import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoilerRoom",
  description: "Bulk Snapchat ad campaign creation platform",
};

// Required by the per-request CSP nonce in src/middleware.ts. A prerendered route is
// built once with no request in scope, so its inline bootstrap scripts carry no nonce and
// the browser blocks them at runtime — the page loads with no JS and never hydrates.
// Before this, /callback, /privacy and /_not-found were static. Every other route was
// already dynamic, so the cost is limited to those, and this also stops a newly added
// static page from silently breaking the same way.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gray-900 text-gray-100">{children}</body>
    </html>
  );
}
