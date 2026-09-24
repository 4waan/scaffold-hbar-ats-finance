import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceJournal,
  TINYBAR_PER_HBAR,
  assertFundingBudget,
  classifyDefaultPath,
  createTemporaryActor,
  fetchMirrorPages,
  parseHermesUpdate,
  sweepTemporaryActor,
  validatedEndpoint,
} from "../lib/evidence-lib.mjs";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(payload),
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
