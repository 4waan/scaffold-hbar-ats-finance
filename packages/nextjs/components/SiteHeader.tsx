"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { isLiveMode } from "@/lib/chain";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function SiteHeader() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <header className="siteHeader">
      <Link className="wordmark" href="/">
        <span className="mark">CR</span>
        <span>Collateral Rail</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/">Overview</Link>
        <Link href="/facility">Facility</Link>
        <Link href="/verify">Verify</Link>
      </nav>
      <div className="headerActions">
        <span className={`modePill ${isLiveMode ? "live" : "reference"}`}>
          {isLiveMode ? "Live testnet" : "Reference mode"}
        </span>
        {isConnected && address ? (
          <button
            className="walletButton"
            onClick={() => disconnect()}
            type="button"
          >
            {shortAddress(address)}
          </button>
        ) : (
          <button
            className="walletButton"
            disabled={!connectors[0] || isPending}
            onClick={() =>
              connectors[0] && connect({ connector: connectors[0] })
            }
            type="button"
          >
            {isPending ? "Connecting" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
