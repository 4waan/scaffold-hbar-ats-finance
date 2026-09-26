# Security policy

Collateral Rail is unaudited testnet software. Do not use it to custody valuable
assets or operate a production credit facility without an independent audit,
deployment review, operational controls, and legal review.

## Reporting

Report a suspected vulnerability privately through GitHub Security Advisories.
Do not open a public issue containing an exploit, signer material, funded account
credentials, or an unpatched vulnerability.

Include the affected commit, impact, reproduction steps, and any known limits.
Maintainers will acknowledge a complete report within five business days and
will publish a remediation timeline after reproducing it.

## Supported versions

Only the latest tagged major version receives security fixes. Evidence records
remain readable for one major version after a schema change, but old contracts
are not upgradeable and are never silently redirected.

## Key and network boundary

- Issuer and operator actions remain in Foundry or the Harness runner.
- Raw keys must never enter frontend variables, URLs, command arguments, logs,
  evidence records, fixtures, or committed files.
- The browser accepts only public testnet addresses and approved public origins.
- Reference mode requires no wallet or account.
- A failed or unconfirmed wallet transaction must not advance application state.
