import deployment from "../../foundry/deployments/reference-testnet.json";

export type ReferenceTransaction = {
  kind: string;
  hash: string;
  consensusTimestamp: string;
  result: string;
  hashScan: string;
};

export type ReferencePosition = {
  id: string;
  lender: string;
  borrower: string;
  collateralAmount: string;
  holdId: string;
  principalTinybar: string;
  repaymentTinybar: string;
  openedAt: number;
  maturity: number;
  scheduleAddress: string;
  state: "REPAID" | "DEFAULTED";
  automation: "PENDING" | "COMPLETED" | "UNAVAILABLE" | "NONE";
  terminalPath: "repayment" | "hss" | "permissionless-fallback";
};

export type ReferenceDeployment = {
  schemaVersion: number;
  network: string;
  chainId: number;
  status: string;
  generatedAt: string | null;
  addresses: Record<string, string | null>;
  actors: Record<string, { accountId: string; evmAddress: string } | null>;
  transactions: ReferenceTransaction[];
  lifecycle: Record<string, string | null>;
  pyth: {
    priceUsdE8: string;
    confidenceUsdE8: string;
    publishTime: number;
    purpose: string;
  } | null;
  ats: {
    balances: {
      borrower: { free: string; held: string };
      lender: { free: string; held: string };
    };
  } | null;
  positions: ReferencePosition[];
  schedules: Array<{
    address: string;
    scheduleId: string;
    confirmed: boolean;
    executedTimestamp: string | null;
    hashScan: string;
  }>;
  accounting: {
    cashLiabilitiesTinybar: string;
    reservedAutomationTinybar: string;
    requiredBackingTinybar: string;
    contractBalanceTinybar: string;
  } | null;
  verification: {
    complete: boolean;
    readsAtBlock: string | null;
    mirrorOrigin: string;
    contractLinks: Record<string, string>;
  };
  notice: string;
};

export const referenceDeployment = deployment as ReferenceDeployment;

export const lifecycleLabels = [
  ["atsBondDeployment", "ATS bond deployment"],
  ["ssiAndKycConfiguration", "SSI and internal KYC"],
  ["collateralIssuance", "Collateral issuance"],
  ["pythPriceUpdate", "Fresh Pyth quote"],
  ["fundedOffer", "Funded offer"],
  ["holdCreation", "Partition hold"],
  ["hssScheduleCreation", "HSS maturity schedule"],
  ["repaidFacility", "Repaid facility"],
  ["maturedDefault", "Matured default"],
  ["liveConfigurationRead", "Role and immutable reads"],
] as const;
