import { existsSync } from "node:fs";

export function knipConfiguration(foundryLibrariesInstalled) {
  const ignore = ["packages/foundry/scripts/build-deployment-record.mjs"];
  if (foundryLibrariesInstalled) ignore.push("packages/foundry/lib/**");

  return {
    ignore,
    ignoreDependencies: ["@hiero-ledger/hiero-contracts"],
    ignoreBinaries: ["forge"],
  };
}

export default knipConfiguration(
  existsSync(new URL("./packages/foundry/lib", import.meta.url)),
);
