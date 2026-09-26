# Contributing

Collateral Rail accepts focused changes that preserve its bilateral financing
boundary and make ATS integration easier to reproduce.

## Before opening a change

1. Read `AGENTS.md`, `docs/architecture.md`, and the relevant decision record.
2. Classify every Hedera claim as source-read, measured, derived, or assumed.
3. Add a decision record when a change affects custody, liabilities, scheduling,
   pricing, compliance, or evidence semantics.
4. Keep issuer credentials and funded account material outside the repository.

Recipes may make policy stricter within the existing safety envelope. New cash
assets, custody models, partial releases, pools, auctions, and external KYC
systems require a separately versioned contract extension.

## Required validation

Run `yarn release:validate` from a clean checkout. A pull request is not ready
while any release gate is red or while validation changes tracked files.

Changes to ATS calls must update the reduced interface, pinned ABI list, call
surface guide, and regression tests together. Changes to public evidence must
update its schema, validator, reference record, UI, and migration notes together.

## Pull requests

Keep each pull request reviewable and describe:

- the developer problem being removed;
- the invariant or trust boundary affected;
- the source or measurement supporting Hedera-specific behavior;
- the tests proving success and failure paths;
- any compatibility or migration impact.

Never update visual snapshots without inspecting every changed image.
