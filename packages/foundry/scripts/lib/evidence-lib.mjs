import { setTimeout as delay } from "node:timers/promises";

const TESTNET_CHAIN_ID = 296;
export const TINYBAR_PER_HBAR = 100_000_000n;
const MAX_SIGNER_HBAR = 250n;
export const DEFAULT_RPC_URL = "https://testnet.hashio.io/api";
export const DEFAULT_MIRROR_URL = "https://testnet.mirrornode.hedera.com";
export const DEFAULT_HERMES_URL = "https://hermes.pyth.network";
export const HBAR_USD_PRICE_ID =
  "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ACCOUNT_ID_RE = /^0\.0\.\d+$/;
const FORBIDDEN_EVIDENCE_KEYS = /private|mnemonic|secret|calldata|operatorKey/i;
const MAX_RESPONSE_BYTES = 2_000_000;
const POLICY_FIELDS = [
  "maximumAdvanceBps",
  "maximumAnnualRateBps",
  "maximumQuoteMovementBps",
  "minimumTermSeconds",
  "maximumTermSeconds",
  "maximumOfferLifetimeSeconds",
];

const ENDPOINT_POLICIES = {
  rpc: { origin: "https://testnet.hashio.io", pathname: "/api" },
  mirror: { origin: DEFAULT_MIRROR_URL, pathname: "/" },
  hermes: { origin: DEFAULT_HERMES_URL, pathname: "/" },
};

export function validatedEndpoint(kind, candidate) {
  const policy = ENDPOINT_POLICIES[kind];
  if (!policy) throw new Error(`Unknown endpoint policy: ${kind}.`);
  const parsed = new URL(candidate);
  if (
    parsed.origin !== policy.origin ||
    parsed.pathname.replace(/\/$/, "") !== policy.pathname.replace(/\/$/, "") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${kind} endpoint is outside the Hedera testnet allowlist.`,
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

export function readHarnessSigner(environment = process.env) {
  const accountId = environment.HARNESS_SIGNER_ACCOUNT_ID?.trim();
  const evmAddress = environment.HARNESS_SIGNER_EVM_ADDRESS?.trim();
  const privateKey = environment.HARNESS_SIGNER_PRIVATE_KEY?.trim();
  if (!ACCOUNT_ID_RE.test(accountId ?? "")) {
    throw new Error(
      "HARNESS_SIGNER_ACCOUNT_ID must be a Hedera testnet account ID.",
    );
  }
  if (!ADDRESS_RE.test(evmAddress ?? "")) {
    throw new Error(
      "HARNESS_SIGNER_EVM_ADDRESS must be a 20-byte EVM address.",
    );
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey ?? "")) {
    throw new Error(
      "HARNESS_SIGNER_PRIVATE_KEY must be a raw 32-byte ECDSA key.",
    );
  }
  return { accountId, evmAddress, privateKey };
}

export function assertFundingBudget({ signerTinybar, actorFundingTinybar }) {
  const cap = MAX_SIGNER_HBAR * TINYBAR_PER_HBAR;
  if (signerTinybar <= 0n || signerTinybar > cap) {
    throw new Error(
      `Harness signer balance must be between 0 and ${MAX_SIGNER_HBAR} HBAR.`,
    );
  }
  if (actorFundingTinybar < 0n || actorFundingTinybar > signerTinybar) {
    throw new Error(
      "Temporary actor funding exceeds the Harness signer balance.",
    );
  }
}

export function parseHermesUpdate(payload) {
  const values = payload?.binary?.data;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Hermes returned no binary Pyth update payload.");
  }
  return values.map((value) => {
    if (typeof value !== "string" || !/^[a-fA-F0-9]+$/.test(value)) {
      throw new Error("Hermes returned malformed binary update data.");
    }
    return `0x${value}`;
  });
}

export function classifyDefaultPath(
  positionBeforeFallback,
  positionAfterFallback,
) {
  if (Number(positionBeforeFallback.state) === 3) return "hss";
  if (Number(positionAfterFallback.state) === 3)
    return "permissionless-fallback";
  throw new Error("The overdue position did not reach DEFAULTED.");
}

function solidityAddressToEntityId(address) {
  if (!ADDRESS_RE.test(address)) throw new Error("Invalid schedule address.");
  const raw = address.slice(2).toLowerCase();
  if (!/^0{24}[a-f0-9]{16}$/.test(raw)) {
    throw new Error(
      "Schedule address is not a Hedera long-zero entity address.",
    );
  }
  return `0.0.${BigInt(`0x${raw.slice(24)}`).toString()}`;
}

export function hashScanTransaction(hash) {
  if (!HASH_RE.test(hash)) throw new Error("Invalid transaction hash.");
  return `https://hashscan.io/testnet/transaction/${hash}`;
}

export function hashScanContract(address) {
  if (!ADDRESS_RE.test(address)) throw new Error("Invalid contract address.");
  return `https://hashscan.io/testnet/contract/${address}`;
}

export function hashScanSchedule(scheduleId) {
  if (!ACCOUNT_ID_RE.test(scheduleId)) throw new Error("Invalid schedule ID.");
  return `https://hashscan.io/testnet/schedule/${scheduleId}`;
}

async function safeJson(response, label) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeded the size limit.`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeded the size limit.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export async function fetchAllowedJson(url, expectedOrigin, fetchImpl = fetch) {
  const parsed = new URL(url);
  if (parsed.origin !== expectedOrigin || parsed.username || parsed.password) {
    throw new Error("Remote request escaped the configured testnet origin.");
  }
  const response = await fetchImpl(parsed, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Remote request returned HTTP ${response.status}.`);
  }
  return safeJson(response, parsed.pathname);
}

export async function fetchMirrorPages({
  mirrorOrigin,
  pathname,
  collectionKey,
  fetchImpl = fetch,
  maxPages = 20,
}) {
  const origin = new URL(mirrorOrigin).origin;
  let next = new URL(pathname, origin).toString();
  const collected = [];
  const seen = new Set();
  for (let page = 0; next && page < maxPages; page += 1) {
    if (seen.has(next)) throw new Error("Mirror pagination loop detected.");
    seen.add(next);
    const url = new URL(next, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/v1/")) {
      throw new Error("Mirror pagination escaped the testnet API allowlist.");
    }
    const payload = await fetchAllowedJson(url, origin, fetchImpl);
    const values = payload?.[collectionKey];
    if (!Array.isArray(values)) {
      throw new Error(`Mirror response omitted ${collectionKey}.`);
    }
    collected.push(...values);
    const candidate = payload?.links?.next;
    next = candidate ? new URL(candidate, origin).toString() : "";
  }
  if (next) throw new Error("Mirror pagination exceeded the page limit.");
  return collected;
}

export async function waitForMirrorTransaction({
  mirrorOrigin,
  hash,
  fetchImpl = fetch,
  timeoutMs = 120_000,
  intervalMs = 2_000,
}) {
  if (!HASH_RE.test(hash)) throw new Error("Invalid transaction hash.");
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const transactions = await fetchMirrorPages({
        mirrorOrigin,
        pathname: `/api/v1/transactions/${encodeURIComponent(hash)}`,
        collectionKey: "transactions",
        fetchImpl,
      });
      const success = transactions.find((item) => item?.result === "SUCCESS");
      if (success) {
        return {
          hash,
          consensusTimestamp: success.consensus_timestamp ?? null,
          result: success.result,
          hashScan: hashScanTransaction(hash),
        };
      }
      if (transactions.length > 0) {
        throw new Error(`Mirror reports a non-success result for ${hash}.`);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Mirror did not confirm ${hash}: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}

export async function confirmMirrorSchedule({
  mirrorOrigin,
  scheduleAddress,
  fetchImpl = fetch,
}) {
  const scheduleId = solidityAddressToEntityId(scheduleAddress);
  const origin = new URL(mirrorOrigin).origin;
  const payload = await fetchAllowedJson(
    new URL(`/api/v1/schedules/${scheduleId}`, origin),
    origin,
    fetchImpl,
  );
  if (payload?.schedule_id !== scheduleId) {
    throw new Error(`Mirror did not confirm schedule ${scheduleId}.`);
  }
  return {
    address: scheduleAddress,
    scheduleId,
    confirmed: true,
    executedTimestamp: payload.executed_timestamp ?? null,
    deleted: Boolean(payload.deleted),
    hashScan: hashScanSchedule(scheduleId),
  };
}

export class EvidenceJournal {
  #transactions = new Map();

  add(kind, transaction) {
    if (!HASH_RE.test(transaction?.hash ?? "")) {
      throw new Error(`Invalid transaction hash for ${kind}.`);
    }
    const existing = this.#transactions.get(transaction.hash.toLowerCase());
    const next = { kind, ...transaction };
    if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
      throw new Error(`Conflicting evidence for ${transaction.hash}.`);
    }
    this.#transactions.set(transaction.hash.toLowerCase(), next);
    return next;
  }

  values() {
    return [...this.#transactions.values()];
  }
}

export async function createTemporaryActor({
  sdk,
  client,
  label,
  initialHbar,
}) {
  const privateKey = sdk.PrivateKey.generateECDSA();
  try {
    const response = await new sdk.AccountCreateTransaction()
      .setECDSAKeyWithAlias(privateKey)
      .setInitialBalance(new sdk.Hbar(initialHbar))
      .execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId?.toString();
    if (!ACCOUNT_ID_RE.test(accountId ?? "")) {
      throw new Error("Account creation returned no account ID.");
    }
    return {
      label,
      accountId,
      evmAddress: `0x${privateKey.publicKey.toEvmAddress()}`,
      privateKey,
      privateKeyHex: `0x${privateKey.toStringRaw()}`,
    };
  } catch (error) {
    throw new Error(
      `Could not create temporary ${label} account: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function sweepTemporaryActor({
  sdk,
  client,
  actor,
  destinationId,
}) {
  try {
    const frozen = await new sdk.AccountDeleteTransaction()
      .setAccountId(sdk.AccountId.fromString(actor.accountId))
      .setTransferAccountId(sdk.AccountId.fromString(destinationId))
      .freezeWith(client);
    const signed = await frozen.sign(actor.privateKey);
    await (await signed.execute(client)).getReceipt(client);
    return { accountId: actor.accountId, swept: true };
  } catch (error) {
    return {
      accountId: actor.accountId,
      swept: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function visitEvidence(value, path = "record") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.test(key)) {
      throw new Error(`Evidence contains forbidden field ${path}.${key}.`);
    }
    visitEvidence(child, `${path}.${key}`);
  }
}

export function validateRailPolicyEvidence(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Evidence is missing the deployed rail policy.");
  }
  if (
    POLICY_FIELDS.some(
      (field) => !Number.isSafeInteger(policy[field]) || policy[field] < 0,
    )
  ) {
    throw new Error("Evidence rail policy contains a non-integer value.");
  }
  if (
    policy.maximumAdvanceBps === 0 ||
    policy.maximumAdvanceBps > 7_000 ||
    policy.maximumAnnualRateBps > 10_000 ||
    policy.maximumQuoteMovementBps > 100 ||
    policy.minimumTermSeconds < 120 ||
    policy.maximumTermSeconds < policy.minimumTermSeconds ||
    policy.maximumTermSeconds > 365 * 24 * 60 * 60 ||
    policy.maximumOfferLifetimeSeconds === 0 ||
    policy.maximumOfferLifetimeSeconds > 24 * 60 * 60
  ) {
    throw new Error(
      "Evidence rail policy is outside the kernel safety envelope.",
    );
  }
  return policy;
}

export function validateEvidenceRecord(record) {
  visitEvidence(record);
  if (
    record?.schemaVersion !== 2 ||
    record?.network !== "hedera-testnet" ||
    record?.chainId !== TESTNET_CHAIN_ID ||
    record?.status !== "verified"
  ) {
    throw new Error("Evidence record is not a verified Hedera testnet record.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.recipeId ?? "")) {
    throw new Error("Evidence is missing a valid recipe ID.");
  }
  validateRailPolicyEvidence(record.policy);
  for (const name of [
    "factory",
    "resolver",
    "pyth",
    "atsToken",
    "oracle",
    "rail",
    "acceptance",
  ]) {
    if (!ADDRESS_RE.test(record.addresses?.[name] ?? "")) {
      throw new Error(`Evidence is missing ${name}.`);
    }
  }
  for (const actor of ["issuer", "lender", "borrower"]) {
    if (
      !ACCOUNT_ID_RE.test(record.actors?.[actor]?.accountId ?? "") ||
      !ADDRESS_RE.test(record.actors?.[actor]?.evmAddress ?? "")
    ) {
      throw new Error(`Evidence is missing public ${actor} identity data.`);
    }
  }
  const lifecycle = Object.values(record.lifecycle ?? {});
  if (
    lifecycle.length < 10 ||
    lifecycle.some((hash) => !HASH_RE.test(hash ?? ""))
  ) {
    throw new Error("Evidence lifecycle is incomplete.");
  }
  if (!Array.isArray(record.transactions) || record.transactions.length < 10) {
    throw new Error("Evidence has too few verified transactions.");
  }
  for (const transaction of record.transactions) {
    if (
      !HASH_RE.test(transaction?.hash ?? "") ||
      transaction?.result !== "SUCCESS" ||
      typeof transaction?.consensusTimestamp !== "string" ||
      transaction?.hashScan !== hashScanTransaction(transaction.hash)
    ) {
      throw new Error("Evidence contains an unverified transaction.");
    }
  }
  const verifiedHashes = new Set(
    record.transactions.map((transaction) => transaction.hash.toLowerCase()),
  );
  if (lifecycle.some((hash) => !verifiedHashes.has(hash.toLowerCase()))) {
    throw new Error("Evidence lifecycle references an unverified transaction.");
  }
  if (!Array.isArray(record.positions) || record.positions.length !== 2) {
    throw new Error("Evidence must contain exactly two positions.");
  }
  const states = new Set(record.positions.map((position) => position.state));
  if (!states.has("REPAID") || !states.has("DEFAULTED")) {
    throw new Error(
      "Evidence must contain repaid and defaulted terminal states.",
    );
  }
  const holdIds = new Set(
    record.positions.map((position) => String(position.holdId)),
  );
  if (holdIds.size !== 2 || holdIds.has("0")) {
    throw new Error("Evidence must contain two distinct ATS holds.");
  }
  for (const position of record.positions) {
    if (
      !HASH_RE.test(position?.id ?? "") ||
      !ADDRESS_RE.test(position?.lender ?? "") ||
      !ADDRESS_RE.test(position?.borrower ?? "") ||
      !ADDRESS_RE.test(position?.scheduleAddress ?? "") ||
      !/^\d+$/.test(position?.collateralAmount ?? "") ||
      !/^\d+$/.test(position?.principalTinybar ?? "") ||
      !/^\d+$/.test(position?.repaymentTinybar ?? "") ||
      !Number.isSafeInteger(position?.openedAt) ||
      !Number.isSafeInteger(position?.maturity) ||
      position.maturity <= position.openedAt
    ) {
      throw new Error("Evidence contains an incomplete position proof.");
    }
    if (
      (position.state === "REPAID" && position.terminalPath !== "repayment") ||
      (position.state === "DEFAULTED" &&
        !["hss", "permissionless-fallback"].includes(position.terminalPath))
    ) {
      throw new Error("Evidence position terminal path contradicts its state.");
    }
  }
  if (!record.schedules?.some((schedule) => schedule.confirmed === true)) {
    throw new Error("Evidence has no Mirror-confirmed HSS schedule.");
  }
  for (const schedule of record.schedules) {
    if (
      !ADDRESS_RE.test(schedule?.address ?? "") ||
      !ACCOUNT_ID_RE.test(schedule?.scheduleId ?? "") ||
      solidityAddressToEntityId(schedule.address) !== schedule.scheduleId ||
      schedule?.hashScan !== hashScanSchedule(schedule.scheduleId)
    ) {
      throw new Error("Evidence contains an invalid HSS schedule proof.");
    }
  }
  const scheduledPositions = new Set(
    record.positions.map((position) => position.scheduleAddress.toLowerCase()),
  );
  if (
    !record.schedules.some((schedule) =>
      scheduledPositions.has(schedule.address.toLowerCase()),
    )
  ) {
    throw new Error("Evidence schedule is not bound to either position.");
  }
  if (
    !record.pyth ||
    !Number.isSafeInteger(record.pyth.publishTime) ||
    record.pyth.publishTime <= 0 ||
    !/^\d+$/.test(record.pyth.priceUsdE8 ?? "") ||
    !/^\d+$/.test(record.pyth.confidenceUsdE8 ?? "") ||
    !record.verification?.complete
  ) {
    throw new Error("Evidence is missing Pyth or final verification data.");
  }
  if (record.verification.mirrorOrigin !== DEFAULT_MIRROR_URL) {
    throw new Error(
      "Evidence verification did not use the public testnet Mirror Node.",
    );
  }
  for (const name of ["atsToken", "oracle", "rail", "acceptance"]) {
    if (
      record.verification.contractLinks?.[name] !==
      hashScanContract(record.addresses[name])
    ) {
      throw new Error(`Evidence has an invalid ${name} proof link.`);
    }
  }
  for (const field of [
    "cashLiabilitiesTinybar",
    "reservedAutomationTinybar",
    "requiredBackingTinybar",
    "contractBalanceTinybar",
  ]) {
    if (!/^\d+$/.test(record.accounting?.[field] ?? "")) {
      throw new Error(`Evidence accounting is missing ${field}.`);
    }
  }
  if (
    BigInt(record.accounting.contractBalanceTinybar) <
    BigInt(record.accounting.requiredBackingTinybar)
  ) {
    throw new Error("Evidence records an insolvent rail balance.");
  }
  return record;
}
