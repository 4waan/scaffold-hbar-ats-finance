# RFC: ATS external KYC reference adapter

Status: upstream interface confirmed, implementation gated behind version 1

## Interface boundary

ATS external KYC lists expose one read:

```solidity
import {IKyc} from ".../kyc/IKyc.sol";

interface IExternalKycList {
    function getKycStatus(address account) external view returns (IKyc.KycStatus);
}
```

The reference adapter will implement that exact read and will not place identity
documents or personal information onchain. The source interface and ATS linking
behavior are documented in the
[ATS external KYC guide](https://docs.tokenization-studio.hedera.com/ats/user-guides/managing-external-kyc-lists/).

## Proposed reference behavior

- One immutable administrator assigns and revokes compliance operators.
- Operators grant an address until an explicit expiry timestamp and may revoke
  it immediately.
- `getKycStatus` returns `NOT_GRANTED` for missing, revoked, expired, or paused
  entries and `GRANTED` only for a current authorization.
- Every grant and revocation emits the account, operator, and effective expiry.
- A paused adapter fails closed by returning `false` for every account.
- Administrator transfer uses a two-step accept flow.
- There is no enumeration requirement in the compliance read path.
- Offchain systems remain responsible for evidence, consent, retention, and
  re-verification. The contract stores only an address, status, and expiry.

## Integration boundary

Version 1 keeps ATS internal KYC enabled. The reference adapter will be deployed
and tested separately, then linked to a dedicated test security. Tests must prove
internal-only, external-only, and combined behavior without changing the HBAR
rail contract.

The integration must grant required internal KYC before linking an external list
that already returns `GRANTED`. Compatibility probes must exercise the actual
status read and ATS link behavior. Contract bytecode presence alone is not an
interface proof.

The adapter is an interoperability example, not a production identity provider.
It must receive a dedicated security review before any real compliance use.
