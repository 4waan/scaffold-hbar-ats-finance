import { spawn } from "node:child_process";
import { access, lstat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineChain, isAddress, parseEventLogs } from "viem";
import type { Address, TransactionReceipt } from "viem";
import { railAbi } from "@collateral-rail/shared/abis";
import { DEFAULT_RPC_URL, confirmMirrorSchedule } from "./evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const foundryRoot = path.resolve(scriptDirectory, "../..");
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
export const HEDERA_WRITE_GAS = {
  oracleUpdate: 750_000n,
  atsApproval: 500_000n,
  fundOffer: 500_000n,
  acceptOffer: 3_500_000n,
  withdrawal: 250_000n,
  repayment: 1_500_000n,
  settlement: 2_000_000n,
} as const;
export const ROLE_ISSUER =
  "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
export const ROLE_KYC =
  "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
export const ROLE_SSI_MANAGER =
  "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";

export async function assertWritableArtifactPath(filePath: string) {
  const resolved = path.resolve(filePath);
  const deploymentsRoot = path.join(foundryRoot, "deployments");
  if (
    resolved !== outputPath ||
    !resolved.startsWith(`${deploymentsRoot}${path.sep}`)
  ) {
    throw new Error(
      "Evidence output must use the ignored private candidate path.",
    );
  }
  await access(path.dirname(resolved), fsConstants.W_OK);
  try {
    const existing = await lstat(resolved);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Evidence candidate path must be a regular file.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function requireTool(tool: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tool, ["--version"], {
      cwd: foundryRoot,
      stdio: "ignore",
      shell: false,
    });
    child.once("error", () =>
      reject(new Error(`Required evidence tool is unavailable: ${tool}.`)),
    );
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Required evidence tool failed its version check: ${tool}.`,
          ),
        );
    });
  });
}

export async function assertRequiredEvidenceTools() {
  await requireTool("forge");
  await requireTool("gitleaks");
}

export const chain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
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
    const output: Buffer[] = [];
    const errorOutput: Buffer[] = [];
    let outputBytes = 0;
    const maximumOutputBytes = 4_000_000;
    const child = spawn(
      "forge",
      [
        "script",
        "script/BootstrapTestnet.s.sol:BootstrapTestnet",
        "--rpc-url",
        "hedera_testnet",
        "--broadcast",
        "--skip-simulation",
        "--slow",
        "--non-interactive",
      ],
      {
        cwd: foundryRoot,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maximumOutputBytes) {
        child.kill("SIGKILL");
        reject(new Error("Foundry bootstrap output exceeded the size limit."));
        return;
      }
      target.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(output, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(errorOutput, chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const stdout = redactSignerMaterial(
        Buffer.concat(output).toString("utf8"),
        environment,
      );
      const stderr = redactSignerMaterial(
        Buffer.concat(errorOutput).toString("utf8"),
        environment,
      );
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
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

export function redactSignerMaterial(
  value: string,
  environment: NodeJS.ProcessEnv,
) {
  const key = environment.HARNESS_SIGNER_PRIVATE_KEY?.trim();
  if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) return value;
  const forms = [key, key.slice(2), BigInt(key).toString()];
  return forms.reduce((redacted, form) => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return redacted.replace(new RegExp(escaped, "gi"), "[REDACTED]");
  }, value);
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

export function receiptDefaultedPosition(
  receipt: Pick<TransactionReceipt, "logs">,
  rail: Address,
  expectedPositionId: `0x${string}`,
) {
  const events = parseEventLogs({
    abi: railAbi,
    logs: receipt.logs.filter(
      ({ address }) => address.toLowerCase() === rail.toLowerCase(),
    ),
    eventName: "PositionDefaulted",
    strict: false,
  });
  if (events.length === 0) return false;
  if (events.length !== 1) {
    throw new Error(
      `Expected at most one PositionDefaulted event, received ${events.length}.`,
    );
  }
  if (events[0].args.positionId !== expectedPositionId) {
    throw new Error("Fallback receipt defaulted an unexpected position.");
  }
  return true;
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
  requireExecuted?: boolean;
}) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const proof = await confirmMirrorSchedule(options);
      if (options.requireExecuted && proof.executedTimestamp === null) {
        throw new Error("Schedule is confirmed but has not executed.");
      }
      return proof;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(
    `Mirror did not confirm the HSS schedule: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}

export async function blockAfterScheduleExecution(
  publicClient: {
    getBlockNumber: () => Promise<bigint>;
    getBlock: (options: {
      blockNumber: bigint;
    }) => Promise<{ timestamp: bigint }>;
  },
  executedTimestamp: string,
) {
  const executedSecond = BigInt(executedTimestamp.split(".")[0]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const blockNumber = await publicClient.getBlockNumber();
    const block = await publicClient.getBlock({ blockNumber });
    if (block.timestamp >= executedSecond) return blockNumber;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("JSON RPC did not expose a block after HSS execution.");
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
