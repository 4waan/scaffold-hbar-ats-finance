// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AtsCollateralRail} from "../AtsCollateralRail.sol";
import {IAtsCollateralToken} from "../interfaces/IAtsCollateralToken.sol";

/// @notice Credential-free on-chain acceptance reads for a deployed rail.
contract RailAcceptance {
    AtsCollateralRail public immutable rail;
    IAtsCollateralToken public immutable token;

    struct Result {
        bool tokenBinding;
        bool partitionBinding;
        bool nominalConfigured;
        bool internalKycReady;
        bool counterpartiesEligible;
        bool assetMaturityLive;
        bool cashSolvent;
    }

    error AcceptanceFailed(Result result);

    constructor(AtsCollateralRail rail_) {
        rail = rail_;
        token = rail_.atsToken();
    }

    function check(address lender, address borrower) public view returns (Result memory result) {
        result.tokenBinding = address(rail.atsToken()) == address(token);
        result.partitionBinding = rail.partition() != bytes32(0);
        result.nominalConfigured = rail.nominalValueUsdE8() != 0;
        result.internalKycReady = IAtsIssuerSetupView(address(token)).isInternalKycActivated();
        result.counterpartiesEligible = token.getKycStatusFor(lender) == IAtsCollateralToken.KycStatus.GRANTED
            && token.getKycStatusFor(borrower) == IAtsCollateralToken.KycStatus.GRANTED;
        result.assetMaturityLive = token.getMaturityDate() > block.timestamp;
        result.cashSolvent = address(rail).balance >= rail.cashLiabilities() + rail.reservedAutomation();
    }

    function requireAccepted(address lender, address borrower) external view {
        Result memory result = check(lender, borrower);
        if (
            !result.tokenBinding || !result.partitionBinding || !result.nominalConfigured || !result.internalKycReady
                || !result.counterpartiesEligible || !result.assetMaturityLive || !result.cashSolvent
        ) revert AcceptanceFailed(result);
    }
}

interface IAtsIssuerSetupView {
    function isInternalKycActivated() external view returns (bool);
}
