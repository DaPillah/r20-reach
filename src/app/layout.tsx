import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ReachProvider } from "@/lib/store";

// Match r20.nyc: DM Sans (body) + Playfair Display (display/headings).
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["300", "400", "500", "700"] });
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal", "italic"],
});

// A shared link's preview card (Instagram/iMessage pull these OG tags) is the
// FIRST thing a cold contact sees. It must read like an invite, never like the
// CRM behind it — no "follow-up / discipleship app", no "Oikos", no insider
// tagline. Every PUBLIC surface (metadata, manifest, PWA hints, /invite) is
// branded R20; the internal "Oikos" name lives only behind the staff login
// (login header, guide, nav, settings). Per-event invites override with /event.
const SITE_URL = "https://join.r20.nyc";
const PUBLIC_DESC = "For college students around NYC.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "R20", template: "%s · R20" },
  description: PUBLIC_DESC,
  applicationName: "R20",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "R20" },
  openGraph: {
    type: "website",
    siteName: "R20",
    title: "R20",
    description: PUBLIC_DESC,
    url: SITE_URL,
  },
  twitter: { card: "summary", title: "R20", description: PUBLIC_DESC },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#15110d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ReachProvider>
          <AppShell>{children}</AppShell>
        </ReachProvider>
      </body>
    </html>
  );
}
