// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AtsCollateralRail} from "../contracts/AtsCollateralRail.sol";

library RailTestPolicy {
    function defaults() internal pure returns (AtsCollateralRail.RailPolicy memory) {
        return AtsCollateralRail.RailPolicy({
            maximumAdvanceBps: 7_000,
            maximumAnnualRateBps: 10_000,
            maximumQuoteMovementBps: 100,
            minimumTermSeconds: 2 minutes,
            maximumTermSeconds: 365 days,
            maximumOfferLifetimeSeconds: 24 hours
        });
    }
}
