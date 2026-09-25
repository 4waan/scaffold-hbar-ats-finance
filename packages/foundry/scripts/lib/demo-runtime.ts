import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineChain, isAddress, parseEventLogs } from "viem";
import type { Address, TransactionReceipt } from "viem";
import { railAbi } from "@collateral-rail/shared/abis";
import { DEFAULT_RPC_URL, confirmMirrorSchedule } from "./evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const foundryRoot = path.resolve(scriptDirectory, "../..");
export const addressesPath = path.join(
  foundryRoot,
  "deployments",
  "latest-addresses.json",
);
export const broadcastPath = path.join(
  foundryRoot,
  "broadcast",
  "BootstrapTestnet.s.sol",
  "296",
  "run-latest.json",
);
export const outputPath = path.join(foundryRoot, "deployments", "testnet.json");

export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
export const ACTOR_FUNDING_HBAR = 25;
export const PRINCIPAL_USD_E8 = 50_000_000n;
export const COLLATERAL_PER_POSITION = 10n;
export const TERM_SECONDS = 120n;
export const ANNUAL_RATE_BPS = 500;
export const ROLE_ISSUER =
  "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
export const ROLE_KYC =
  "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
export const ROLE_SSI_MANAGER =
  "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";

export const chain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
});

export function requireAddress(
  name: string,
  value: string | undefined,
): Address {
  if (!isAddress(value ?? "")) {
    throw new Error(`Missing valid ${name} address.`);
  }
  return value as Address;
}

export async function runFoundry(environment: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "forge",
      [
        "script",
        "script/BootstrapTestnet.s.sol:BootstrapTestnet",
        "--rpc-url",
        "hedera_testnet",
        "--broadcast",
        "--non-interactive",
      ],
      {
        cwd: foundryRoot,
        env: environment,
        stdio: "inherit",
        shell: false,
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Foundry bootstrap failed with ${signal ?? `exit ${code}`}.`,
          ),
        );
      }
    });
  });
}

function singleEvent(
  receipt: Pick<TransactionReceipt, "logs">,
  eventName: "OfferFunded" | "PositionOpened",
) {
  const events = parseEventLogs({
    abi: railAbi,
    logs: receipt.logs,
    eventName,
    strict: false,
  });
  if (events.length !== 1) {
    throw new Error(
      `Expected one ${eventName} event, received ${events.length}.`,
    );
  }
  return events[0].args;
}

export function offerFundedArgs(receipt: Pick<TransactionReceipt, "logs">) {
  return singleEvent(receipt, "OfferFunded") as { offerId: `0x${string}` };
}

export function positionOpenedArgs(receipt: Pick<TransactionReceipt, "logs">) {
  return singleEvent(receipt, "PositionOpened") as {
    positionId: `0x${string}`;
  };
}

export async function waitUntil(timestampSeconds: number) {
  const milliseconds = timestampSeconds * 1000 - Date.now();
  if (milliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

export async function confirmScheduleWithRetry(options: {
  mirrorOrigin: string;
  scheduleAddress: string;
}) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await confirmMirrorSchedule(options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(
    `Mirror did not confirm the HSS schedule: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}

export function positionStateName(state: bigint | number) {
  return (
    ["NONE", "OPEN", "REPAID", "DEFAULTED"][Number(state)] ?? `UNKNOWN_${state}`
  );
}

export function automationStateName(state: bigint | number) {
  return (
    ["NONE", "PENDING", "COMPLETED", "UNAVAILABLE"][Number(state)] ??
    `UNKNOWN_${state}`
  );
}

export function selectedRecipeId(argv = process.argv.slice(2)) {
  const inline = argv.find((value) => value.startsWith("--recipe="));
  if (inline) {
    const id = inline.slice("--recipe=".length);
    if (!id) throw new Error("The --recipe flag requires a recipe ID.");
    return id;
  }
  const index = argv.indexOf("--recipe");
  if (index < 0) return "term-credit";
  const id = argv[index + 1];
  if (!id || id.startsWith("--")) {
    throw new Error("The --recipe flag requires a recipe ID.");
  }
  return id;
}
