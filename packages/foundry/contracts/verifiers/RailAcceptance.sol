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
        bool nominalBinding;
        bool tokenDecimalsBinding;
        bool usdCurrencyBinding;
        bool clearingDisabled;
        bool policyConfigured;
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
        uint8 nominalDecimals = token.getNominalValueDecimals();
        uint256 nominalValue = token.getNominalValue();
        uint256 normalizedNominal;
        if (nominalDecimals <= 8) {
            normalizedNominal = nominalValue * (10 ** (8 - nominalDecimals));
        } else {
            uint256 divisor = 10 ** (nominalDecimals - 8);
            if (nominalValue % divisor == 0) normalizedNominal = nominalValue / divisor;
        }
        result.nominalBinding = normalizedNominal != 0 && normalizedNominal == rail.nominalValueUsdE8();
        result.tokenDecimalsBinding = token.decimals() == rail.tokenDecimals();
        result.usdCurrencyBinding = token.getNominalValueCurrency() == bytes3("USD");
        result.clearingDisabled = !token.isClearingActivated();
        AtsCollateralRail.RailPolicy memory policy_ = rail.policy();
        result.policyConfigured = policy_.maximumAdvanceBps > 0 && policy_.maximumAdvanceBps <= rail.MAX_ADVANCE_BPS()
            && policy_.maximumAnnualRateBps <= rail.MAX_RATE_BPS()
            && policy_.maximumQuoteMovementBps <= rail.MAX_QUOTE_MOVEMENT_BPS()
            && policy_.minimumTermSeconds >= rail.MIN_TERM() && policy_.maximumTermSeconds >= policy_.minimumTermSeconds
            && policy_.maximumTermSeconds <= rail.MAX_TERM() && policy_.maximumOfferLifetimeSeconds > 0
            && policy_.maximumOfferLifetimeSeconds <= rail.MAX_OFFER_LIFETIME();
        result.internalKycReady = IAtsIssuerSetupView(address(token)).isInternalKycActivated();
        result.counterpartiesEligible = token.getKycStatusFor(lender) == IAtsCollateralToken.KycStatus.GRANTED
            && token.getKycStatusFor(borrower) == IAtsCollateralToken.KycStatus.GRANTED;
        result.assetMaturityLive = token.getMaturityDate() > block.timestamp;
        result.cashSolvent = address(rail).balance >= rail.cashLiabilities() + rail.reservedAutomation();
    }

    function requireAccepted(address lender, address borrower) external view {
        Result memory result = check(lender, borrower);
        if (
            !result.tokenBinding || !result.partitionBinding || !result.nominalBinding || !result.tokenDecimalsBinding
                || !result.usdCurrencyBinding || !result.clearingDisabled || !result.policyConfigured
                || !result.internalKycReady || !result.counterpartiesEligible || !result.assetMaturityLive
                || !result.cashSolvent
        ) revert AcceptanceFailed(result);
    }
}

interface IAtsIssuerSetupView {
    function isInternalKycActivated() external view returns (bool);
}
