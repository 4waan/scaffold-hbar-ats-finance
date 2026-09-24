# Collateral Rail

Collateral Rail is a Scaffold-HBAR template for bilateral HBAR financing against
an Asset Tokenization Studio bond. It turns a difficult integration surface into
a focused, reusable path with explicit checks at every boundary.

The rail does four load-bearing jobs:

1. Pyth converts a USD cash term into an exact tinybar amount.
2. ATS internal KYC gates both counterparties and an ATS partition hold locks the bond.
3. HSS attempts maturity settlement at capacity-aware seconds.
4. A public `settle` function preserves recovery if HSS is unavailable.

Pyth is not used to price the ATS security. The collateral limit is a configured
70% advance against ATS nominal value. That is an underwriting policy, not a
claim about a secondary market price.

## Quick start

Requirements: Node 22, Yarn 3.2.3, Foundry, and Git.

```sh
corepack enable
yarn install
yarn test
yarn next:build
yarn dev
```

Open `http://localhost:3000`. No key or environment file is required. The app
starts in reference mode, where the architecture, full interaction surface, and
evidence checklist remain inspectable without enabling writes.

Routes:

- `/` explains the architecture, integration health, setup, and reference status.
- `/facility` exposes quote, Pyth update, fund, approve, accept, cancel, repay,
  withdraw, and permissionless settlement actions.
- `/verify` pairs rail state with free and held ATS balances, then checks a
  transaction against Mirror Node.

## Create from Scaffold-HBAR

Once the repository is public:

```sh
npm create scaffold-hbar@latest collateral-rail-app -- \
  --template 4waan/scaffold-hbar-ats-finance \
  --yes \
  --skip-hedera-skills
```

The template manifest permits exactly Next.js, Foundry, and Yarn. It also prints
the account, faucet, bootstrap, verification, and frontend commands at the end
of scaffolding.

## Architecture

```text
lender HBAR  -> funded offer -> borrower pull-payment credit
                                    |
borrower ATS -> allowance -> partition hold
                                    |
                  +-----------------+-----------------+
                  |                                   |
              repayment                           maturity
                  |                                   |
            release to borrower        HSS call or public settle
                                                      |
                                             execute to lender
```

One rail deployment is immutable to one ATS token and one partition. Every
accepted offer creates one position and exactly one hold. A position may end as
`REPAID` or `DEFAULTED`, and it never reopens.

See [architecture.md](docs/architecture.md) for the complete trust and state model.

## Contract policy

- Maximum advance: 70% of configured nominal value.
- Minimum term: 2 minutes.
- Maximum term: 365 days and never past the ATS bond maturity.
- Maximum annual rate: 100%.
- Maximum offer lifetime: 24 hours.
- Maximum acceptance quote movement: 1%.
- Pyth maximum age: 120 seconds.
- Pyth maximum confidence interval: 2% of price.
- HSS attempts: maturity plus 2, 5, and 10 seconds.
- HSS reserve: 5 HBAR per pending schedule.
- Native values: always named and accounted as tinybar.

All user cash moves through credits and `withdraw`. The owner may recover only
the balance above user liabilities and pending HSS reserves.

## Live testnet bootstrap

Privileged ATS setup stays in Foundry. There is no issuer-key web route.

Create an encrypted Foundry keystore:

```sh
cast wallet import hedera-operator --interactive
cp packages/foundry/.env.example packages/foundry/.env
```

Set the public EVM addresses in `packages/foundry/.env`, load it into your shell,
then run:

```sh
yarn bootstrap:testnet
yarn verify:deployment
```

The bootstrap validates the published ATS Resolver and Factory, Pyth, and the
HSS capacity read. It deploys a checksum-valid test bond with Clearing disabled,
adds the operator as an SSI issuer, grants internal KYC in the required order,
issues borrower collateral, deploys the oracle and rail, and funds the HSS reserve.

Generated deployment records contain public addresses and transaction hashes.
They never contain calldata, keys, mnemonics, or environment values.

## Reference evidence

[`reference-testnet.json`](packages/foundry/deployments/reference-testnet.json)
is the public evidence ledger. Its default status is
`awaiting-verified-publication`. This is intentional. An empty receipt list is
not presented as testnet proof. The record may move to `verified` only after the
Mirror verifier confirms every lifecycle checkpoint.

The required checkpoints are bond deployment, SSI and KYC configuration,
issuance, a fresh Pyth update, a funded offer, hold creation, a real HSS schedule,
one repayment, one matured default, and live role and immutable reads.

## Tests and gates

```sh
yarn format:check
yarn lint
yarn typecheck
yarn foundry:build
yarn foundry:test
yarn foundry:fuzz
yarn foundry:invariant
yarn next:build
yarn test:e2e
yarn check:routes
yarn check:secrets
```

The Foundry suite covers arithmetic, Pyth validation, KYC, allowance, quote
movement, hold inspection, repayment, default, HSS response codes, capacity
fallback, timestamp guards, reentrancy, and cash-reserve solvency. The invariant
handler mixes live state transitions and checks that liabilities stay backed and
that hold terminal actions never exceed created holds.

CI also runs the exact external-template generation command in a clean directory
and repeats install, tests, build, and boot against the generated output.

## Research and maintenance

- [Hedera Integration Field Guide](docs/hedera-integration-field-guide.md)
- [ATS call surface](docs/ats-call-surface.md)
- [Architecture decisions](docs/adr/)
- [Maintainer guide](docs/maintainer-guide.md)
- [Decision template](docs/templates/decision-record.md)
- [Measured finding template](docs/templates/measured-finding.md)

The field guide distinguishes source-read, measured, and derived claims. Each
retained finding names the guard and regression test that makes it useful to a
new project.

## Scope

Version 1 has one native HBAR cash leg, one ATS asset per rail, and ATS internal
KYC. HCS, HTS cash, coupons, margin calls, auctions, privacy, pooled lending, and
secondary-market valuation are extension points, not hidden partial features.

## License

The original implementation is MIT licensed. Reduced ATS ABI declarations and
the official Hiero contract helper retain their Apache License 2.0 notices. See
[NOTICE](NOTICE).
