# RFC: CLPR collateral mobility

Status: research only

## Objective

Allow ATS collateral to remain held on Hedera while a separately governed cash
leg settles on another participating ledger. This RFC defines the safety bar for
an experiment. It does not authorize a production integration.

## Required proof model

The Hedera rail may recognize remote settlement only through a
protocol-defined, independently verifiable state proof. A relayer may transport
proof bytes but cannot decide their validity or independently release
collateral.

Every remote obligation requires a unique domain, source ledger, destination
ledger, remote transaction identifier, local position identifier, amount,
asset, beneficiary, expiry, and monotonic replay nonce.

## State transitions

1. Lock ATS collateral and create a local pending obligation.
2. Commit the exact remote settlement intent.
3. Verify remote finality and bind the proof to the pending obligation.
4. Activate the local financed position only once.
5. At maturity, accept either a verified remote repayment proof or the local
   default path.
6. Expire an unfulfilled remote intent through a public local recovery action.

## Failure requirements

- Duplicate, reordered, expired, or wrong-domain proofs fail closed.
- Remote success without local activation remains retryable from the same proof.
- Local activation cannot be replayed against another position.
- A remote outage cannot trap ATS collateral indefinitely.
- A relayer outage cannot block any public timeout or default action.
- A ledger reorganization inside the remote finality window cannot activate the
  local position.
- Proof verifier upgrades require a new rail version or an explicit delayed
  governance boundary. They cannot silently reinterpret existing positions.

## Prototype exit criteria

Do not implement the production path until a stable public proof specification,
test environment, verifier interface, finality definition, and recovery model
exist. The prototype must include adversarial replay, invalid-finality, timeout,
relayer-censorship, and asymmetric-failure tests before any public demo claim.
