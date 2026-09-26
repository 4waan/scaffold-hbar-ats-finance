# Finding: Local release validation is deterministic

- Status: measured
- Network and date: local validation on 2026-09-26, Asia/Kolkata
- Host: arm64, macOS 26.5.1
- Component versions: Node.js 22.16.0, Yarn 3.2.3, Foundry 1.5.1,
  Solidity 0.8.24, Next.js 15.2.8, Playwright 1.61.1
- Enforcing test: `yarn release:validate`

## Falsifiable probe

Run the complete release command from the repository root. It must complete
every declared stage, report zero Harness findings, and leave the repository
snapshot unchanged. Any failed command, changed tracked file, or nonignored new
file disproves the finding.

## Evidence

- Full release validation wall time: 329.80 seconds
- Harness production build time: 13.696 seconds
- Harness development server readiness: 1.510 seconds
- Harness first route responses: `/` in 4.420 seconds, `/facility` in 1.071
  seconds, and `/verify` in 1.001 seconds
- Harness result: passed with zero findings and all three routes observed
- Release result: passed without changing the working tree snapshot
- Raw artifact location: terminal output was inspected in process and was not
  copied into the repository

Times are local observations, not performance guarantees. The route values are
individual first-response durations and must not be interpreted as percentiles.

## Pending measurements

- Cold public scaffold time: pending the submission commit on `main`
- Cold generated-project install time: pending the same clean scaffold run
- Funded Hedera testnet lifecycle time: pending a capped operator supplied at
  execution time

No speed claim is made for a pending measurement. The fresh-scaffold workflow
will provide the first two values. Evidence schema version 3 will record the
funded lifecycle duration and Mirror-confirmed transaction count for the third.

## Result

The complete local gate passed. It covered formatting, linting, type checking,
recipe validation, dead-code checks, contract compilation, unit tests, fuzz
tests, invariant tests, runner tests, development browser tests, live-mode
browser tests, the production build, production browser tests, route checks,
the reduced ATS interface, secret scanning, and Harness validation.

## Consequence

Use the release command as the only local readiness claim. Keep cold scaffold,
cold install, and funded lifecycle measurements pending until their exact
release conditions can be reproduced.

## Regression protection

`scripts/release-gate.mjs` defines the ordered gate and hashes the repository
before and after validation. `.github/workflows/fresh-scaffold.yml` repeats the
gate from a generated public template after merge to `main`.
