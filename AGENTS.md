# Agent rules

## Product boundary

Collateral Rail is a bilateral HBAR financing scaffold. It is not an exchange,
an order book, a pooled lender, or a valuation engine. Pyth converts the USD cash
terms to HBAR. It does not price the ATS security.

## Evidence discipline

- Never infer Hedera behavior solely from Ethereum conventions.
- Label protocol claims as source-read, measured, derived, or assumed.
- Verify deployed state with Mirror Node and contract reads. A simulated address
  is never deployment evidence.
- HashScan verification proves runtime code. It does not prove live roles,
  constructor inputs, or current KYC state.
- Treat HTTP 200 responses and partial Mirror Node pages as transport outcomes,
  not proof that the requested entity or complete result set exists.

## Contract invariants

- Preserve `address(this).balance >= cashLiabilities + reservedAutomation`.
- One accepted offer creates one position and one ATS hold.
- A hold reaches at most one terminal action.
- A terminal position never reopens.
- No default can execute before maturity.
- A scheduling failure must never trap collateral.
- A failed ATS call must revert the complete state transition.
- Keep a local reentrancy guard around all ATS calls.
- Never add a keeper as a correctness dependency. `settle` must stay public.

## Integration maintenance

- Update `docs/ats-call-surface.md` whenever an ATS interface method changes.
- Use the official `HederaScheduleService` helper and check response code 22 plus
  a nonzero schedule address.
- Never persist an address returned by a simulation as a real schedule address.
- Keep HSS funds separate from user cash liabilities.
- Name and convert Hedera native units explicitly as tinybar.

## Key safety

- Privileged issuer setup belongs in Foundry scripts and encrypted keystores.
- Never place operator, issuer, or treasury keys in Next.js server routes.
- Never place a secret in a `NEXT_PUBLIC_` variable.
- Never commit `.env`, deployment keys, mnemonics, keystores, or funded account
  credentials.

## Completion gate

Run formatting, lint, type checking, Foundry tests, invariant tests, the Next.js
production build, Playwright, route checks, and secret scanning. Then run the
fresh-scaffold job in a clean directory before declaring the template complete.
