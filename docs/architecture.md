# Architecture

## Boundary

`AtsCollateralRail` is a bilateral obligation manager. It is bound at deployment
to one ATS token, one partition, one Pyth adapter, the token decimal count, and a
configured nominal value. It does not discover assets, match orders, pool funds,
or calculate a security market price.

## State transitions

```text
funded offer
  | cancel
  +----------> lender credit
  |
  | accept after policy validation and hold inspection
  v
OPEN
  | repay before or after maturity       | settle at or after maturity
  v                                      v
REPAID                                DEFAULTED
  |                                      |
hold released to borrower             hold executed to lender
```

Terminal calls are idempotent. A second `settle` after default returns `false`.
A scheduled `settle` after repayment completes the automation record without
touching collateral.

## Cash accounting

The invariant is:

```text
contract HBAR balance >= cashLiabilities + reservedAutomation
```

`cashLiabilities` covers funded offers and credited withdrawals. Acceptance
changes the beneficiary of principal from an offer to borrower credit without
changing the liability total. Cancellation does the same for lender credit.
Repayment adds a new lender liability. Withdrawal reduces liability before the
external call, and a reentrancy lock protects the full path.

The HSS reserve is not lender principal. `withdrawUnusedAutomation` can reach
only balance above user liabilities and pending schedule reserves.

## Collateral accounting

The borrower grants the rail an ATS allowance. Acceptance checks:

1. borrower and lender internal KYC;
2. offer expiry and self-dealing;
3. configured collateral coverage;
4. fresh Pyth data and at most 1% movement from funding;
5. free partition balance and allowance;
6. asset maturity after facility maturity.

The rail then asks ATS to create an escrow hold with no destination and an
effectively open expiry. It reads the hold back and validates amount, escrow,
destination, data binding, and expiry before opening the position.

`balanceOfByPartition` is displayed as free balance. Held balance is read from
`getHeldAmountForByPartition` and shown independently.

## Automation

The rail inherits the official `HederaScheduleService` helper from
`@hiero-ledger/hiero-contracts@0.2.0`. After storing the obligation, it probes
maturity plus 2, 5, and 10 seconds. A schedule is accepted only when capacity is
available, the response code equals 22, and the returned address is nonzero.

All HSS errors are caught. The position stays open and recoverable with public
`settle` if every attempt fails. The public fallback is the correctness path;
HSS improves liveness.

## Trust model

- ATS enforces native balances, allowance, and hold mechanics.
- The rail enforces facility policy before asking ATS to hold.
- Pyth is trusted only for HBAR/USD conversion within freshness and confidence bounds.
- HSS may fail or be saturated without blocking acceptance or recovery.
- Mirror Node supplies historical evidence, but direct contract reads determine current state.
- The deployment operator controls ATS issuance and KYC setup, but cannot seize rail credits.

## External calls

All ATS state-changing calls are behind the local reentrancy lock. State changes
made before an ATS call revert atomically if that call fails. Native payouts use
a pull model, so a recipient that rejects HBAR cannot block another transition.
