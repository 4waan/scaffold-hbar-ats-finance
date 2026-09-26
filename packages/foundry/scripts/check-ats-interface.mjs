import { readFile } from "node:fs/promises";

const requiredPath = new URL("../abi/ats-v8-required.json", import.meta.url);
const artifactPath = new URL(
  "../out/IAtsCollateralToken.sol/IAtsCollateralToken.json",
  import.meta.url,
);

const required = JSON.parse(await readFile(requiredPath, "utf8"));
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));

if (
  !/^[a-f0-9]{40}$/.test(required.upstreamCommit ?? "") ||
  !required.sourceFiles ||
  Object.keys(required.sourceFiles).length === 0 ||
  Object.entries(required.sourceFiles).some(
    ([file, digest]) =>
      !file.startsWith("packages/ats/contracts/contracts/") ||
      !/^[a-f0-9]{64}$/.test(digest),
  )
) {
  throw new Error("ATS source provenance is missing or malformed.");
}

function canonicalType(input) {
  if (!input.type.startsWith("tuple")) return input.type;
  const suffix = input.type.slice("tuple".length);
  return `(${input.components.map(canonicalType).join(",")})${suffix}`;
}

const actual = artifact.abi
  .filter((entry) => entry.type === "function")
  .map((entry) => `${entry.name}(${entry.inputs.map(canonicalType).join(",")})`)
  .sort();
const expected = [...required.runtimeSignatures].sort();

const missing = expected.filter((signature) => !actual.includes(signature));
const extra = actual.filter((signature) => !expected.includes(signature));
if (missing.length || extra.length) {
  console.error(JSON.stringify({ missing, extra }, null, 2));
  process.exit(1);
}

console.log(
  `ATS reduced interface matches ${expected.length} signatures from commit ${required.upstreamCommit}.`,
);
