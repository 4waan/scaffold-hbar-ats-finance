import assert from "node:assert/strict";
import test from "node:test";
import { knipConfiguration } from "../../knip.config.js";

test("Knip ignores installed Foundry libraries only in generated projects", () => {
  const sourceConfiguration = knipConfiguration(false);
  assert.equal(
    sourceConfiguration.ignore.includes("packages/foundry/lib/**"),
    false,
  );

  const generatedConfiguration = knipConfiguration(true);
  assert.equal(
    generatedConfiguration.ignore.includes("packages/foundry/lib/**"),
    true,
  );
  assert.deepEqual(
    generatedConfiguration.ignoreDependencies,
    sourceConfiguration.ignoreDependencies,
  );
  assert.deepEqual(
    generatedConfiguration.ignoreBinaries,
    sourceConfiguration.ignoreBinaries,
  );
});
