# Maintainer guide

## Before changing a Hedera integration

Write down whether the behavior is source-read, measured on testnet, derived
from those facts, or still assumed. Ethereum intuition is not evidence for
Hedera system contracts, timestamps, native value units, or Mirror responses.

If an ATS method is added, update `docs/ats-call-surface.md`, the reduced
interface, the pinned ABI list, and its regression test in the same change.

## Invariants that may not move

- HBAR balance covers cash liabilities and HSS reserves.
- One accepted offer creates one position and one hold.
- A hold has at most one terminal action.
- Terminal positions never reopen.
- Default cannot execute before maturity.
- Failed HSS scheduling leaves public settlement available.
- Failed ATS calls leave no partial rail state.
- Owner recovery never touches lender or borrower funds.

## Testnet evidence procedure

1. Use an encrypted Foundry keystore. Never export a raw key into a command.
2. Run the bootstrap and preserve its Foundry broadcast artifact outside Git.
3. Build the public record from addresses and transaction hashes only.
4. Confirm every transaction through Mirror Node.
5. Read ATS roles, KYC, maturity, free balance, and held balance live.
6. Read the rail token, partition, oracle, nominal value, liabilities, and reserve live.
7. Confirm the real schedule address from the mined receipt and then through Mirror Node.
8. Populate a lifecycle field only after the corresponding probe passes.

An `eth_call` result is never an entity receipt. HashScan code verification is
not a substitute for live constructor, role, KYC, or hold reads.

## Frontend safety

The web app has no state-changing server route. Wallets sign user actions in the
browser. Issuer setup stays in Foundry. Only public addresses and the public RPC
URL may use `NEXT_PUBLIC_` names.

Keep external requests pinned to the Hedera testnet RPC, Hedera testnet Mirror
Node, Pyth Hermes, and the configured wallet transport. Validate transaction IDs,
hashes, addresses, and response shapes before rendering links or evidence.

## Release checklist

Run all commands in the README. Then scaffold the public repository into a new
temporary directory and run the same install, test, build, Playwright, route,
and secret gates there. Finally inspect the generated README outro and reference
mode with no environment file present.
