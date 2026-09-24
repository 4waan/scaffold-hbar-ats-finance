import { readFile } from "node:fs/promises";

const path = "packages/foundry/deployments/reference-testnet.json";
const record = JSON.parse(await readFile(path, "utf8"));
const lifecycleValues = Object.values(record.lifecycle ?? {});

if (record.status === "verified") {
  const requiredAddresses = ["atsToken", "oracle", "rail", "acceptance"];
  for (const name of requiredAddresses) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(record.addresses?.[name] ?? "")) {
      throw new Error(`Verified reference record is missing ${name}.`);
    }
  }
  if (
    lifecycleValues.some((value) => !/^0x[a-fA-F0-9]{64}$/.test(value ?? ""))
  ) {
    throw new Error(
      "Verified reference record has an incomplete lifecycle receipt.",
    );
  }
  if (!Array.isArray(record.transactions) || record.transactions.length === 0) {
    throw new Error("Verified reference record has no mined transactions.");
  }
}

console.log(`Reference record status: ${record.status}`);
