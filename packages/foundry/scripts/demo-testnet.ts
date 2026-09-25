import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
} from "@hiero-ledger/sdk";
import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from "viem";
import type { Address, Hash, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  atsAbi,
  oracleAbi,
  pythAbi,
  railAbi,
} from "@collateral-rail/shared/abis";
import { DEFAULT_PARTITION } from "@collateral-rail/shared/hedera";
import {
  EvidenceJournal,
  HBAR_USD_PRICE_ID,
  TINYBAR_PER_HBAR,
  assertFundingBudget,
  classifyDefaultPath,
  createTemporaryActor,
  fetchAllowedJson,
  hashScanContract,
  parseHermesUpdate,
  sweepTemporaryActor,
  validateEvidenceRecord,
  waitForMirrorTransaction,
} from "./lib/evidence-lib.mjs";
import { readDemoConfiguration } from "./lib/demo-config.ts";
import {
  ACTOR_FUNDING_HBAR,
  ANNUAL_RATE_BPS,
  COLLATERAL_PER_POSITION,
  PRINCIPAL_USD_E8,
  TERM_SECONDS,
  ZERO_ADDRESS,
  addressesPath,
  automationStateName,
  broadcastPath,
  chain,
  confirmScheduleWithRetry,
  offerFundedArgs,
  outputPath,
  positionOpenedArgs,
  positionStateName,
  requireAddress,
  runFoundry,
  waitUntil,
} from "./lib/demo-runtime.ts";
import { readVerifiedFinalState } from "./lib/demo-verification.ts";

async function main() {
  const {
    recipe,
    signer,
    rpcUrl,
    mirrorUrl,
    hermesUrl,
    factory,
    resolver,
    pyth,
  } = readDemoConfiguration();

  const operatorKey = PrivateKey.fromStringECDSA(signer.privateKey.slice(2));
  const derivedAddress = `0x${operatorKey.publicKey.toEvmAddress()}`;
  if (derivedAddress.toLowerCase() !== signer.evmAddress.toLowerCase()) {
    throw new Error(
      "Harness signer key does not match its public EVM address.",
    );
  }
  const sdkClient = Client.forTestnet().setOperator(
    AccountId.fromString(signer.accountId),
    operatorKey,
  );
  const balance = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(signer.accountId))
    .execute(sdkClient);
  const signerTinybar = BigInt(balance.hbars.toTinybars().toString());
  assertFundingBudget({
    signerTinybar,
    actorFundingTinybar: BigInt(ACTOR_FUNDING_HBAR * 2) * TINYBAR_PER_HBAR,
  });

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const journal = new EvidenceJournal();
  const actors: Array<Awaited<ReturnType<typeof createTemporaryActor>>> = [];
  const sweepResults: Array<Awaited<ReturnType<typeof sweepTemporaryActor>>> =
    [];

  async function verifyHash(kind: string, hash: Hash) {
    const proof = await waitForMirrorTransaction({
      mirrorOrigin: mirrorUrl,
      hash,
    });
    return journal.add(kind, proof);
  }

  async function writeAndVerify(kind: string, write: () => Promise<Hash>) {
    const hash = await write();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${kind} reverted.`);
    await verifyHash(kind, hash);
    return { hash, receipt };
  }

  try {
    console.log(
      "Creating temporary lender and borrower accounts on Hedera testnet.",
    );
    const lender = await createTemporaryActor({
      sdk: await import("@hiero-ledger/sdk"),
      client: sdkClient,
      label: "lender",
      initialHbar: ACTOR_FUNDING_HBAR,
    });
    actors.push(lender);
    const borrower = await createTemporaryActor({
      sdk: await import("@hiero-ledger/sdk"),
      client: sdkClient,
      label: "borrower",
      initialHbar: ACTOR_FUNDING_HBAR,
    });
    actors.push(borrower);
    const lenderAddress = requireAddress("temporary lender", lender.evmAddress);
    const borrowerAddress = requireAddress(
      "temporary borrower",
      borrower.evmAddress,
    );

    console.log(
      "Deploying the ATS bond, oracle, rail, and acceptance verifier.",
    );
    await runFoundry({
      ...process.env,
      HEDERA_NETWORK: "testnet",
      HEDERA_TESTNET_RPC_URL: rpcUrl,
      HEDERA_MIRROR_URL: mirrorUrl,
      PYTH_HERMES_URL: hermesUrl,
      ATS_FACTORY_ADDRESS: factory,
      ATS_RESOLVER_ADDRESS: resolver,
      PYTH_ADDRESS: pyth,
      HEDERA_OPERATOR_ADDRESS: signer.evmAddress,
      LENDER_ADDRESS: lenderAddress,
      BORROWER_ADDRESS: borrowerAddress,
      RAIL_MAXIMUM_ADVANCE_BPS: String(recipe.policy.maximumAdvanceBps),
      RAIL_MAXIMUM_ANNUAL_RATE_BPS: String(recipe.policy.maximumAnnualRateBps),
      RAIL_MAXIMUM_QUOTE_MOVEMENT_BPS: String(
        recipe.policy.maximumQuoteMovementBps,
      ),
      RAIL_MINIMUM_TERM_SECONDS: String(recipe.policy.minimumTermSeconds),
      RAIL_MAXIMUM_TERM_SECONDS: String(recipe.policy.maximumTermSeconds),
      RAIL_MAXIMUM_OFFER_LIFETIME_SECONDS: String(
        recipe.policy.maximumOfferLifetimeSeconds,
      ),
    });

    const addresses = JSON.parse(await readFile(addressesPath, "utf8"));
    const broadcast = JSON.parse(await readFile(broadcastPath, "utf8"));
    const atsToken = requireAddress("ATS token", addresses.atsToken);
    const oracle = requireAddress("oracle", addresses.oracle);
    const rail = requireAddress("rail", addresses.rail);
    const acceptance = requireAddress("acceptance", addresses.acceptance);
    const broadcastTransactions = broadcast.transactions ?? [];
    if (broadcastTransactions.length < 9) {
      throw new Error(
        "Foundry bootstrap did not emit the expected transactions.",
      );
    }
    const deploymentProofs = [];
    for (let index = 0; index < broadcastTransactions.length; index += 1) {
      const transaction = broadcastTransactions[index];
      const hash = (transaction.hash ?? transaction.transactionHash) as Hash;
      deploymentProofs.push(await verifyHash(`bootstrap-${index + 1}`, hash));
    }

    const lenderWallet = createWalletClient({
      account: privateKeyToAccount(lender.privateKeyHex as Hex),
      chain,
      transport: http(rpcUrl),
    });
    const borrowerWallet = createWalletClient({
      account: privateKeyToAccount(borrower.privateKeyHex as Hex),
      chain,
      transport: http(rpcUrl),
    });

    console.log("Submitting a fresh Pyth HBAR/USD update.");
    const hermesPayload = await fetchAllowedJson(
      `${hermesUrl}/v2/updates/price/latest?ids%5B%5D=${HBAR_USD_PRICE_ID.slice(2)}&encoding=hex`,
      new URL(hermesUrl).origin,
    );
    const updateData = parseHermesUpdate(hermesPayload) as Hex[];
    const updateFee = await publicClient.readContract({
      address: pyth,
      abi: pythAbi,
      functionName: "getUpdateFee",
      args: [updateData],
    });
    const pythUpdate = await writeAndVerify("pyth-price-update", () =>
      lenderWallet.writeContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "updatePrice",
        args: [updateData],
        value: updateFee,
      }),
    );
    const [priceUsdE8, confidenceUsdE8, publishTime] =
      await publicClient.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "latestHbarUsd",
      });

    await writeAndVerify("ats-allowance", () =>
      borrowerWallet.writeContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "approve",
        args: [rail, COLLATERAL_PER_POSITION * 2n],
      }),
    );

    console.log("Funding and accepting two bilateral facilities.");
    const positions: Array<{
      id: Hex;
      opened: {
        lender: Address;
        borrower: Address;
        collateralAmount: bigint;
        holdId: bigint;
        principalTinybar: bigint;
        repaymentTinybar: bigint;
        openedAt: bigint;
        maturity: bigint;
        scheduleAddress: Address;
        state: number;
        automation: number;
      };
      hold: readonly unknown[];
    }> = [];
    const schedules: Array<
      Awaited<ReturnType<typeof confirmScheduleWithRetry>>
    > = [];
    const fundTransactions: Array<Awaited<ReturnType<typeof writeAndVerify>>> =
      [];
    const acceptTransactions: Array<
      Awaited<ReturnType<typeof writeAndVerify>>
    > = [];
    for (let sequence = 0; sequence < 2; sequence += 1) {
      const terms = {
        borrower: borrowerAddress,
        collateralAmount: COLLATERAL_PER_POSITION,
        principalUsdE8: PRINCIPAL_USD_E8,
        annualRateBps: ANNUAL_RATE_BPS,
        termSeconds: TERM_SECONDS,
        offerExpiresAt: BigInt(Math.floor(Date.now() / 1000) + 600),
      };
      const preview = await publicClient.readContract({
        address: rail,
        abi: railAbi,
        functionName: "previewOffer",
        args: [terms],
      });
      const funded = await writeAndVerify(`fund-offer-${sequence + 1}`, () =>
        lenderWallet.writeContract({
          address: rail,
          abi: railAbi,
          functionName: "fundOffer",
          args: [terms],
          value: preview[1],
        }),
      );
      fundTransactions.push(funded);
      const offerId = offerFundedArgs(funded.receipt).offerId;
      const accepted = await writeAndVerify(
        `accept-offer-${sequence + 1}`,
        () =>
          borrowerWallet.writeContract({
            address: rail,
            abi: railAbi,
            functionName: "acceptOffer",
            args: [offerId],
          }),
      );
      acceptTransactions.push(accepted);
      const opened = positionOpenedArgs(accepted.receipt);
      const position = await publicClient.readContract({
        address: rail,
        abi: railAbi,
        functionName: "getPosition",
        args: [opened.positionId],
      });
      const hold = await publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "getHoldForByPartition",
        args: [
          {
            partition: DEFAULT_PARTITION,
            tokenHolder: borrowerAddress,
            holdId: position.holdId,
          },
        ],
      });
      if (
        hold[0] !== COLLATERAL_PER_POSITION ||
        hold[2].toLowerCase() !== rail.toLowerCase() ||
        hold[3] !== ZERO_ADDRESS
      ) {
        throw new Error(
          "ATS hold inspection did not match the facility terms.",
        );
      }
      if (position.scheduleAddress !== ZERO_ADDRESS) {
        schedules.push(
          await confirmScheduleWithRetry({
            mirrorOrigin: mirrorUrl,
            scheduleAddress: position.scheduleAddress,
          }),
        );
      }
      positions.push({
        id: opened.positionId,
        opened: position,
        hold: [...hold],
      });
    }
    if (schedules.length === 0) {
      throw new Error("No real HSS schedule was created for either position.");
    }

    await writeAndVerify("borrower-withdrawal", () =>
      borrowerWallet.writeContract({
        address: rail,
        abi: railAbi,
        functionName: "withdraw",
      }),
    );
    const repaid = await writeAndVerify("repay-position", () =>
      borrowerWallet.writeContract({
        address: rail,
        abi: railAbi,
        functionName: "repay",
        args: [positions[0].id],
        value: positions[0].opened.repaymentTinybar,
      }),
    );
    await writeAndVerify("lender-withdrawal", () =>
      lenderWallet.writeContract({
        address: rail,
        abi: railAbi,
        functionName: "withdraw",
      }),
    );

    console.log("Waiting for the second two-minute facility to mature.");
    await waitUntil(Number(positions[1].opened.maturity) + 12);
    const beforeFallback = await publicClient.readContract({
      address: rail,
      abi: railAbi,
      functionName: "getPosition",
      args: [positions[1].id],
    });
    const terminal = await writeAndVerify(
      Number(beforeFallback.state) === 3
        ? "confirm-hss-default"
        : "permissionless-default",
      () =>
        lenderWallet.writeContract({
          address: rail,
          abi: railAbi,
          functionName: "settle",
          args: [positions[1].id],
        }),
    );
    const finalPositions = await Promise.all(
      positions.map(({ id }) =>
        publicClient.readContract({
          address: rail,
          abi: railAbi,
          functionName: "getPosition",
          args: [id],
        }),
      ),
    );
    const defaultPath = classifyDefaultPath(beforeFallback, finalPositions[1]);

    const {
      internalKyc,
      issuer,
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
    } = await readVerifiedFinalState({
      publicClient,
      atsToken,
      rail,
      issuer: signer.evmAddress,
      lender: lenderAddress,
      borrower: borrowerAddress,
      expectedPolicy: recipe.policy,
    });

    const scheduleTransaction =
      acceptTransactions.find((entry) => {
        try {
          return (
            parseEventLogs({
              abi: railAbi,
              logs: entry.receipt.logs,
              eventName: "AutomationReserved",
              strict: false,
            }).length > 0
          );
        } catch {
          return false;
        }
      }) ?? acceptTransactions[0];
    const record = {
      schemaVersion: 2,
      network: "hedera-testnet",
      chainId: 296,
      status: "verified",
      generatedAt: new Date().toISOString(),
      recipeId: recipe.id,
      policy,
      addresses: {
        factory,
        resolver,
        pyth,
        atsToken,
        oracle,
        rail,
        acceptance,
      },
      actors: {
        issuer: { accountId: signer.accountId, evmAddress: signer.evmAddress },
        lender: { accountId: lender.accountId, evmAddress: lenderAddress },
        borrower: {
          accountId: borrower.accountId,
          evmAddress: borrowerAddress,
        },
      },
      transactions: journal.values(),
      lifecycle: {
        atsBondDeployment: deploymentProofs[0].hash,
        ssiAndKycConfiguration: deploymentProofs[3].hash,
        collateralIssuance: deploymentProofs[4].hash,
        pythPriceUpdate: pythUpdate.hash,
        fundedOffer: fundTransactions[0].hash,
        holdCreation: acceptTransactions[0].hash,
        hssScheduleCreation: scheduleTransaction.hash,
        repaidFacility: repaid.hash,
        maturedDefault: terminal.hash,
        liveConfigurationRead: terminal.hash,
      },
      pyth: {
        feedId: HBAR_USD_PRICE_ID,
        purpose: "HBAR cash-leg conversion only",
        priceUsdE8: priceUsdE8.toString(),
        confidenceUsdE8: confidenceUsdE8.toString(),
        publishTime: Number(publishTime),
      },
      ats: {
        internalKyc,
        issuer,
        kyc: { lender: Number(lenderKyc), borrower: Number(borrowerKyc) },
        roles: { issuer: issuerRole, kyc: kycRole, ssiManager: ssiRole },
        assetMaturity: assetMaturity.toString(),
        balances: {
          borrower: {
            free: borrowerFree.toString(),
            held: borrowerHeld.toString(),
          },
          lender: { free: lenderFree.toString(), held: lenderHeld.toString() },
        },
      },
      positions: finalPositions.map((position, index) => ({
        id: positions[index].id,
        lender: position.lender,
        borrower: position.borrower,
        collateralAmount: position.collateralAmount.toString(),
        holdId: position.holdId.toString(),
        principalTinybar: position.principalTinybar.toString(),
        repaymentTinybar: position.repaymentTinybar.toString(),
        openedAt: Number(position.openedAt),
        maturity: Number(position.maturity),
        scheduleAddress: position.scheduleAddress,
        state: positionStateName(position.state),
        automation: automationStateName(position.automation),
        terminalPath: index === 0 ? "repayment" : defaultPath,
      })),
      schedules,
      accounting: {
        cashLiabilitiesTinybar: cashLiabilities.toString(),
        reservedAutomationTinybar: reservedAutomation.toString(),
        requiredBackingTinybar: requiredBacking.toString(),
        contractBalanceTinybar: railBalance.toString(),
      },
      verification: {
        complete: true,
        readsAtBlock: terminal.receipt.blockNumber.toString(),
        mirrorOrigin: mirrorUrl,
        contractLinks: Object.fromEntries(
          Object.entries({ atsToken, oracle, rail, acceptance }).map(
            ([name, address]) => [name, hashScanContract(address)],
          ),
        ),
      },
      notice:
        "Verified public Hedera testnet evidence. The record contains no signer material or raw transaction payloads.",
    };
    validateEvidenceRecord(record);
    await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`Verified evidence written to ${outputPath}.`);
  } finally {
    for (const actor of actors.reverse()) {
      sweepResults.push(
        await sweepTemporaryActor({
          sdk: await import("@hiero-ledger/sdk"),
          client: sdkClient,
          actor,
          destinationId: signer.accountId,
        }),
      );
    }
    sdkClient.close();
    for (const result of sweepResults) {
      console.log(
        result.swept
          ? `Swept temporary account ${result.accountId}.`
          : `Best-effort sweep failed for ${result.accountId}.`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
