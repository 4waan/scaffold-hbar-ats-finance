# ADR 003: ATS internal KYC

- Status: accepted
- Protecting test: `testLocalPolicyRejectsMissingBorrowerKycBeforeHold`

## Decision

Use ATS internal KYC for the self-contained version 1 demo. Assign SSI and KYC
roles, register the credential issuer first, then grant lender and borrower KYC.

## Alternatives considered

- External KYC list contract.
- Identity Registry integration.
- Proof-based eligibility.

## Why

Internal KYC demonstrates the complete ATS lifecycle with the fewest independent
deployment dependencies and keeps the eligibility read on the security.

## Sacrifice

Eligibility is address-based and issuer-administered. Privacy and portable
credential verification remain extension points.

## Validation

The contract refuses acceptance before hold creation when either counterparty is
not granted. Bootstrap reads both states after setup.
