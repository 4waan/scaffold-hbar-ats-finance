# Build a financing recipe

A recipe is a small, declarative financing policy layered over the Collateral
Rail kernel. It changes what a facility permits without copying the ATS hold,
cash accounting, Pyth validation, HSS scheduling, or evidence code.

Run `yarn recipe:list` to see the bundled recipes and `yarn recipe:check` after
editing one.

## Recipe boundary

A recipe defines:

- its developer-facing purpose;
- an immutable rail policy inside the hard safety envelope;
- illustrative starting terms for the workbench;
- which term fields are editable; and
- notes explaining safe extension points.

The kernel still requires ATS collateral, internal KYC, HBAR cash, a valid Pyth
quote, one terminal hold action, and a permissionless recovery path.

## Add a recipe

1. Copy one JSON file in `packages/shared/recipes`.
2. Give it a unique lowercase `id`.
3. Tighten or retain the kernel policy limits.
4. Choose illustrative default terms within that policy.
5. Add it to the typed export in `packages/shared/src/recipes.ts`.
6. Run `yarn recipe:check`, the Foundry suite, and the browser tests.

Do not present illustrative defaults as underwriting advice. A downstream team
is responsible for its collateral analysis, legal structure, disclosures, and
commercial terms.

## Safe policy envelope

Recipes can be stricter than the kernel. They cannot exceed:

- 70% maximum advance;
- 100% maximum annual rate;
- 1% maximum quote movement;
- a minimum term of two minutes;
- a maximum term of 365 days; or
- a maximum offer lifetime of 24 hours.

The facility must also mature before the ATS security. These bounds are checked
both in the recipe validator and in the deployed contract.

## When a recipe is not enough

Create new contract behavior when the product needs staged drawdowns, partial
collateral releases, pooled liquidity, auctions, margin calls, multiple cash
assets, or several ATS securities in one position. Do not imply those behaviors
by adding labels to the existing state machine.

New contract behavior requires an ADR, updated ATS call-surface documentation,
unit and invariant tests, and a fresh verified testnet lifecycle.

## Possible downstream products

The existing bilateral state machine can support different commercial framing,
including term credit, short treasury liquidity, maturity bridges, receivables
advances, or repo-style arrangements. Those names do not change the legal or
economic substance automatically. Developers must document their own product
and jurisdictional assumptions.
