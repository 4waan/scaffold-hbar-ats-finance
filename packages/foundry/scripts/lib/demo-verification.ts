import { atsAbi, railAbi } from "@collateral-rail/shared/abis";
import { DEFAULT_PARTITION } from "@collateral-rail/shared/hedera";
import type { RailPolicy } from "@collateral-rail/shared/recipes";
import type { Address, PublicClient } from "viem";
import { ROLE_ISSUER, ROLE_KYC, ROLE_SSI_MANAGER } from "./demo-runtime.ts";

type VerificationOptions = {
  publicClient: PublicClient;
  atsToken: Address;
  rail: Address;
  issuer: Address;
  lender: Address;
  borrower: Address;
  expectedPolicy: RailPolicy;
};

export async function readVerifiedFinalState({
  publicClient,
  atsToken,
  rail,
  issuer,
  lender,
  borrower,
  expectedPolicy,
}: VerificationOptions) {
  const [
    internalKyc,
    isIssuer,
    lenderKyc,
    borrowerKyc,
    assetMaturity,
    issuerRole,
    kycRole,
    ssiRole,
    borrowerFree,
    borrowerHeld,
    lenderFree,
    lenderHeld,
    cashLiabilities,
    reservedAutomation,
    requiredBacking,
    railBalance,
    deployedPolicy,
  ] = await Promise.all([
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "isInternalKycActivated",
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "isIssuer",
      args: [issuer],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "getKycStatusFor",
      args: [lender],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "getKycStatusFor",
      args: [borrower],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "getMaturityDate",
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "hasRole",
      args: [ROLE_ISSUER, issuer],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "hasRole",
      args: [ROLE_KYC, issuer],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "hasRole",
      args: [ROLE_SSI_MANAGER, issuer],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "balanceOfByPartition",
      args: [DEFAULT_PARTITION, borrower],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "getHeldAmountForByPartition",
      args: [DEFAULT_PARTITION, borrower],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "balanceOfByPartition",
      args: [DEFAULT_PARTITION, lender],
    }),
    publicClient.readContract({
      address: atsToken,
      abi: atsAbi,
      functionName: "getHeldAmountForByPartition",
      args: [DEFAULT_PARTITION, lender],
    }),
    publicClient.readContract({
      address: rail,
      abi: railAbi,
      functionName: "cashLiabilities",
    }),
    publicClient.readContract({
      address: rail,
      abi: railAbi,
      functionName: "reservedAutomation",
    }),
    publicClient.readContract({
      address: rail,
      abi: railAbi,
      functionName: "requiredBacking",
    }),
    publicClient.getBalance({ address: rail }),
    publicClient.readContract({
      address: rail,
      abi: railAbi,
      functionName: "policy",
    }),
  ]);

  if (!internalKyc || !isIssuer || !issuerRole || !kycRole || !ssiRole) {
    throw new Error("Final ATS issuer, KYC, or role verification failed.");
  }
  if (lenderKyc !== 1 || borrowerKyc !== 1) {
    throw new Error("Final ATS counterparty KYC verification failed.");
  }
  if (railBalance < requiredBacking) {
    throw new Error(
      "Rail balance does not cover final liabilities and reserves.",
    );
  }

  const policy = {
    maximumAdvanceBps: Number(deployedPolicy.maximumAdvanceBps),
    maximumAnnualRateBps: Number(deployedPolicy.maximumAnnualRateBps),
    maximumQuoteMovementBps: Number(deployedPolicy.maximumQuoteMovementBps),
    minimumTermSeconds: Number(deployedPolicy.minimumTermSeconds),
    maximumTermSeconds: Number(deployedPolicy.maximumTermSeconds),
    maximumOfferLifetimeSeconds: Number(
      deployedPolicy.maximumOfferLifetimeSeconds,
    ),
  };
  if (JSON.stringify(policy) !== JSON.stringify(expectedPolicy)) {
    throw new Error("Deployed rail policy does not match the selected recipe.");
  }

  return {
    internalKyc,
    issuer: isIssuer,
    lenderKyc,
    borrowerKyc,
    assetMaturity,
    issuerRole,
    kycRole,
    ssiRole,
    borrowerFree,
    borrowerHeld,
    lenderFree,
    lenderHeld,
    cashLiabilities,
    reservedAutomation,
    requiredBacking,
    railBalance,
    policy,
  };
}
