import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedFingerprints = [
  "a4ccae3a826bb5eb3667e37cbb20641da2b8cd62:packages/foundry/deployments/reference-testnet.json:generic-api-key:21",
  "0f510753463fcf90869f60e22cf43c3903c8f394:packages/foundry/abi/ats-v8-required.json:generic-api-key:13",
].sort();

test("Gitleaks ignores only the reviewed historical fingerprints", () => {
  const configuration = readFileSync(".gitleaks.toml", "utf8");
  assert.doesNotMatch(configuration, /\[\[allowlists\]\]/);
  assert.doesNotMatch(configuration, /\[0-9a-fA-F\]\{40\}/);

  const fingerprints = readFileSync(".gitleaksignore", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .sort();

  assert.deepEqual(fingerprints, expectedFingerprints);
});
