import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, http, isAddress } from "viem";
import { defineChain } from "viem";

const recordPath = path.resolve(process.argv[2] ?? "deployments/testnet.json");
const record = JSON.parse(await readFile(recordPath, "utf8"));
const mirrorOrigin = "https://testnet.mirrornode.hedera.com";
const rpcUrl =
  process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api";

const chain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });

function requireAddress(name) {
  const value = record.addresses?.[name];
  if (!isAddress(value ?? ""))
    throw new Error(`Missing valid ${name} address.`);
  return value;
}

async function mirror(pathname) {
  const url = new URL(pathname, mirrorOrigin);
  if (url.origin !== mirrorOrigin)
    throw new Error("Mirror request escaped the testnet allowlist.");
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Mirror Node ${url.pathname} returned HTTP ${response.status}.`,
    );
  return response.json();
}

const token = requireAddress("atsToken");
const oracle = requireAddress("oracle");
const rail = requireAddress("rail");
const acceptance = requireAddress("acceptance");
const operator = requireAddress("operator");
const lender = requireAddress("lender");
const borrower = requireAddress("borrower");

for (const [name, address] of Object.entries({
  token,
  oracle,
  rail,
  acceptance,
})) {
  const entity = await mirror(`/api/v1/contracts/${address}`);
  if (!entity.contract_id && !entity.evm_address)
    throw new Error(`Mirror did not confirm ${name}.`);
}

for (const transaction of record.transactions ?? []) {
  const payload = await mirror(
    `/api/v1/transactions/${encodeURIComponent(transaction.hash)}`,
  );
  if (
    !Array.isArray(payload.transactions) ||
    payload.transactions.length === 0
  ) {
    throw new Error(
      `Mirror returned no matching transaction for ${transaction.hash}.`,
    );
  }
  if (!payload.transactions.some((item) => item.result === "SUCCESS")) {
    throw new Error(`No successful result found for ${transaction.hash}.`);
  }
}

const railReadAbi = [
  {
    type: "function",
    name: "atsToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "oracle",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "partition",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "nominalValueUsdE8",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];
const tokenReadAbi = [
  {
    type: "function",
    name: "isInternalKycActivated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isIssuer",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "getMaturityDate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

const [
  boundToken,
  boundOracle,
  partition,
  owner,
  nominal,
  internalKyc,
  issuer,
  lenderKyc,
  borrowerKyc,
  maturity,
] = await Promise.all([
  client.readContract({
    address: rail,
    abi: railReadAbi,
    functionName: "atsToken",
  }),
  client.readContract({
    address: rail,
    abi: railReadAbi,
    functionName: "oracle",
  }),
  client.readContract({
    address: rail,
    abi: railReadAbi,
    functionName: "partition",
  }),
  client.readContract({
    address: rail,
    abi: railReadAbi,
    functionName: "owner",
  }),
  client.readContract({
    address: rail,
    abi: railReadAbi,
    functionName: "nominalValueUsdE8",
  }),
  client.readContract({
    address: token,
    abi: tokenReadAbi,
    functionName: "isInternalKycActivated",
  }),
  client.readContract({
    address: token,
    abi: tokenReadAbi,
    functionName: "isIssuer",
    args: [operator],
  }),
  client.readContract({
    address: token,
    abi: tokenReadAbi,
    functionName: "getKycStatusFor",
    args: [lender],
  }),
  client.readContract({
    address: token,
    abi: tokenReadAbi,
    functionName: "getKycStatusFor",
    args: [borrower],
  }),
  client.readContract({
    address: token,
    abi: tokenReadAbi,
    functionName: "getMaturityDate",
  }),
]);

const expectedPartition = `0x${"0".repeat(63)}1`;
if (boundToken.toLowerCase() !== token.toLowerCase())
  throw new Error("Rail token binding mismatch.");
if (boundOracle.toLowerCase() !== oracle.toLowerCase())
  throw new Error("Rail oracle binding mismatch.");
if (owner.toLowerCase() !== operator.toLowerCase())
  throw new Error("Rail owner mismatch.");
if (partition !== expectedPartition)
  throw new Error("Rail partition mismatch.");
if (nominal !== 100n * 10n ** 8n)
  throw new Error("Rail nominal value mismatch.");
if (
  !internalKyc ||
  !issuer ||
  lenderKyc !== 1 ||
  borrowerKyc !== 1 ||
  maturity === 0n
) {
  throw new Error("ATS live KYC, SSI, or maturity configuration mismatch.");
}

console.log(
  JSON.stringify(
    {
      verified: true,
      contracts: { token, oracle, rail, acceptance },
      configuration: {
        owner,
        partition,
        nominal: nominal.toString(),
        maturity: maturity.toString(),
      },
      receipts: record.transactions.length,
    },
    null,
    2,
  ),
);
