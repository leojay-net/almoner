import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  // Page titles set their own; this supplies the suffix and the fallback.
  title: {
    default: "Almoner — private batch disbursement",
    template: "%s",
  },
  description:
    "Pay hundreds of people from one shielded balance for a single flat fee, including people who have never held a wallet.",
  applicationName: "Almoner",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
  ],
};

// Browser extensions inject attributes onto <html> before React hydrates
// (data-qb-installed and friends), which React reads as a server/client
// mismatch. suppressHydrationWarning is the documented fix and applies to this
// element only, so real mismatches deeper in the tree still surface.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
