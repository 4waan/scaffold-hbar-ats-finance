"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { hederaTestnet, rpcUrl } from "@/lib/chain";

const config = createConfig({
  chains: [hederaTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [hederaTestnet.id]: http(rpcUrl, { retryCount: 1, timeout: 10_000 }),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
