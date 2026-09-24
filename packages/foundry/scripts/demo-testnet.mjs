import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
} from "@hiero-ledger/sdk";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_HERMES_URL,
  DEFAULT_MIRROR_URL,
  DEFAULT_RPC_URL,
  EvidenceJournal,
  HBAR_USD_PRICE_ID,
  TINYBAR_PER_HBAR,
  assertFundingBudget,
  classifyDefaultPath,
  confirmMirrorSchedule,
  createTemporaryActor,
  fetchAllowedJson,
  hashScanContract,
  parseHermesUpdate,
  readHarnessSigner,
  sweepTemporaryActor,
  validateEvidenceRecord,
  validatedEndpoint,
  waitForMirrorTransaction,
} from "./lib/evidence-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const foundryRoot = path.resolve(scriptDirectory, "..");
const addressesPath = path.join(
  foundryRoot,
  "deployments",
  "latest-addresses.json",
);
const broadcastPath = path.join(
  foundryRoot,
  "broadcast",
  "BootstrapTestnet.s.sol",
  "296",
  "run-latest.json",
);
const outputPath = path.join(foundryRoot, "deployments", "testnet.json");

const DEFAULT_FACTORY = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d";
const DEFAULT_RESOLVER = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a";
const DEFAULT_PYTH = "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729";
const DEFAULT_PARTITION = `0x${"0".repeat(63)}1`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const ACTOR_FUNDING_HBAR = 25;
const PRINCIPAL_USD_E8 = 50_000_000n;
const COLLATERAL_PER_POSITION = 10n;
const TERM_SECONDS = 120n;
const ANNUAL_RATE_BPS = 500;
const ROLE_ISSUER =
  "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
const ROLE_KYC =
  "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
const ROLE_SSI_MANAGER =
  "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";

const chain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
});

const railAbi = [
  {
    type: "function",
    name: "previewOffer",
    stateMutability: "view",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint128" },
          { name: "principalUsdE8", type: "uint128" },
          { name: "annualRateBps", type: "uint16" },
          { name: "termSeconds", type: "uint64" },
          { name: "offerExpiresAt", type: "uint64" },
        ],
      },
    ],
    outputs: [
      { name: "maximumPrincipalUsdE8", type: "uint256" },
      { name: "principalTinybar", type: "uint256" },
      { name: "repaymentTinybar", type: "uint256" },
      { name: "maturity", type: "uint64" },
      { name: "priceUsdE8", type: "uint256" },
      { name: "publishTime", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "fundOffer",
    stateMutability: "payable",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint128" },
          { name: "principalUsdE8", type: "uint128" },
          { name: "annualRateBps", type: "uint16" },
          { name: "termSeconds", type: "uint64" },
          { name: "offerExpiresAt", type: "uint64" },
        ],
      },
    ],
    outputs: [{ name: "offerId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "acceptOffer",
    stateMutability: "nonpayable",
    inputs: [{ name: "offerId", type: "bytes32" }],
    outputs: [{ name: "positionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "payable",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [{ name: "executed", type: "bool" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [
      {
        name: "position",
        type: "tuple",
        components: [
          { name: "lender", type: "address" },
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "holdId", type: "uint256" },
          { name: "principalTinybar", type: "uint256" },
          { name: "repaymentTinybar", type: "uint256" },
          { name: "openedAt", type: "uint64" },
          { name: "maturity", type: "uint64" },
          { name: "scheduleAddress", type: "address" },
          { name: "state", type: "uint8" },
          { name: "automation", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "cashLiabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reservedAutomation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "requiredBacking",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "OfferFunded",
    inputs: [
      { indexed: true, name: "offerId", type: "bytes32" },
      { indexed: true, name: "lender", type: "address" },
      { indexed: true, name: "borrower", type: "address" },
      { indexed: false, name: "principalTinybar", type: "uint256" },
      { indexed: false, name: "quotePriceUsdE8", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { indexed: true, name: "positionId", type: "bytes32" },
      { indexed: true, name: "lender", type: "address" },
      { indexed: true, name: "borrower", type: "address" },
      { indexed: false, name: "holdId", type: "uint256" },
      { indexed: false, name: "maturity", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "AutomationReserved",
    inputs: [
      { indexed: true, name: "positionId", type: "bytes32" },
      { indexed: true, name: "scheduleAddress", type: "address" },
      { indexed: false, name: "executionSecond", type: "uint64" },
    ],
  },
];

const atsAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOfByPartition",
    stateMutability: "view",
    inputs: [
      { name: "partition", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getHeldAmountForByPartition",
    stateMutability: "view",
    inputs: [
      { name: "partition", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "getMaturityDate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isInternalKycActivated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isIssuer",
    stateMutability: "view",
    inputs: [{ name: "issuer", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getHoldForByPartition",
    stateMutability: "view",
    inputs: [
      {
        name: "id",
        type: "tuple",
        components: [
          { name: "partition", type: "bytes32" },
          { name: "tokenHolder", type: "address" },
          { name: "holdId", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "expirationTimestamp", type: "uint256" },
      { name: "escrow", type: "address" },
      { name: "destination", type: "address" },
      { name: "data", type: "bytes" },
      { name: "operatorData", type: "bytes" },
      { name: "thirdPartyType", type: "uint8" },
    ],
  },
];

const pythAbi = [
  {
    type: "function",
    name: "getUpdateFee",
    stateMutability: "view",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ name: "feeAmount", type: "uint256" }],
  },
];

const oracleAbi = [
  {
    type: "function",
    name: "updatePrice",
    stateMutability: "payable",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
  },
  {
    type: "function",
    name: "latestHbarUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "priceUsdE8", type: "uint256" },
      { name: "confidenceUsdE8", type: "uint256" },
      { name: "publishTime", type: "uint64" },
    ],
  },
];

function requireAddress(name, value) {
  if (!isAddress(value ?? ""))
    throw new Error(`Missing valid ${name} address.`);
  return value;
}

async function runFoundry(environment) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "forge",
      [
        "script",
        "script/BootstrapTestnet.s.sol:BootstrapTestnet",
        "--rpc-url",
        "hedera_testnet",
        "--broadcast",
        "--non-interactive",
      ],
      {
        cwd: foundryRoot,
        env: environment,
        stdio: "inherit",
        shell: false,
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Foundry bootstrap failed with ${signal ?? `exit ${code}`}.`,
          ),
        );
    });
  });
}

function eventArgs(receipt, eventName) {
  const events = parseEventLogs({
    abi: railAbi,
    logs: receipt.logs,
    eventName,
    strict: false,
  });
  if (events.length !== 1) {
    throw new Error(
      `Expected one ${eventName} event, received ${events.length}.`,
    );
  }
  return events[0].args;
}

async function waitUntil(timestampSeconds) {
  const milliseconds = timestampSeconds * 1000 - Date.now();
  if (milliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

async function confirmScheduleWithRetry(options) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await confirmMirrorSchedule(options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(
    `Mirror did not confirm the HSS schedule: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}

function positionStateName(state) {
  return (
    ["NONE", "OPEN", "REPAID", "DEFAULTED"][Number(state)] ?? `UNKNOWN_${state}`
  );
}

function automationStateName(state) {
  return (
    ["NONE", "PENDING", "COMPLETED", "UNAVAILABLE"][Number(state)] ??
    `UNKNOWN_${state}`
  );
}

async function main() {
  if ((process.env.HEDERA_NETWORK ?? "testnet") !== "testnet") {
    throw new Error("The evidence runner permits Hedera testnet only.");
  }
  const signer = readHarnessSigner();
  const rpcUrl = validatedEndpoint(
    "rpc",
    process.env.HEDERA_TESTNET_RPC_URL ?? DEFAULT_RPC_URL,
  );
  const mirrorUrl = validatedEndpoint(
    "mirror",
    process.env.HEDERA_MIRROR_URL ?? DEFAULT_MIRROR_URL,
  );
  const hermesUrl = validatedEndpoint(
    "hermes",
    process.env.PYTH_HERMES_URL ?? DEFAULT_HERMES_URL,
  );
  const factory = requireAddress(
    "ATS Factory",
    process.env.ATS_FACTORY_ADDRESS ?? DEFAULT_FACTORY,
  );
  const resolver = requireAddress(
    "ATS Resolver",
    process.env.ATS_RESOLVER_ADDRESS ?? DEFAULT_RESOLVER,
  );
  const pyth = requireAddress("Pyth", process.env.PYTH_ADDRESS ?? DEFAULT_PYTH);

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
  const actors = [];
  const sweepResults = [];

  async function verifyHash(kind, hash) {
    const proof = await waitForMirrorTransaction({
      mirrorOrigin: mirrorUrl,
      hash,
    });
    return journal.add(kind, proof);
  }

  async function writeAndVerify(kind, wallet, request) {
    const hash = await wallet.writeContract(request);
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
      LENDER_ADDRESS: lender.evmAddress,
      BORROWER_ADDRESS: borrower.evmAddress,
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
      const hash = transaction.hash ?? transaction.transactionHash;
      deploymentProofs.push(await verifyHash(`bootstrap-${index + 1}`, hash));
    }

    const lenderWallet = createWalletClient({
      account: privateKeyToAccount(lender.privateKeyHex),
      chain,
      transport: http(rpcUrl),
    });
    const borrowerWallet = createWalletClient({
      account: privateKeyToAccount(borrower.privateKeyHex),
      chain,
      transport: http(rpcUrl),
    });

    console.log("Submitting a fresh Pyth HBAR/USD update.");
    const hermesPayload = await fetchAllowedJson(
      `${hermesUrl}/v2/updates/price/latest?ids%5B%5D=${HBAR_USD_PRICE_ID.slice(2)}&encoding=hex`,
      new URL(hermesUrl).origin,
    );
    const updateData = parseHermesUpdate(hermesPayload);
    const updateFee = await publicClient.readContract({
      address: pyth,
      abi: pythAbi,
      functionName: "getUpdateFee",
      args: [updateData],
    });
    const pythUpdate = await writeAndVerify("pyth-price-update", lenderWallet, {
      address: oracle,
      abi: oracleAbi,
      functionName: "updatePrice",
      args: [updateData],
      value: updateFee,
    });
    const [priceUsdE8, confidenceUsdE8, publishTime] =
      await publicClient.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "latestHbarUsd",
      });

    const approval = await writeAndVerify("ats-allowance", borrowerWallet, {
      address: atsToken,
      abi: atsAbi,
      functionName: "approve",
      args: [rail, COLLATERAL_PER_POSITION * 2n],
    });

    console.log("Funding and accepting two bilateral facilities.");
    const positions = [];
    const schedules = [];
    const fundTransactions = [];
    const acceptTransactions = [];
    for (let sequence = 0; sequence < 2; sequence += 1) {
      const terms = {
        borrower: borrower.evmAddress,
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
      const funded = await writeAndVerify(
        `fund-offer-${sequence + 1}`,
        lenderWallet,
        {
          address: rail,
          abi: railAbi,
          functionName: "fundOffer",
          args: [terms],
          value: preview[1],
        },
      );
      fundTransactions.push(funded);
      const offerId = eventArgs(funded.receipt, "OfferFunded").offerId;
      const accepted = await writeAndVerify(
        `accept-offer-${sequence + 1}`,
        borrowerWallet,
        {
          address: rail,
          abi: railAbi,
          functionName: "acceptOffer",
          args: [offerId],
        },
      );
      acceptTransactions.push(accepted);
      const opened = eventArgs(accepted.receipt, "PositionOpened");
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
            tokenHolder: borrower.evmAddress,
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
      positions.push({ id: opened.positionId, opened: position, hold });
    }
    if (schedules.length === 0) {
      throw new Error("No real HSS schedule was created for either position.");
    }

    await writeAndVerify("borrower-withdrawal", borrowerWallet, {
      address: rail,
      abi: railAbi,
      functionName: "withdraw",
    });
    const repaid = await writeAndVerify("repay-position", borrowerWallet, {
      address: rail,
      abi: railAbi,
      functionName: "repay",
      args: [positions[0].id],
      value: positions[0].opened.repaymentTinybar,
    });
    await writeAndVerify("lender-withdrawal", lenderWallet, {
      address: rail,
      abi: railAbi,
      functionName: "withdraw",
    });

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
      lenderWallet,
      {
        address: rail,
        abi: railAbi,
        functionName: "settle",
        args: [positions[1].id],
      },
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

    const [
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
        args: [signer.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "getKycStatusFor",
        args: [lender.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "getKycStatusFor",
        args: [borrower.evmAddress],
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
        args: [ROLE_ISSUER, signer.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "hasRole",
        args: [ROLE_KYC, signer.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "hasRole",
        args: [ROLE_SSI_MANAGER, signer.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "balanceOfByPartition",
        args: [DEFAULT_PARTITION, borrower.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "getHeldAmountForByPartition",
        args: [DEFAULT_PARTITION, borrower.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "balanceOfByPartition",
        args: [DEFAULT_PARTITION, lender.evmAddress],
      }),
      publicClient.readContract({
        address: atsToken,
        abi: atsAbi,
        functionName: "getHeldAmountForByPartition",
        args: [DEFAULT_PARTITION, lender.evmAddress],
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
    ]);
    if (!internalKyc || !issuer || !issuerRole || !kycRole || !ssiRole) {
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
        lender: { accountId: lender.accountId, evmAddress: lender.evmAddress },
        borrower: {
          accountId: borrower.accountId,
          evmAddress: borrower.evmAddress,
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
