# Collateral Rail

Collateral Rail is a Scaffold-HBAR template for building HBAR financing against
Asset Tokenization Studio securities. It gives developers a secure financing
kernel and small, declarative recipes for changing the product policy.

Use it to start a term facility, maturity bridge, treasury advance, receivables
facility, or another bilateral secured-credit pattern. The recipe can change.
The difficult guarantees stay in one tested implementation:

- ATS-native collateral custody through partition holds;
- ATS internal KYC for both counterparties;
- exact HBAR cash accounting and pull-payment withdrawals;
- Pyth HBAR/USD conversion with freshness and confidence checks;
- HSS maturity scheduling with permissionless recovery;
- Mirror Node and HashScan evidence for every published lifecycle claim.

Pyth prices the HBAR cash leg only. Collateral coverage is a configured advance
against ATS nominal value. It is not a claim about a secondary-market price.

## Scaffold it

Requirements: Node 22, Corepack, Foundry, and Git.

```sh
npm create scaffold-hbar@latest collateral-rail-app -- \
  --template 4waan/scaffold-hbar-ats-finance \
  --yes \
  --skip-hedera-skills
cd collateral-rail-app
yarn dev
```

Open <http://localhost:3000>. No account, key, or environment file is required
for reference mode.

The repository itself can be started with:

```sh
corepack enable
yarn install --immutable
yarn dev
```

## Inspect the pattern in five minutes

1. Open `/` and choose a financing recipe.
2. Open `/facility?recipe=term-credit&mode=reference` and move through one step
   at a time.
3. Open `/verify?position=repaid`, then switch to the defaulted position.
4. Follow each available proof link to its exact HashScan transaction or HSS
   entity.
5. Notice that free ATS balance, held ATS balance, Pyth quote, cash liabilities,
   and HSS reserves are never collapsed into one status.

The committed reference record stays visibly pending until a complete testnet
lifecycle has passed the publication gate. The interface never invents proof.

## Choose a recipe

List and validate the bundled recipes:

```sh
yarn recipe:list
yarn recipe:check
```

The template ships three:

- **Term Credit** is the verified default. It demonstrates funding, a native
  hold, repayment, default, and both recovery paths.
- **Maturity Bridge** uses a tighter advance, shorter term, smaller quote
  movement, and shorter offer window.
- **Custom Facility** exposes the full safe policy envelope as a starting point
  for a product-specific recipe.

Every recipe uses the same ATS, Pyth, HSS, HBAR, and evidence kernel. A recipe
changes allowed economics and starting terms. It cannot weaken the kernel safety
ceilings.

## Build your own recipe

Recipe files live in `packages/shared/recipes`. Start from the closest bundled
definition, give it a unique lowercase ID, and choose stricter values within the
kernel envelope.

```sh
yarn recipe:check
yarn foundry:test
yarn test:e2e
```

Read [Build a Financing Recipe](docs/build-a-financing-recipe.md) for the schema,
safe envelope, extension test requirements, and the line between configuration
and new contract behavior.

Use a contract extension, not another recipe, when you need staged drawdowns,
partial collateral releases, pooled liquidity, auctions, margin calls, several
cash assets, or more than one ATS security per position.

## Deploy a recipe to Hedera testnet

Privileged ATS setup stays in Foundry. The web application has no issuer-key
route and no secret-bearing server action.

1. Create and fund a Hedera testnet ECDSA account through the
   [Hedera Portal](https://portal.hedera.com/).
2. Import it into an encrypted Foundry keystore.
3. Copy the private local configuration file and fill only the documented
   values.
4. Deploy a selected recipe and verify the public result.

```sh
cast wallet import hedera-operator --interactive
cp packages/foundry/.env.example packages/foundry/.env
yarn bootstrap:testnet --recipe term-credit
yarn verify:deployment
```

The local bootstrap requires these public values:

- `HEDERA_OPERATOR_ADDRESS`;
- `LENDER_ADDRESS`;
- `BORROWER_ADDRESS`;
- the pinned or explicitly configured ATS Factory, Resolver, Pyth, RPC, Mirror,
  and Hermes endpoints.

With no keystore path, Foundry uses the named `hedera-operator` account and
prompts interactively. For unattended local use, set both
`HEDERA_KEYSTORE_PATH` and `HEDERA_KEYSTORE_PASSWORD_FILE`. Never place a raw
private key in this file or in a command argument.

The bootstrap deploys a checksum-valid ATS bond with Clearing disabled,
registers the SSI issuer, grants KYC in the required order, issues borrower
collateral, deploys the Pyth adapter and recipe-configured rail, funds HSS, and
writes public addresses and transaction hashes only.

## Understand the secure kernel

One rail deployment is immutable to one ATS token and one partition. The
facility state machine is deliberately small:

```text
funded offer
  | cancel
  +----------> lender withdrawal credit
  |
  | accept after policy checks and hold inspection
  v
OPEN
  | repay                              | settle at or after maturity
  v                                    v
REPAID                              DEFAULTED
  |                                    |
hold released to borrower           hold executed to lender
```

Every accepted offer creates one position and one hold. A terminal position
never reopens. HSS improves timing, but any account can call `settle` after
maturity. No keeper is a correctness dependency.

The central cash invariant is:

```text
contract HBAR balance >= cashLiabilities + reservedAutomation
```

Read [Architecture](docs/architecture.md) for custody, accounting, automation,
external calls, and trust boundaries. Read the
[Hedera Integration Field Guide](docs/hedera-integration-field-guide.md) for the
ATS, HSS, Mirror, Pyth, and Hedera EVM failure modes encoded as guards and tests.

## Safe policy envelope

A deployed recipe can be stricter, but it cannot exceed:

- 70% maximum advance against configured nominal value;
- 100% maximum annual rate;
- 1% maximum quote movement between funding and acceptance;
- 24-hour maximum offer lifetime;
- terms from two minutes to 365 days;
- the ATS security maturity.

Pyth data must be positive, no older than 120 seconds, and have a confidence
interval no wider than 2%. HSS capacity is attempted at maturity plus 2, 5, and
10 seconds.

The complete immutable policy is exposed by `policy()` and included in every
verified evidence record.

## Repository map

```text
packages/foundry   contracts, reduced ATS interfaces, scripts, and tests
packages/nextjs    recipe workbench and proof ledger
packages/shared    recipes, chain constants, canonical ABIs, evidence types
docs               field guide, ADRs, extension guide, maintainer material
.harness           optional Harness specifications and deterministic validators
```

The three application routes are intentionally narrow:

- `/` explains the promise, lets a developer choose a recipe, and leads to
  public proof.
- `/facility` provides reference replay and wallet execution through one active
  lifecycle step.
- `/verify` reconstructs one position as chronological claims with exact
  sources and proof links.

## Test and release gates

```sh
yarn format:check
yarn lint
yarn typecheck
yarn recipe:check
yarn foundry:build
yarn foundry:test
yarn foundry:fuzz
yarn foundry:invariant
yarn test:runner
yarn next:build
yarn test:e2e
yarn check:routes
yarn check:secrets
yarn check:ats-abi
```

The contract suite covers policy bounds, conversion and rounding, Pyth failure
modes, KYC, allowance, quote movement, hold inspection, HSS response codes,
timestamp boundaries, repayment, default, reentrancy, and reserve solvency. The
runner suite covers endpoint restrictions, funding caps, actor failures, Mirror
pagination, retry safety, evidence completeness, and sweep-back failure.

CI also scaffolds the public repository into a clean directory and repeats the
install, test, build, boot, and route checks against the generated project.

## Verified reference evidence

`packages/foundry/deployments/reference-testnet.json` is the public evidence
ledger. Publication requires the `term-credit` recipe, its complete deployed
policy, two distinct ATS holds, one repaid position, one matured default, a real
Mirror-confirmed HSS schedule, fresh Pyth data, live ATS roles and KYC, separate
free and held balances, successful Mirror receipts, and solvent final
accounting.

The direct lifecycle runner is:

```sh
yarn demo:testnet --recipe term-credit
yarn publish:testnet
```

It requires the documented ephemeral signer values and should be run only with
a capped, funded Hedera testnet account. It creates temporary lender and borrower
accounts and attempts best-effort sweep-back. See
[Testnet Evidence Runner](docs/testnet-evidence-runner.md).

Hedera Harness is optional. Maintainers who use it should follow the committed
specifications in `.harness/` and the [Maintainer Guide](docs/maintainer-guide.md).
Claude Code is not required to build, test, deploy, or publish the template.

## Advanced references

- [ATS call surface](docs/ats-call-surface.md)
- [Architecture decisions](docs/adr/)
- [Maintainer guide](docs/maintainer-guide.md)
- [Decision record template](docs/templates/decision-record.md)
- [Measured finding template](docs/templates/measured-finding.md)

Version 1 uses one HBAR cash leg, one ATS asset per rail, and ATS internal KYC.
HCS, HTS cash, coupons, margin calls, auctions, privacy, pooled lending, and
secondary markets are documented extension opportunities, not partial features.

## License

The original implementation is MIT licensed. Reduced ATS ABI declarations and
the official Hiero contract helper retain their Apache License 2.0 notices. See
[NOTICE](NOTICE).
