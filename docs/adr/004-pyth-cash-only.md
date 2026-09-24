# ADR 004: Pyth prices only the HBAR cash leg

- Status: accepted
- Protecting test: `testPreviewUsesHaircutConversionAndConservativeInterest`

## Decision

Use the Pyth HBAR/USD feed to convert a USD principal into exact tinybar. Use a
configured ATS nominal value and 70% advance for collateral coverage.

## Alternatives considered

- Treat HBAR/USD as a bond price.
- Add an administrator-supplied security market price.
- Remove USD terms and quote only in HBAR.

## Why

Pyth supplies a load-bearing conversion feed for the actual cash asset. Keeping
collateral underwriting separate avoids implying that a liquid bond market or
RWA oracle exists.

## Sacrifice

There is no mark-to-market, margin call, or secondary valuation in version 1.

## Validation

The preview test checks the haircut and HBAR conversion separately. Oracle tests
enforce fee, sign, age, exponent, and confidence rules.
