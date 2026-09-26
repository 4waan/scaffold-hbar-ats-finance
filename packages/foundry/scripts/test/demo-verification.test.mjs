import assert from "node:assert/strict";
import test from "node:test";
import { WEIBAR_PER_TINYBAR } from "@collateral-rail/shared/hedera";
import { readVerifiedFinalState } from "../lib/demo-verification.ts";

const address = (digit) => `0x${digit.repeat(40)}`;
const expectedPolicy = {
  maximumAdvanceBps: 7_000,
  maximumAnnualRateBps: 10_000,
  maximumQuoteMovementBps: 100,
  minimumTermSeconds: 120,
  maximumTermSeconds: 31_536_000,
  maximumOfferLifetimeSeconds: 86_400,
};

function publicClientWithBalance(balanceWeibar) {
  const responses = [
    true,
    true,
    1,
    1,
    1_800_000_000n,
    false,
    0,
    10_000n,
    2,
    "0x555344",
    true,
    true,
    true,
    980n,
    0n,
    20n,
    0n,
    3n,
    2n,
    5n,
    expectedPolicy,
    [100_000_000n, 1_000n, 1_700_000_000n],
  ];
  return {
    readContract: async () => responses.shift(),
    getBalance: async () => balanceWeibar,
  };
}

function verificationOptions(balanceWeibar) {
  return {
    publicClient: publicClientWithBalance(balanceWeibar),
    atsToken: address("1"),
    oracle: address("2"),
    rail: address("3"),
    issuer: address("4"),
    lender: address("5"),
    borrower: address("6"),
    expectedPolicy,
    blockNumber: 123n,
  };
}

test("final solvency converts the JSON RPC balance from weibar", async () => {
  const state = await readVerifiedFinalState(
    verificationOptions(5n * WEIBAR_PER_TINYBAR),
  );
  assert.equal(state.railBalance, 5n);
  await assert.rejects(
    readVerifiedFinalState(verificationOptions(4n * WEIBAR_PER_TINYBAR)),
    /does not cover/,
  );
});

test("final solvency rejects fractional tinybar RPC balances", async () => {
  await assert.rejects(
    readVerifiedFinalState(verificationOptions(5n * WEIBAR_PER_TINYBAR + 1n)),
    /exact tinybar/,
  );
});
