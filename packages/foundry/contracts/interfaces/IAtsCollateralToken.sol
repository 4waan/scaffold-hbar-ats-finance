// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Reduced ABI for the Asset Tokenization Studio calls used by the rail.
/// @dev Struct order and return order are ABI-sensitive. Keep this file aligned
/// with the pinned upstream ABI check described in docs/ats-call-surface.md.
interface IAtsCollateralToken {
    enum KycStatus {
        NOT_GRANTED,
        GRANTED
    }

    struct Hold {
        uint256 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bytes data;
    }

    struct HoldIdentifier {
        bytes32 partition;
        address tokenHolder;
        uint256 holdId;
    }

    function getKycStatusFor(address account) external view returns (KycStatus);

    function allowance(address owner, address spender) external view returns (uint256);

    function balanceOfByPartition(bytes32 partition, address account) external view returns (uint256);

    function getHeldAmountForByPartition(bytes32 partition, address account) external view returns (uint256);

    function createHoldFromByPartition(bytes32 partition, address from, Hold calldata hold, bytes calldata operatorData)
        external
        returns (bool success, uint256 holdId);

    function getHoldForByPartition(HoldIdentifier calldata id)
        external
        view
        returns (
            uint256 amount,
            uint256 expirationTimestamp,
            address escrow,
            address destination,
            bytes memory data,
            bytes memory operatorData,
            uint8 thirdPartyType
        );

    function releaseHoldByPartition(HoldIdentifier calldata id, uint256 amount) external returns (bool success);

    function executeHoldByPartition(HoldIdentifier calldata id, address to, uint256 amount)
        external
        returns (bool success, bytes32 executedPartition);

    function getMaturityDate() external view returns (uint256);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @notice Setup calls are deliberately isolated from the runtime rail surface.
interface IAtsIssuerSetup {
    function addIssuer(address issuer) external returns (bool success);

    function grantKyc(address account, string calldata vcId, uint256 validFrom, uint256 validTo, address issuer)
        external
        returns (bool success);

    function issue(address tokenHolder, uint256 value, bytes calldata data) external;

    function isIssuer(address issuer) external view returns (bool);

    function isInternalKycActivated() external view returns (bool);
}
