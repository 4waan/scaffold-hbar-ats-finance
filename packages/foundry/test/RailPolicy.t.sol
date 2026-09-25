// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {AtsCollateralRail} from "../contracts/AtsCollateralRail.sol";
import {MockAtsToken} from "./mocks/MockAtsToken.sol";
import {MockOracle} from "./mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "./mocks/AtsCollateralRailHarness.sol";
import {RailTestPolicy} from "./RailTestPolicy.sol";

contract RailPolicyTest is TestBase {
    MockAtsToken internal token;
    MockOracle internal oracle;

    function setUp() public {
        token = new MockAtsToken();
        oracle = new MockOracle(25_000_000);
    }

    function testRejectsZeroAdvance() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumAdvanceBps = 0;
        _expectInvalid(configured);
    }

    function testRejectsAdvanceAboveKernelMaximum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumAdvanceBps = 7_001;
        _expectInvalid(configured);
    }

    function testRejectsRateAboveKernelMaximum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumAnnualRateBps = 10_001;
        _expectInvalid(configured);
    }

    function testRejectsQuoteMovementAboveKernelMaximum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumQuoteMovementBps = 101;
        _expectInvalid(configured);
    }

    function testRejectsTermBelowKernelMinimum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.minimumTermSeconds = 119;
        _expectInvalid(configured);
    }

    function testRejectsInvertedTermRange() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.minimumTermSeconds = 10 days;
        configured.maximumTermSeconds = 9 days;
        _expectInvalid(configured);
    }

    function testRejectsTermAboveKernelMaximum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumTermSeconds = 365 days + 1;
        _expectInvalid(configured);
    }

    function testRejectsZeroOfferLifetime() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumOfferLifetimeSeconds = 0;
        _expectInvalid(configured);
    }

    function testRejectsOfferLifetimeAboveKernelMaximum() public {
        AtsCollateralRail.RailPolicy memory configured = RailTestPolicy.defaults();
        configured.maximumOfferLifetimeSeconds = 24 hours + 1;
        _expectInvalid(configured);
    }

    function testFuzzAcceptsEveryPolicyInsideKernelEnvelope(
        uint16 advanceSeed,
        uint16 rateSeed,
        uint16 movementSeed,
        uint32 minimumSeed,
        uint32 rangeSeed,
        uint32 lifetimeSeed
    ) public {
        uint64 minimum = uint64(120 + (uint256(minimumSeed) % (365 days - 119)));
        uint64 maximum = uint64(minimum + (uint256(rangeSeed) % (365 days - minimum + 1)));
        AtsCollateralRail.RailPolicy memory configured = AtsCollateralRail.RailPolicy({
            maximumAdvanceBps: uint16(1 + (uint256(advanceSeed) % 7_000)),
            maximumAnnualRateBps: uint16(uint256(rateSeed) % 10_001),
            maximumQuoteMovementBps: uint16(uint256(movementSeed) % 101),
            minimumTermSeconds: minimum,
            maximumTermSeconds: maximum,
            maximumOfferLifetimeSeconds: uint64(1 + (uint256(lifetimeSeed) % 24 hours))
        });

        AtsCollateralRailHarness deployed = _deploy(configured);
        AtsCollateralRail.RailPolicy memory observed = deployed.policy();
        assertEq(observed.maximumAdvanceBps, configured.maximumAdvanceBps);
        assertEq(observed.maximumAnnualRateBps, configured.maximumAnnualRateBps);
        assertEq(observed.maximumQuoteMovementBps, configured.maximumQuoteMovementBps);
        assertEq(observed.minimumTermSeconds, configured.minimumTermSeconds);
        assertEq(observed.maximumTermSeconds, configured.maximumTermSeconds);
        assertEq(observed.maximumOfferLifetimeSeconds, configured.maximumOfferLifetimeSeconds);
    }

    function _expectInvalid(AtsCollateralRail.RailPolicy memory configured) internal {
        vm.expectRevert(AtsCollateralRail.InvalidPolicy.selector);
        _deploy(configured);
    }

    function _deploy(AtsCollateralRail.RailPolicy memory configured) internal returns (AtsCollateralRailHarness) {
        return new AtsCollateralRailHarness(token, bytes32(uint256(1)), oracle, 0, 100 * 1e8, configured, address(this));
    }
}
