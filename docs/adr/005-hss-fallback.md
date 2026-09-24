# ADR 005: HSS automation with public fallback

- Status: accepted
- Protecting test: `testBadHssResponseDoesNotTrapCollateral`

## Decision

Attempt HSS settlement at maturity plus 2, 5, and 10 seconds, while keeping
`settle` public, idempotent, and independent of a keeper.

## Alternatives considered

- Require a keeper service.
- Revert acceptance when HSS has no capacity.
- Omit automation and rely only on manual calls.

## Why

HSS provides native liveness without becoming the correctness dependency.
Response codes, capacity, boundary timing, and funding can fail safely.

## Sacrifice

Automation can be unavailable, and a user may need to submit `settle`. Five HBAR
per pending schedule is isolated from user cash.

## Validation

Non-success responses produce `UNAVAILABLE`, preserve the hold, and leave public
settlement callable.
