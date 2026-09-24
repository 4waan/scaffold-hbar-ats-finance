# ADR 002: ATS Holds for collateral

- Status: accepted
- Protecting test: `testPostCreationValidationRevertsAtomically`

## Decision

Encumber collateral through an ATS partition hold. Deploy the security with
Clearing disabled and never wrap or transfer collateral into a custom vault.

## Alternatives considered

- ATS Clearing.
- Transfer collateral to an escrow wallet or contract.
- Wrap the security into an ERC token.

## Why

Holds preserve ATS-native ownership semantics while granting the rail a precise
release or execution right. Reading the hold back gives the rail a testable
post-condition.

## Sacrifice

The template cannot compose Holds and Clearing on one token. A new settlement
rail requires a different deployment pattern.

## Validation

A corrupt returned hold causes acceptance and the ATS mutation to revert as one
transaction.
