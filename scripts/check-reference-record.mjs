import { readFile } from "node:fs/promises";
import { validateEvidenceRecord } from "../packages/foundry/scripts/lib/evidence-lib.mjs";

const path = "packages/foundry/deployments/reference-testnet.json";
const record = JSON.parse(await readFile(path, "utf8"));
const lifecycleValues = Object.values(record.lifecycle ?? {});

if (record.schemaVersion !== 2) {
  throw new Error("Reference evidence must use schema version 2.");
}
if (record.status === "verified") {
  validateEvidenceRecord(record);
} else if (
  record.status !== "awaiting-verified-publication" ||
  lifecycleValues.some((value) => value !== null) ||
  record.verification?.complete !== false
) {
  throw new Error(
    "Pending reference evidence must remain explicitly incomplete.",
  );
}

console.log(`Reference record status: ${record.status}`);
