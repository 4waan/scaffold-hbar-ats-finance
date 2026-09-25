import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collateral Rail",
  description: "Battle-tested ATS financing on Hedera",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          {children}
          <footer>
            <span>Collateral Rail</span>
            <span>Unaudited testnet software. Never expose operator keys.</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
