import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const addressesPath = path.join(root, "deployments", "latest-addresses.json");
const broadcastPath = path.join(
  root,
  "broadcast",
  "BootstrapTestnet.s.sol",
  "296",
  "run-latest.json",
);
const outputPath = path.join(root, "deployments", "testnet.json");

const addresses = JSON.parse(await readFile(addressesPath, "utf8"));
const broadcast = JSON.parse(await readFile(broadcastPath, "utf8"));
const transactions = (broadcast.transactions ?? []).map(
  (transaction, index) => ({
    index,
    kind: transaction.transactionType ?? "CALL",
    hash: transaction.hash ?? transaction.transactionHash ?? null,
  }),
);

if (
  transactions.some(
    (transaction) => !/^0x[a-fA-F0-9]{64}$/.test(transaction.hash ?? ""),
  )
) {
  throw new Error(
    "Every broadcast transaction must have a mined transaction hash.",
  );
}

const record = {
  schemaVersion: 1,
  network: "hedera-testnet",
  chainId: 296,
  status: "bootstrap-mined",
  generatedAt: new Date().toISOString(),
  addresses,
  transactions,
  lifecycle: {
    atsBondDeployment: transactions[0]?.hash ?? null,
    ssiAndKycConfiguration: transactions[1]?.hash ?? null,
    collateralIssuance: transactions[4]?.hash ?? null,
    pythPriceUpdate: null,
    fundedOffer: null,
    holdCreation: null,
    hssScheduleCreation: null,
    repaidFacility: null,
    maturedDefault: null,
    liveConfigurationRead: null,
  },
  notice:
    "Bootstrap is mined. Complete and verify both financing terminal paths before publication.",
};

await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`Wrote public deployment record to ${outputPath}`);
