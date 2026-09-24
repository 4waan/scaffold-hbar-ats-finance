# ADR 001: Bilateral finance rail

- Status: accepted
- Protecting test: `testFundAndAcceptCreatesOneValidatedHold`

## Decision

Model one lender, one named borrower, one funded offer, and one resulting
position. Do not include discovery, matching, bidding, or pooled liquidity.

## Alternatives considered

- Order-book marketplace with reusable listings.
- Pooled lending vault with fungible lender shares.
- Unfunded term sheet settled after borrower acceptance.

## Why

Pre-funding makes cash availability an on-chain fact. A bilateral state machine
keeps ATS hold policy, cash liabilities, and terminal actions auditable.

## Sacrifice

There is no price discovery, liquidity aggregation, lender diversification, or
partial fill in version 1.

## Validation

The acceptance test asserts that one funded offer becomes one position and one
hold, then removes the offer.
