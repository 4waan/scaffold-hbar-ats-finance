import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceJournal,
  TINYBAR_PER_HBAR,
  assertFundingBudget,
  classifyDefaultPath,
  createTemporaryActor,
  fetchMirrorPages,
  hashScanContract,
  hashScanSchedule,
  hashScanTransaction,
  parseHermesUpdate,
  sweepTemporaryActor,
  validateEvidenceRecord,
  validateRailPolicyEvidence,
  validatedEndpoint,
} from "../lib/evidence-lib.mjs";
import { selectedRecipeId } from "../lib/demo-runtime.ts";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(payload),
  };
}

function verifiedEvidence() {
  const address = (digit) => `0x${digit.repeat(40)}`;
  const hash = (digit) => `0x${digit.repeat(64)}`;
  const hashes = "123456789a".split("").map(hash);
  const lifecycleKeys = [
    "atsBondDeployment",
    "ssiAndKycConfiguration",
    "collateralIssuance",
    "pythPriceUpdate",
    "fundedOffer",
    "holdCreation",
    "hssScheduleCreation",
    "repaidFacility",
    "maturedDefault",
    "liveConfigurationRead",
  ];
  const addresses = {
    factory: address("1"),
    resolver: address("2"),
    pyth: address("3"),
    atsToken: address("4"),
    oracle: address("5"),
    rail: address("6"),
    acceptance: address("7"),
  };
  const scheduleAddress = `0x${"0".repeat(24)}${"1".padStart(16, "0")}`;

  return {
    schemaVersion: 2,
    network: "hedera-testnet",
    chainId: 296,
    status: "verified",
    recipeId: "term-credit",
    policy: {
      maximumAdvanceBps: 7_000,
      maximumAnnualRateBps: 10_000,
      maximumQuoteMovementBps: 100,
      minimumTermSeconds: 120,
      maximumTermSeconds: 31_536_000,
      maximumOfferLifetimeSeconds: 86_400,
    },
    addresses,
    actors: {
      issuer: { accountId: "0.0.100", evmAddress: address("8") },
      lender: { accountId: "0.0.101", evmAddress: address("9") },
      borrower: { accountId: "0.0.102", evmAddress: address("a") },
    },
    lifecycle: Object.fromEntries(
      lifecycleKeys.map((key, index) => [key, hashes[index]]),
    ),
    transactions: hashes.map((transactionHash, index) => ({
      kind: lifecycleKeys[index],
      hash: transactionHash,
      result: "SUCCESS",
      consensusTimestamp: `1.${index + 1}`,
      hashScan: hashScanTransaction(transactionHash),
    })),
    positions: [
      {
        id: hash("b"),
        lender: address("9"),
        borrower: address("a"),
        collateralAmount: "10",
        holdId: "1",
        principalTinybar: "100",
        repaymentTinybar: "101",
        openedAt: 1_700_000_000,
        maturity: 1_700_000_120,
        scheduleAddress,
        state: "REPAID",
        terminalPath: "repayment",
      },
      {
        id: hash("c"),
        lender: address("9"),
        borrower: address("a"),
        collateralAmount: "10",
        holdId: "2",
        principalTinybar: "100",
        repaymentTinybar: "101",
        openedAt: 1_700_000_001,
        maturity: 1_700_000_121,
        scheduleAddress,
        state: "DEFAULTED",
        terminalPath: "hss",
      },
    ],
    schedules: [
      {
        address: scheduleAddress,
        scheduleId: "0.0.1",
        confirmed: true,
        hashScan: hashScanSchedule("0.0.1"),
      },
    ],
    pyth: {
      priceUsdE8: "10000000",
      confidenceUsdE8: "1000",
      publishTime: 1_700_000_000,
    },
    accounting: {
      cashLiabilitiesTinybar: "0",
      reservedAutomationTinybar: "0",
      requiredBackingTinybar: "0",
      contractBalanceTinybar: "1",
    },
    verification: {
      complete: true,
      mirrorOrigin: "https://testnet.mirrornode.hedera.com",
      contractLinks: Object.fromEntries(
        ["atsToken", "oracle", "rail", "acceptance"].map((name) => [
          name,
          hashScanContract(addresses[name]),
        ]),
      ),
    },
  };
}

test("endpoint policy accepts only exact public testnet endpoints", () => {
  assert.equal(
    validatedEndpoint("rpc", "https://testnet.hashio.io/api"),
    "https://testnet.hashio.io/api",
  );
  assert.throws(
    () => validatedEndpoint("rpc", "https://testnet.hashio.io/api?key=secret"),
    /allowlist/,
  );
  assert.throws(
    () => validatedEndpoint("mirror", "http://127.0.0.1"),
    /allowlist/,
  );
});

test("recipe CLI parsing is explicit and rejects missing values", () => {
  assert.equal(selectedRecipeId([]), "term-credit");
  assert.equal(
    selectedRecipeId(["--recipe", "maturity-bridge"]),
    "maturity-bridge",
  );
  assert.equal(
    selectedRecipeId(["--recipe=custom-facility"]),
    "custom-facility",
  );
  assert.throws(() => selectedRecipeId(["--recipe"]), /requires a recipe ID/);
  assert.throws(() => selectedRecipeId(["--recipe="]), /requires a recipe ID/);
});

test("funding budget rejects balances and allocations above the cap", () => {
  assert.doesNotThrow(() =>
    assertFundingBudget({
      signerTinybar: 250n * TINYBAR_PER_HBAR,
      actorFundingTinybar: 50n * TINYBAR_PER_HBAR,
    }),
  );
  assert.throws(
    () =>
      assertFundingBudget({
        signerTinybar: 251n * TINYBAR_PER_HBAR,
        actorFundingTinybar: 50n * TINYBAR_PER_HBAR,
      }),
    /between 0 and 250/,
  );
  assert.throws(
    () =>
      assertFundingBudget({
        signerTinybar: 40n * TINYBAR_PER_HBAR,
        actorFundingTinybar: 50n * TINYBAR_PER_HBAR,
      }),
    /exceeds/,
  );
});

test("temporary account creation wraps SDK failures without key material", async () => {
  const sdk = {
    PrivateKey: {
      generateECDSA: () => ({
        publicKey: { toEvmAddress: () => "1".repeat(40) },
        toStringRaw: () => "2".repeat(64),
      }),
    },
    Hbar: class Hbar {},
    AccountCreateTransaction: class AccountCreateTransaction {
      setECDSAKeyWithAlias() {
        return this;
      }
      setInitialBalance() {
        return this;
      }
      async execute() {
        throw new Error("BUSY");
      }
    },
  };
  await assert.rejects(
    createTemporaryActor({
      sdk,
      client: {},
      label: "lender",
      initialHbar: 1,
    }),
    /Could not create temporary lender account: BUSY/,
  );
});

test("Hermes parser rejects missing and malformed Pyth data", () => {
  assert.deepEqual(parseHermesUpdate({ binary: { data: ["aabb"] } }), [
    "0xaabb",
  ]);
  assert.throws(() => parseHermesUpdate({ binary: { data: [] } }), /no binary/);
  assert.throws(
    () => parseHermesUpdate({ binary: { data: ["not-hex"] } }),
    /malformed/,
  );
});

test("HSS failure remains recoverable through the permissionless fallback", () => {
  assert.equal(
    classifyDefaultPath({ state: 2 }, { state: 3 }),
    "permissionless-fallback",
  );
  assert.equal(classifyDefaultPath({ state: 3 }, { state: 3 }), "hss");
  assert.throws(
    () => classifyDefaultPath({ state: 1 }, { state: 1 }),
    /did not/,
  );
});

test("Mirror pagination follows same-origin pages and collects every result", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    if (calls.length === 1) {
      return response({
        transactions: [{ result: "SUCCESS", nonce: 0 }],
        links: { next: "/api/v1/transactions?limit=1&timestamp=lt:2" },
      });
    }
    return response({
      transactions: [{ result: "SUCCESS", nonce: 1 }],
      links: { next: null },
    });
  };
  const transactions = await fetchMirrorPages({
    mirrorOrigin: "https://testnet.mirrornode.hedera.com",
    pathname: "/api/v1/transactions/0xabc",
    collectionKey: "transactions",
    fetchImpl,
  });
  assert.equal(transactions.length, 2);
  assert.equal(calls.length, 2);
});

test("Mirror pagination refuses cross-origin next links", async () => {
  await assert.rejects(
    fetchMirrorPages({
      mirrorOrigin: "https://testnet.mirrornode.hedera.com",
      pathname: "/api/v1/transactions/0xabc",
      collectionKey: "transactions",
      fetchImpl: async () =>
        response({
          transactions: [],
          links: { next: "https://attacker.invalid/api/v1/transactions" },
        }),
    }),
    /escaped/,
  );
});

test("evidence journal is retry-safe and rejects conflicting duplicates", () => {
  const hash = `0x${"a".repeat(64)}`;
  const journal = new EvidenceJournal();
  const transaction = {
    hash,
    result: "SUCCESS",
    consensusTimestamp: "1.2",
    hashScan: `https://hashscan.io/testnet/transaction/${hash}`,
  };
  journal.add("fund", transaction);
  journal.add("fund", transaction);
  assert.equal(journal.values().length, 1);
  assert.throws(
    () => journal.add("accept", transaction),
    /Conflicting evidence/,
  );
});

test("sweep-back failure is reported without throwing or exposing a key", async () => {
  const sdk = {
    AccountId: { fromString: (value) => value },
    AccountDeleteTransaction: class AccountDeleteTransaction {
      setAccountId() {
        return this;
      }
      setTransferAccountId() {
        return this;
      }
      async freezeWith() {
        throw new Error("ACCOUNT_DELETED");
      }
    },
  };
  const result = await sweepTemporaryActor({
    sdk,
    client: {},
    actor: { accountId: "0.0.1", privateKey: {} },
    destinationId: "0.0.2",
  });
  assert.equal(result.swept, false);
  assert.match(result.error, /ACCOUNT_DELETED/);
  assert.equal("privateKey" in result, false);
});

test("verified evidence binds its recipe, policy, Mirror proofs, and links", () => {
  const record = verifiedEvidence();
  assert.equal(validateEvidenceRecord(record), record);

  record.transactions[0].hashScan = "https://example.com/not-proof";
  assert.throws(() => validateEvidenceRecord(record), /unverified transaction/);
});

test("policy evidence must stay inside the kernel safety envelope", () => {
  const record = verifiedEvidence();
  assert.equal(validateRailPolicyEvidence(record.policy), record.policy);

  record.policy.maximumAdvanceBps = 7_001;
  assert.throws(
    () => validateEvidenceRecord(record),
    /outside the kernel safety envelope/,
  );
});

test("evidence rejects missing recipes and lifecycle hashes without proof", () => {
  const missingRecipe = verifiedEvidence();
  missingRecipe.recipeId = null;
  assert.throws(() => validateEvidenceRecord(missingRecipe), /recipe ID/);

  const unknownHash = verifiedEvidence();
  unknownHash.lifecycle.holdCreation = `0x${"f".repeat(64)}`;
  assert.throws(
    () => validateEvidenceRecord(unknownHash),
    /unverified transaction/,
  );
});
