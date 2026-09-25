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
        token.setMaturity(block.timestamp + 730 days);
    }

    function testTermCreditRecipeDeploysAndQuotesItsDefaults() public {
        _assertRecipeLifecycle(RailTestPolicy.defaults(), 70 * 1e8, 1_000, 30 days, 700 * 1e8);
    }

    function testMaturityBridgeRecipeDeploysAndQuotesItsDefaults() public {
        AtsCollateralRail.RailPolicy memory configured = AtsCollateralRail.RailPolicy({
            maximumAdvanceBps: 5_000,
            maximumAnnualRateBps: 5_000,
            maximumQuoteMovementBps: 50,
            minimumTermSeconds: 2 minutes,
            maximumTermSeconds: 30 days,
            maximumOfferLifetimeSeconds: 1 hours
        });
        _assertRecipeLifecycle(configured, 40 * 1e8, 500, 7 days, 500 * 1e8);
    }

    function testCustomFacilityRecipeDeploysAndQuotesItsDefaults() public {
        _assertRecipeLifecycle(RailTestPolicy.defaults(), 60 * 1e8, 800, 14 days, 700 * 1e8);
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

    function _assertRecipeLifecycle(
        AtsCollateralRail.RailPolicy memory configured,
        uint128 principalUsdE8,
        uint16 annualRateBps,
        uint64 termSeconds,
        uint256 expectedMaximumUsdE8
    ) internal {
        AtsCollateralRailHarness deployed = _deploy(configured);
        AtsCollateralRail.OfferTerms memory terms = AtsCollateralRail.OfferTerms({
            borrower: address(0xB0770),
            collateralAmount: 10,
            principalUsdE8: principalUsdE8,
            annualRateBps: annualRateBps,
            termSeconds: termSeconds,
            offerExpiresAt: uint64(block.timestamp + configured.maximumOfferLifetimeSeconds)
        });
        (uint256 maximumUsdE8, uint256 principalTinybar, uint256 repaymentTinybar, uint64 maturity,,) =
            deployed.previewOffer(terms);

        assertEq(maximumUsdE8, expectedMaximumUsdE8);
        assertTrue(principalTinybar > 0);
        assertTrue(repaymentTinybar >= principalTinybar);
        assertEq(maturity, block.timestamp + termSeconds);
    }

    function _deploy(AtsCollateralRail.RailPolicy memory configured) internal returns (AtsCollateralRailHarness) {
        return new AtsCollateralRailHarness(token, bytes32(uint256(1)), oracle, 0, 100 * 1e8, configured, address(this));
    }
}
