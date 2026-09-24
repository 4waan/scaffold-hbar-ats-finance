import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
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
            <span>
              Pyth prices cash. ATS holds collateral. HSS assists recovery.
            </span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
