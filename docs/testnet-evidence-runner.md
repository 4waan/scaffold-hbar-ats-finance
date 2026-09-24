# Testnet evidence runner

`yarn demo:testnet` is the single command used by the Harness Tier 3.5 recipe. It is intentionally testnet-only and completes a real multi-actor lifecycle before it writes a candidate record.

## Harness inputs

Harness creates an ephemeral ECDSA account and supplies these process environment values:

- `HARNESS_SIGNER_ACCOUNT_ID`: Hedera account ID for the ephemeral issuer and deployer.
- `HARNESS_SIGNER_EVM_ADDRESS`: public EVM alias for that account.
- `HARNESS_SIGNER_PRIVATE_KEY`: raw ECDSA key used only in process memory.

The private key is never placed in a command argument, log message, deployment record, frontend variable, or repository file. The Foundry script reads it from the environment and starts the broadcast in process.

The Tier 3.5 recipe itself requires these host values so Harness can fund and later sweep its signer:

- `HEDERA_OPERATOR_ID`: funded Hedera testnet ECDSA account ID.
- `HEDERA_OPERATOR_KEY`: matching ECDSA private key.

Do not place either value in a project environment file. Export them only in the shell that starts Harness.

## Public configuration

The runner supports these public settings:

- `HEDERA_NETWORK`, which must equal `testnet` when present.
- `HEDERA_TESTNET_RPC_URL`, fixed by policy to `https://testnet.hashio.io/api`.
- `HEDERA_MIRROR_URL`, fixed by policy to `https://testnet.mirrornode.hedera.com`.
- `PYTH_HERMES_URL`, fixed by policy to `https://hermes.pyth.network`.
- `ATS_FACTORY_ADDRESS`, defaulting to the pinned testnet Factory.
- `ATS_RESOLVER_ADDRESS`, defaulting to the pinned testnet Resolver.
- `PYTH_ADDRESS`, defaulting to the pinned Hedera Pyth contract.

The fixed origin checks prevent a configured URL from turning the runner into an internal or credential-bearing request proxy. Address overrides remain public and are validated as EVM addresses.

## Lifecycle

The command performs these operations:

1. Confirms the Harness signer balance is no greater than 250 HBAR.
2. Creates temporary ECDSA lender and borrower accounts with 25 HBAR each.
3. Deploys an ATS bond with Clearing disabled, configures SSI and internal KYC, and issues collateral.
4. Deploys the Pyth adapter, financing rail, and acceptance verifier, then reserves HBAR for two HSS schedules.
5. Fetches and submits a fresh HBAR/USD update from Hermes.
6. Funds and accepts two small facilities with a two-minute term.
7. Reads both ATS holds back and verifies their amount, escrow, destination, and holder.
8. Withdraws the borrower's cash credit, repays one position, releases its hold, and withdraws the lender's credit.
9. Waits for the other position to mature. It records HSS execution when already defaulted, or invokes public `settle` and labels the permissionless fallback.
10. Reads final ATS roles, KYC, maturity, free balances, held balances, rail liabilities, automation reserves, backing, and both terminal position states.
11. Confirms transaction results and real schedule entities through Mirror Node.
12. Deletes the temporary accounts and transfers their remaining HBAR to the Harness signer on a best-effort basis.

Pyth is used only for the HBAR cash conversion. The collateral limit remains a configured advance against ATS nominal value.

## Local encrypted-keystore path

`yarn bootstrap:testnet` remains available to developers who prefer an encrypted Foundry account. It uses `HEDERA_OPERATOR_ADDRESS`, `LENDER_ADDRESS`, and `BORROWER_ADDRESS`. With no keystore environment values it selects the named `hedera-operator` account and allows Foundry to prompt. For unattended use, set both `HEDERA_KEYSTORE_PATH` and `HEDERA_KEYSTORE_PASSWORD_FILE`. The keystore path never crosses into the frontend.

This local bootstrap produces initial deployment evidence only. The Harness command is the path that proves both terminal facilities and temporary-account cleanup.

## Evidence publication

The runner writes `packages/foundry/deployments/testnet.json` with mode `0600`. The file is ignored by git. It contains public identifiers and verification results only.

`yarn publish:testnet` refuses to copy the candidate unless:

- every required address and actor identity is public and valid;
- every lifecycle checkpoint has a successful Mirror-confirmed transaction;
- there are exactly two distinct positions and holds;
- the terminal states include one repaid and one defaulted facility;
- at least one HSS schedule is Mirror-confirmed;
- the Pyth publication data and final state reads are complete;
- gitleaks passes over the deployment candidate directory.

Only then is `reference-testnet.json` replaced. Run the repository history and staged secret scans again before a public push.
