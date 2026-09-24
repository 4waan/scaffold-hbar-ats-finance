import deployment from "../../foundry/deployments/reference-testnet.json";

export const referenceDeployment = deployment;

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
