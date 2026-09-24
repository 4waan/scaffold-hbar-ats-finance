import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RPC_URL, validatedEndpoint } from "./lib/evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const foundryRoot = path.resolve(scriptDirectory, "..");
const operatorAddress = process.env.HEDERA_OPERATOR_ADDRESS?.trim();

if (!/^0x[a-fA-F0-9]{40}$/.test(operatorAddress ?? "")) {
  throw new Error("HEDERA_OPERATOR_ADDRESS must be a public EVM address.");
}
for (const name of ["LENDER_ADDRESS", "BORROWER_ADDRESS"]) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(process.env[name]?.trim() ?? "")) {
    throw new Error(`${name} must be a public EVM address.`);
  }
}

const rpcUrl = validatedEndpoint(
  "rpc",
  process.env.HEDERA_TESTNET_RPC_URL ?? DEFAULT_RPC_URL,
);
const keystorePath = process.env.HEDERA_KEYSTORE_PATH?.trim();
const passwordFile = process.env.HEDERA_KEYSTORE_PASSWORD_FILE?.trim();
if (Boolean(keystorePath) !== Boolean(passwordFile)) {
  throw new Error(
    "Set both HEDERA_KEYSTORE_PATH and HEDERA_KEYSTORE_PASSWORD_FILE, or leave both empty to use the named hedera-operator account.",
  );
}

const args = [
  "script",
  "script/BootstrapTestnet.s.sol:BootstrapTestnet",
  "--rpc-url",
  "hedera_testnet",
  "--broadcast",
  "--sender",
  operatorAddress,
];
if (keystorePath && passwordFile) {
  args.push("--keystore", keystorePath, "--password-file", passwordFile);
} else {
  args.push("--account", "hedera-operator");
}

async function run(command, commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: foundryRoot,
      env: { ...process.env, HEDERA_TESTNET_RPC_URL: rpcUrl },
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} failed with ${signal ?? `exit ${code}`}.`),
        );
    });
  });
}

await run("forge", args);
await run(process.execPath, ["scripts/build-deployment-record.mjs"]);
