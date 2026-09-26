import { spawn } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceRecord } from "./lib/evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const foundryRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(foundryRoot, "../..");
const gitleaksConfigPath = path.join(repositoryRoot, ".gitleaks.toml");
const deploymentsDirectory = path.join(foundryRoot, "deployments");
const candidatePath = path.resolve(
  process.argv[2] ?? path.join(deploymentsDirectory, "testnet.json"),
);
const referencePath = path.join(deploymentsDirectory, "reference-testnet.json");
const privateCandidatePath = path.join(deploymentsDirectory, "testnet.json");

async function run(command, args, failureMessage) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: foundryRoot,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", (error) => {
      reject(new Error(`${failureMessage}: ${error.message}`));
    });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(failureMessage));
    });
  });
}

if (candidatePath !== privateCandidatePath) {
  throw new Error(
    "Publication candidate must use the ignored private testnet path.",
  );
}

const candidateText = await readFile(candidatePath, "utf8");
const candidate = validateEvidenceRecord(JSON.parse(candidateText));
if (candidate.recipeId !== "term-credit") {
  throw new Error("The public reference deployment must use term-credit.");
}

const temporaryPath = path.join(
  deploymentsDirectory,
  `.reference-testnet.${process.pid}.${Date.now()}.tmp`,
);
try {
  await run(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(scriptDirectory, "verify-deployment.mjs"),
      candidatePath,
    ],
    "Live deployment verification rejected the evidence candidate.",
  );
  await run(
    "gitleaks",
    [
      "detect",
      "--config",
      gitleaksConfigPath,
      "--no-git",
      "--source",
      deploymentsDirectory,
      "--redact",
      "--exit-code",
      "1",
    ],
    "Gitleaks rejected the deployment evidence candidate.",
  );
  await writeFile(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, referencePath);
} catch (error) {
  await unlink(temporaryPath).catch(() => undefined);
  throw error;
}
console.log(`Published verified testnet evidence to ${referencePath}.`);
