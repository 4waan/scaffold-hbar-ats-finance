# ATS call surface

This is the complete ATS ABI surface used by the template. Adding a method here
requires updating the reduced interface, ABI validator, field guide, and at least
one regression test.

Pinned compatibility target: Asset Tokenization Studio v8 testnet deployment.

- Resolver: `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a`
- Factory: `0xd1F118A40f3b02883D35909eF2517e7EDd78379d`
- Bond configuration: `bytes32(uint256(2))`, version `1`
- Upstream source: <https://github.com/hashgraph/asset-tokenization-studio>

## Runtime rail calls

| Method                        | Purpose                             | Guard                           |
| ----------------------------- | ----------------------------------- | ------------------------------- |
| `getKycStatusFor`             | Check both counterparties           | Must equal `GRANTED`            |
| `allowance`                   | Check delegated collateral capacity | Must cover the exact hold       |
| `balanceOfByPartition`        | Read free collateral                | Never labeled total position    |
| `getHeldAmountForByPartition` | Read encumbered collateral          | Displayed separately            |
| `createHoldFromByPartition`   | Lock borrower collateral            | Local policy runs first         |
| `getHoldForByPartition`       | Inspect the created hold            | Exact post-condition checks     |
| `releaseHoldByPartition`      | Return collateral on repayment      | One terminal action             |
| `executeHoldByPartition`      | Deliver overdue collateral          | Maturity and lender KYC         |
| `getMaturityDate`             | Bound facility term                 | Facility may not outlive asset  |
| `hasRole`                     | Live deployment verification        | Evidence only, not runtime auth |

## Bootstrap-only calls

| Method                   | Purpose                               | Required ordering                    |
| ------------------------ | ------------------------------------- | ------------------------------------ |
| `deployBond`             | Create the ATS bond                   | Clearing false, Holds available      |
| `addIssuer`              | Register the credential issuer        | Before any KYC grant                 |
| `grantKyc`               | Grant lender and borrower eligibility | Issuer must already be registered    |
| `issue`                  | Issue borrower collateral             | Borrower KYC must already be granted |
| `isIssuer`               | Verify SSI setup                      | Read after mined setup               |
| `isInternalKycActivated` | Verify eligibility mode               | Must be true                         |

## Hold ABI post-condition

The return order from `getHoldForByPartition` is ABI-sensitive:

```text
amount, expirationTimestamp, escrow, destination,
data, operatorData, thirdPartyType
```

The rail requires the exact collateral amount, itself as escrow, zero destination,
empty operator data, position-bound data, and expiry after facility maturity.

## Compatibility gate

`yarn workspace @collateral-rail/foundry check:ats-abi` compiles the reduced
interfaces and compares the required method signatures with the committed v8
surface. This catches accidental local drift. A maintainer upgrading ATS must
also compare the committed list with the tagged upstream artifact and record the
probe using `docs/templates/measured-finding.md`.
