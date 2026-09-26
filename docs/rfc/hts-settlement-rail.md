# RFC: HTS settlement rail

Status: design accepted, implementation starts after the version 1 HBAR release

## Versioning decision

Do not generalize `AtsCollateralRail` in place. Add a separate
`AtsCollateralRailHts` contract so the published HBAR custody and solvency model
does not change underneath existing developers.

Every HTS rail binds one ATS token, one partition, and one fungible HTS cash
token. Principal, repayment, credits, and liabilities use the cash token's
smallest unit. The contract makes no claim that one token equals one US dollar.

## Accounting model

The contract maintains two independent backing requirements:

```text
HTS cash-token balance >= cashTokenLiabilities
HBAR balance >= reservedAutomation
```

Funding and repayment pull cash tokens through an allowance. Withdrawals push
only the caller's recorded credit. Every transfer measures the rail balance
before and after the HTS call and rejects a non-exact delta.

Tokens with fixed, fractional, or royalty fees are rejected during one-time
initialization. Exact liability accounting is more important than broad token
compatibility.

## Initialization and compliance

Initialization is permissionless but can target only the immutable settlement
token. It associates the rail through the HTS system contract and accepts only
success or already-associated response codes. It then validates fungible type,
decimals, and an empty custom-fee schedule.

The rail does not hold KYC, freeze, pause, fee, supply, or admin keys. Readiness
views report association, KYC, freeze, pause, allowance, and balance so a caller
can fix configuration before submitting a transaction. A later compliance
change remains authoritative: an HTS transfer failure reverts the complete rail
transition.

## Lifecycle compatibility

Offer funding and repayment become nonpayable token transfers. ATS hold creation,
repayment release, matured execution, terminal idempotence, HSS scheduling, and
permissionless settlement preserve the HBAR rail semantics. HSS fees remain an
explicit HBAR reserve and cannot be paid from settlement-token liabilities.

The HTS rail receives its own ABI, deployment script, acceptance verifier,
recipe, frontend execution path, invariant suite, and public evidence record.
Its evidence never replaces the canonical HBAR record.

## Required tests

- first association and already-associated initialization;
- invalid token, NFT token, invalid decimals, and custom-fee rejection;
- missing KYC, frozen account, paused token, insufficient allowance, and
  insufficient balance;
- exact inbound and outbound balance deltas;
- transfer failure atomicity around offers, positions, credits, and ATS holds;
- token solvency and HBAR automation reserve invariants;
- repayment and default exclusivity;
- HSS failure with public settlement recovery.
