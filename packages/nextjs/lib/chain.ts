import { defineChain, type Address } from "viem";

const DEFAULT_RPC = "https://testnet.hashio.io/api";
const ALLOWED_RPC_HOSTS = new Set(["testnet.hashio.io"]);

function safeRpcUrl(value: string | undefined): string {
  if (!value) return DEFAULT_RPC;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && ALLOWED_RPC_HOSTS.has(parsed.hostname))
      return parsed.toString();
  } catch {}
  return DEFAULT_RPC;
}

export const rpcUrl = safeRpcUrl(process.env.NEXT_PUBLIC_HEDERA_RPC_URL);

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "HashScan", url: "https://hashscan.io/testnet" },
  },
});

export function publicAddress(value: string | undefined): Address | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? (value as Address)
    : undefined;
}

export const addresses = {
  rail: publicAddress(process.env.NEXT_PUBLIC_RAIL_ADDRESS),
  atsToken: publicAddress(process.env.NEXT_PUBLIC_ATS_TOKEN_ADDRESS),
  oracle: publicAddress(process.env.NEXT_PUBLIC_ORACLE_ADDRESS),
  pyth: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" as Address,
};

export const isLiveMode = Boolean(
  addresses.rail && addresses.atsToken && addresses.oracle,
);
