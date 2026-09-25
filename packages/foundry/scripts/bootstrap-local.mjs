import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RPC_URL, validatedEndpoint } from "./lib/evidence-lib.mjs";
import { loadRecipe } from "@collateral-rail/shared/recipe-lib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const foundryRoot = path.resolve(scriptDirectory, "..");
const recipeFlag = process.argv.find((value) => value.startsWith("--recipe="));
const recipeIndex = process.argv.indexOf("--recipe");
if (
  recipeFlag === "--recipe=" ||
  (recipeIndex >= 0 && !process.argv[recipeIndex + 1])
) {
  throw new Error("The --recipe flag requires a recipe ID.");
}
const recipeId = recipeFlag
  ? recipeFlag.slice("--recipe=".length)
  : recipeIndex >= 0
    ? process.argv[recipeIndex + 1]
    : "term-credit";
const recipe = await loadRecipe(recipeId);
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
      env: {
        ...process.env,
        HEDERA_TESTNET_RPC_URL: rpcUrl,
        RAIL_MAXIMUM_ADVANCE_BPS: String(recipe.policy.maximumAdvanceBps),
        RAIL_MAXIMUM_ANNUAL_RATE_BPS: String(
          recipe.policy.maximumAnnualRateBps,
        ),
        RAIL_MAXIMUM_QUOTE_MOVEMENT_BPS: String(
          recipe.policy.maximumQuoteMovementBps,
        ),
        RAIL_MINIMUM_TERM_SECONDS: String(recipe.policy.minimumTermSeconds),
        RAIL_MAXIMUM_TERM_SECONDS: String(recipe.policy.maximumTermSeconds),
        RAIL_MAXIMUM_OFFER_LIFETIME_SECONDS: String(
          recipe.policy.maximumOfferLifetimeSeconds,
        ),
      },
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
