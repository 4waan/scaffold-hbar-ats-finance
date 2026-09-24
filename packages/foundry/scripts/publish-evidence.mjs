import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceRecord } from "./lib/evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const foundryRoot = path.resolve(scriptDirectory, "..");
const deploymentsDirectory = path.join(foundryRoot, "deployments");
const candidatePath = path.resolve(
  process.argv[2] ?? path.join(deploymentsDirectory, "testnet.json"),
);
const referencePath = path.join(deploymentsDirectory, "reference-testnet.json");

if (!candidatePath.startsWith(`${deploymentsDirectory}${path.sep}`)) {
  throw new Error(
    "Publication candidate must be inside packages/foundry/deployments.",
  );
}

const candidateText = await readFile(candidatePath, "utf8");
const candidate = validateEvidenceRecord(JSON.parse(candidateText));

await new Promise((resolve, reject) => {
  const child = spawn(
    "gitleaks",
    [
      "detect",
      "--no-git",
      "--source",
      deploymentsDirectory,
      "--redact",
      "--exit-code",
      "1",
    ],
    { cwd: foundryRoot, stdio: "inherit", shell: false },
  );
  child.once("error", (error) => {
    reject(
      new Error(
        `Publication requires gitleaks and could not start it: ${error.message}`,
      ),
    );
  });
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else
      reject(new Error("Gitleaks rejected the deployment evidence candidate."));
  });
});

await writeFile(referencePath, `${JSON.stringify(candidate, null, 2)}\n`, {
  mode: 0o644,
});
console.log(`Published verified testnet evidence to ${referencePath}.`);
