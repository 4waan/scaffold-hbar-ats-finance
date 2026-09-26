// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {AtsCollateralRail} from "../contracts/AtsCollateralRail.sol";
import {MockAtsToken} from "./mocks/MockAtsToken.sol";
import {MockOracle} from "./mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "./mocks/AtsCollateralRailHarness.sol";
import {RailTestPolicy} from "./RailTestPolicy.sol";

contract AtsCollateralRailTest is TestBase {
    address internal constant OWNER = address(0xA11CE);
    address internal constant LENDER = address(0x1EAD);
    address internal constant BORROWER = address(0xB0770);
    bytes32 internal constant PARTITION = bytes32(uint256(1));
    uint256 internal constant HBAR_USD_E8 = 25_000_000;
    uint256 internal constant NOMINAL_USD_E8 = 100 * 1e8;
    uint256 internal constant COLLATERAL = 10;
    uint256 internal constant PRINCIPAL_USD_E8 = 70 * 1e8;

    MockAtsToken internal token;
    MockOracle internal oracle;
    AtsCollateralRailHarness internal rail;

    function setUp() public {
        token = new MockAtsToken();
        oracle = new MockOracle(HBAR_USD_E8);
        rail =
            new AtsCollateralRailHarness(token, PARTITION, oracle, 0, NOMINAL_USD_E8, RailTestPolicy.defaults(), OWNER);
        token.setKyc(LENDER, true);
        token.setKyc(BORROWER, true);
        token.setMaturity(block.timestamp + 730 days);
        token.setBalance(PARTITION, BORROWER, 100);
        token.setAllowance(BORROWER, address(rail), type(uint256).max);
        vm.deal(LENDER, 10_000 * 1e8);
        vm.deal(BORROWER, 10_000 * 1e8);
        vm.deal(OWNER, 10_000 * 1e8);
    }

    function testPreviewUsesHaircutConversionAndConservativeInterest() public view {
        AtsCollateralRail.OfferTerms memory terms = _terms();
        (
            uint256 maximumUsdE8,
            uint256 principalTinybar,
            uint256 repaymentTinybar,
            uint64 maturity,
            uint256 priceUsdE8,
        ) = rail.previewOffer(terms);
        assertEq(maximumUsdE8, 700 * 1e8);
        assertEq(principalTinybar, 280 * 1e8);
        assertTrue(repaymentTinybar > principalTinybar);
        assertEq(maturity, block.timestamp + terms.termSeconds);
        assertEq(priceUsdE8, HBAR_USD_E8);
    }

    function testPolicyReadReturnsDeploymentConfiguration() public view {
        AtsCollateralRail.RailPolicy memory configured = rail.policy();
        assertEq(configured.maximumAdvanceBps, 7_000);
        assertEq(configured.maximumAnnualRateBps, 10_000);
        assertEq(configured.maximumQuoteMovementBps, 100);
        assertEq(configured.minimumTermSeconds, 2 minutes);
        assertEq(configured.maximumTermSeconds, 365 days);
        assertEq(configured.maximumOfferLifetimeSeconds, 24 hours);
    }

    function testFundAndAcceptCreatesOneValidatedHold() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);

        assertEq(position.lender, LENDER);
        assertEq(position.borrower, BORROWER);
        assertEq(position.collateralAmount, COLLATERAL);
        assertEq(uint256(position.state), uint256(AtsCollateralRail.PositionState.OPEN));
        assertEq(uint256(position.automation), uint256(AtsCollateralRail.AutomationState.UNAVAILABLE));
        assertEq(token.holdsCreated(), 1);
        assertEq(token.balanceOfByPartition(PARTITION, BORROWER), 90);
        assertEq(token.getHeldAmountForByPartition(PARTITION, BORROWER), 10);
        assertEq(rail.credits(BORROWER), position.principalTinybar);
        _assertSolvent();
    }

    function testLocalPolicyRejectsMissingBorrowerKycBeforeHold() public {
        bytes32 offerId = _fund();
        token.setKyc(BORROWER, false);
        vm.prank(BORROWER);
        vm.expectRevert(abi.encodeWithSelector(AtsCollateralRail.KycRequired.selector, BORROWER));
        rail.acceptOffer(offerId);
        assertEq(token.holdsCreated(), 0);
        assertTrue(rail.getOffer(offerId).exists);
    }

    function testRejectsQuoteMovementAboveOnePercent() public {
        bytes32 offerId = _fund();
        oracle.setQuote(20_000_000, 0, uint64(block.timestamp));
        vm.prank(BORROWER);
        vm.expectRevert(
            abi.encodeWithSelector(AtsCollateralRail.QuoteMoved.selector, uint256(280 * 1e8), uint256(350 * 1e8))
        );
        rail.acceptOffer(offerId);
        assertTrue(rail.getOffer(offerId).exists);
        assertEq(token.holdsCreated(), 0);
    }

    function testPostCreationValidationRevertsAtomically() public {
        bytes32 offerId = _fund();
        token.setCorruptNextHold(true);
        vm.prank(BORROWER);
        vm.expectRevert(AtsCollateralRail.InvalidHold.selector);
        rail.acceptOffer(offerId);
        assertTrue(rail.getOffer(offerId).exists);
        assertEq(token.holdsCreated(), 0);
        assertEq(token.balanceOfByPartition(PARTITION, BORROWER), 100);
    }

    function testRepayReleasesHoldAndCreditsLender() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory beforeRepay = rail.getPosition(positionId);

        vm.prank(BORROWER);
        rail.repay{value: beforeRepay.repaymentTinybar}(positionId);

        AtsCollateralRail.Position memory afterRepay = rail.getPosition(positionId);
        assertEq(uint256(afterRepay.state), uint256(AtsCollateralRail.PositionState.REPAID));
        assertEq(token.balanceOfByPartition(PARTITION, BORROWER), 100);
        assertEq(token.getHeldAmountForByPartition(PARTITION, BORROWER), 0);
        assertEq(rail.credits(LENDER), beforeRepay.repaymentTinybar);

        uint256 lenderBefore = LENDER.balance;
        vm.prank(LENDER);
        rail.withdraw();
        assertEq(LENDER.balance, lenderBefore + beforeRepay.repaymentTinybar);
        _assertSolvent();
    }

    function testRepayReleasesUpwardAdjustedHoldAndCannotDefault() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        uint256 adjustedAmount = COLLATERAL + 5;
        token.setAdjustedHoldAmount(PARTITION, BORROWER, position.holdId, adjustedAmount);

        vm.prank(BORROWER);
        rail.repay{value: position.repaymentTinybar}(positionId);

        assertEq(token.balanceOfByPartition(PARTITION, BORROWER), 90 + adjustedAmount);
        _assertTerminalHoldDrained(position.holdId);
        vm.warp(position.maturity);
        assertFalse(rail.settle(positionId));
        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.REPAID));
        assertEq(token.terminalActions(), 1);
    }

    function testRepayReleasesDownwardAdjustedHold() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        uint256 adjustedAmount = COLLATERAL - 4;
        token.setAdjustedHoldAmount(PARTITION, BORROWER, position.holdId, adjustedAmount);

        vm.prank(BORROWER);
        rail.repay{value: position.repaymentTinybar}(positionId);

        assertEq(token.balanceOfByPartition(PARTITION, BORROWER), 90 + adjustedAmount);
        _assertTerminalHoldDrained(position.holdId);
        assertEq(token.terminalActions(), 1);
    }

    function testRepayRejectsMismatchedLiveHoldIdentity() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        token.setHoldData(PARTITION, BORROWER, position.holdId, abi.encode(bytes32(uint256(123))));

        vm.prank(BORROWER);
        vm.expectRevert(AtsCollateralRail.InvalidHold.selector);
        rail.repay{value: position.repaymentTinybar}(positionId);

        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));
        assertEq(token.holdAmount(PARTITION, BORROWER, position.holdId), COLLATERAL);
        assertEq(token.terminalActions(), 0);
    }

    function testRepayRejectsSuccessfulAtsResponseWithResidualHold() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        token.setTerminalResidualAmount(1);

        vm.prank(BORROWER);
        vm.expectRevert(AtsCollateralRail.InvalidHold.selector);
        rail.repay{value: position.repaymentTinybar}(positionId);

        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));
        assertEq(token.holdAmount(PARTITION, BORROWER, position.holdId), COLLATERAL);
        assertEq(token.terminalActions(), 0);
    }

    function testDefaultCannotExecuteBeforeMaturity() public {
        bytes32 positionId = _fundAndAccept();
        uint256 maturity = rail.getPosition(positionId).maturity;
        vm.expectRevert(abi.encodeWithSelector(AtsCollateralRail.NotMatured.selector, block.timestamp, maturity));
        rail.settle(positionId);
        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));
    }

    function testMatureDefaultExecutesCollateralOnce() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        vm.warp(position.maturity);

        assertTrue(rail.settle(positionId));
        assertFalse(rail.settle(positionId));
        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.DEFAULTED));
        assertEq(token.balanceOfByPartition(PARTITION, LENDER), COLLATERAL);
        assertEq(token.terminalActions(), 1);
    }

    function testDefaultExecutesUpwardAdjustedHold() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        uint256 adjustedAmount = COLLATERAL + 5;
        token.setAdjustedHoldAmount(PARTITION, BORROWER, position.holdId, adjustedAmount);
        vm.warp(position.maturity);

        assertTrue(rail.settle(positionId));

        assertEq(token.balanceOfByPartition(PARTITION, LENDER), adjustedAmount);
        _assertTerminalHoldDrained(position.holdId);
        assertEq(token.terminalActions(), 1);
    }

    function testDefaultExecutesDownwardAdjustedHoldAndCannotRepay() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        uint256 adjustedAmount = COLLATERAL - 4;
        token.setAdjustedHoldAmount(PARTITION, BORROWER, position.holdId, adjustedAmount);
        vm.warp(position.maturity);

        assertTrue(rail.settle(positionId));

        assertEq(token.balanceOfByPartition(PARTITION, LENDER), adjustedAmount);
        _assertTerminalHoldDrained(position.holdId);
        vm.prank(BORROWER);
        vm.expectRevert(AtsCollateralRail.PositionNotOpen.selector);
        rail.repay{value: position.repaymentTinybar}(positionId);
        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.DEFAULTED));
        assertEq(token.terminalActions(), 1);
    }

    function testDefaultRejectsMismatchedLiveHoldIdentity() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        token.setHoldData(PARTITION, BORROWER, position.holdId, abi.encode(bytes32(uint256(123))));
        vm.warp(position.maturity);

        vm.expectRevert(AtsCollateralRail.InvalidHold.selector);
        rail.settle(positionId);

        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));
        assertEq(token.holdAmount(PARTITION, BORROWER, position.holdId), COLLATERAL);
        assertEq(token.terminalActions(), 0);
    }

    function testDefaultRejectsSuccessfulAtsResponseWithResidualHold() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        token.setTerminalResidualAmount(1);
        vm.warp(position.maturity);

        vm.expectRevert(AtsCollateralRail.InvalidHold.selector);
        rail.settle(positionId);

        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));
        assertEq(token.holdAmount(PARTITION, BORROWER, position.holdId), COLLATERAL);
        assertEq(token.terminalActions(), 0);
    }

    function testExpiredLenderKycLeavesDefaultRetryable() public {
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        token.setKyc(LENDER, false);
        vm.warp(position.maturity);

        vm.expectRevert(abi.encodeWithSelector(AtsCollateralRail.KycRequired.selector, LENDER));
        rail.settle(positionId);
        assertEq(uint256(rail.getPosition(positionId).state), uint256(AtsCollateralRail.PositionState.OPEN));

        token.setKyc(LENDER, true);
        assertTrue(rail.settle(positionId));
    }

    function testHssTriesTwoFiveAndTenSecondCapacitySlots() public {
        vm.prank(OWNER);
        rail.fundAutomation{value: rail.HSS_RESERVE_TINYBAR()}();
        rail.configureSchedule(2, 22, address(0x516B));

        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        assertEq(rail.scheduleAttempts(), 2);
        assertEq(rail.scheduledSeconds(0), position.maturity + 2);
        assertEq(rail.scheduledSeconds(1), position.maturity + 5);
        assertEq(position.scheduleAddress, address(0x516B));
        assertEq(uint256(position.automation), uint256(AtsCollateralRail.AutomationState.PENDING));
        assertEq(rail.reservedAutomation(), rail.HSS_RESERVE_TINYBAR());
        _assertSolvent();
    }

    function testBadHssResponseDoesNotTrapCollateral() public {
        vm.prank(OWNER);
        rail.fundAutomation{value: rail.HSS_RESERVE_TINYBAR()}();
        rail.configureSchedule(1, 1, address(0x516B));

        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);
        assertEq(rail.scheduleAttempts(), 3);
        assertEq(uint256(position.automation), uint256(AtsCollateralRail.AutomationState.UNAVAILABLE));
        assertEq(position.scheduleAddress, address(0));
        assertEq(token.getHeldAmountForByPartition(PARTITION, BORROWER), COLLATERAL);
    }

    function testRepaidScheduleCompletesAtMaturityAndReleasesReserve() public {
        vm.prank(OWNER);
        rail.fundAutomation{value: rail.HSS_RESERVE_TINYBAR()}();
        rail.configureSchedule(1, 22, address(0x516B));
        bytes32 positionId = _fundAndAccept();
        AtsCollateralRail.Position memory position = rail.getPosition(positionId);

        vm.prank(BORROWER);
        rail.repay{value: position.repaymentTinybar}(positionId);
        assertEq(rail.reservedAutomation(), rail.HSS_RESERVE_TINYBAR());
        vm.warp(position.maturity);
        assertFalse(rail.settle(positionId));
        assertEq(rail.reservedAutomation(), 0);
        assertEq(uint256(rail.getPosition(positionId).automation), uint256(AtsCollateralRail.AutomationState.COMPLETED));
    }

    function testUnusedAutomationCannotConsumeUserLiabilities() public {
        _fund();
        vm.prank(OWNER);
        vm.expectRevert(
            abi.encodeWithSelector(AtsCollateralRail.AutomationFundsLocked.selector, uint256(0), uint256(1))
        );
        rail.withdrawUnusedAutomation(payable(OWNER), 1);
        _assertSolvent();
    }

    function testAtsCallbackCannotReenterAcceptance() public {
        bytes32 offerId = _fund();
        token.setCallback(address(rail), abi.encodeCall(rail.acceptOffer, (offerId)));
        vm.prank(BORROWER);
        rail.acceptOffer(offerId);
        assertTrue(token.callbackAttempted());
        assertFalse(token.callbackSucceeded());
        assertEq(token.holdsCreated(), 1);
    }

    function testCancelPreservesPullPaymentSolvency() public {
        bytes32 offerId = _fund();
        AtsCollateralRail.FundedOffer memory offer = rail.getOffer(offerId);
        vm.prank(LENDER);
        rail.cancelOffer(offerId);
        assertFalse(rail.getOffer(offerId).exists);
        assertEq(rail.credits(LENDER), offer.principalTinybar);
        _assertSolvent();
    }

    function _fundAndAccept() internal returns (bytes32 positionId) {
        positionId = _fund();
        vm.prank(BORROWER);
        rail.acceptOffer(positionId);
    }

    function _fund() internal returns (bytes32 offerId) {
        AtsCollateralRail.OfferTerms memory terms = _terms();
        (, uint256 principalTinybar,,,,) = rail.previewOffer(terms);
        vm.prank(LENDER);
        offerId = rail.fundOffer{value: principalTinybar}(terms);
    }

    function _terms() internal view returns (AtsCollateralRail.OfferTerms memory) {
        return AtsCollateralRail.OfferTerms({
            borrower: BORROWER,
            collateralAmount: uint128(COLLATERAL),
            principalUsdE8: uint128(PRINCIPAL_USD_E8),
            annualRateBps: 1_000,
            termSeconds: 30 days,
            offerExpiresAt: uint64(block.timestamp + 1 hours)
        });
    }

    function _assertSolvent() internal view {
        assertTrue(address(rail).balance >= rail.cashLiabilities() + rail.reservedAutomation());
    }

    function _assertTerminalHoldDrained(uint256 holdId) internal view {
        assertEq(token.holdAmount(PARTITION, BORROWER, holdId), 0);
        assertEq(token.getHeldAmountForByPartition(PARTITION, BORROWER), 0);
    }
}
