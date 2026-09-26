// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase, StdInvariantBase, Vm} from "../TestBase.sol";
import {AtsCollateralRail} from "../../contracts/AtsCollateralRail.sol";
import {MockAtsToken} from "../mocks/MockAtsToken.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "../mocks/AtsCollateralRailHarness.sol";
import {RailTestPolicy} from "../RailTestPolicy.sol";

contract RailActor {
    receive() external payable {}

    function fund(AtsCollateralRail rail, AtsCollateralRail.OfferTerms calldata terms, uint256 principalTinybar)
        external
        returns (bytes32)
    {
        return rail.fundOffer{value: principalTinybar}(terms);
    }

    function accept(AtsCollateralRail rail, bytes32 offerId) external {
        rail.acceptOffer(offerId);
    }

    function cancel(AtsCollateralRail rail, bytes32 offerId) external {
        rail.cancelOffer(offerId);
    }

    function repay(AtsCollateralRail rail, bytes32 positionId, uint256 repaymentTinybar) external {
        rail.repay{value: repaymentTinybar}(positionId);
    }

    function withdraw(AtsCollateralRail rail) external {
        rail.withdraw();
    }
}

contract RailHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant COVER_FUND = 1 << 0;
    uint256 internal constant COVER_CANCEL = 1 << 1;
    uint256 internal constant COVER_ACCEPT = 1 << 2;
    uint256 internal constant COVER_REPAY = 1 << 3;
    uint256 internal constant COVER_CREDIT_WITHDRAWAL = 1 << 4;
    uint256 internal constant COVER_AUTOMATION_FUNDING = 1 << 5;
    uint256 internal constant COVER_DEFAULT = 1 << 6;
    uint256 internal constant COVER_FALLBACK_DEFAULT = 1 << 7;
    uint256 internal constant COVER_ADJUSTED_DEFAULT = 1 << 8;
    uint256 internal constant COVER_EARLY_DEFAULT_REJECTION = 1 << 9;
    uint256 internal constant COVER_KYC_DEFAULT_REJECTION = 1 << 10;
    uint256 internal constant COVER_KYC_RETRY = 1 << 11;
    uint256 internal constant COVER_TERMINAL_NOOP = 1 << 12;
    uint256 internal constant COVER_UNUSED_AUTOMATION_WITHDRAWAL = 1 << 13;
    uint256 internal constant COVER_LOCKED_AUTOMATION_REJECTION = 1 << 14;
    uint256 public constant REQUIRED_POST_SEED_COVERAGE = (1 << 15) - 1;

    AtsCollateralRailHarness public immutable rail;
    MockAtsToken public immutable token;
    RailActor public immutable lender;
    RailActor public immutable borrower;

    uint256 public successfulFunds;
    uint256 public successfulCancellations;
    uint256 public successfulAcceptances;
    uint256 public successfulRepayments;
    uint256 public successfulWithdrawals;
    uint256 public successfulAutomationFunding;
    uint256 public successfulDefaults;
    uint256 public successfulFallbackDefaults;
    uint256 public successfulAdjustedDefaults;
    uint256 public earlyDefaultRejections;
    uint256 public kycDefaultRejections;
    uint256 public successfulKycRetries;
    uint256 public harmlessTerminalNoops;
    uint256 public successfulUnusedAutomationWithdrawals;
    uint256 public lockedAutomationWithdrawalRejections;

    uint256 public ghostCashLiabilities;
    uint256 public ghostReservedAutomation;
    uint256 public ghostAvailableAutomation;
    uint256 public postSeedCoverage;
    uint256 public postSeedTransitions;
    bool public postSeedCoverageEnabled;
    bool public ghostAccountingMismatch;

    constructor(AtsCollateralRailHarness rail_, MockAtsToken token_, RailActor lender_, RailActor borrower_) {
        rail = rail_;
        token = token_;
        lender = lender_;
        borrower = borrower_;
    }

    receive() external payable {}

    function enablePostSeedCoverage() external {
        postSeedCoverageEnabled = true;
    }

    function fundThenCancel(uint64 seed) external {
        _refreshAssetMaturity();
        AtsCollateralRail.OfferTerms memory terms = _terms(seed);
        (, uint256 principalTinybar,,,,) = rail.previewOffer(terms);
        try lender.fund(rail, terms, principalTinybar) returns (bytes32 offerId) {
            ghostCashLiabilities += principalTinybar;
            ++successfulFunds;
            _cover(COVER_FUND);
            try lender.cancel(rail, offerId) {
                ++successfulCancellations;
                _cover(COVER_CANCEL);
            } catch {}
            _withdrawAndRecord(lender);
        } catch {}
    }

    function fundAcceptAndMaybeRepay(uint64 seed) external {
        _refreshAssetMaturity();
        AtsCollateralRail.OfferTerms memory terms = _terms(seed);
        (, uint256 principalTinybar, uint256 repaymentTinybar,,,) = rail.previewOffer(terms);
        try lender.fund(rail, terms, principalTinybar) returns (bytes32 positionId) {
            ghostCashLiabilities += principalTinybar;
            ++successfulFunds;
            _cover(COVER_FUND);
            try borrower.accept(rail, positionId) {
                ++successfulAcceptances;
                _cover(COVER_ACCEPT);
                _recordAutomationReservation(positionId);
                if (seed % 2 == 0) {
                    try borrower.repay(rail, positionId, repaymentTinybar) {
                        ghostCashLiabilities += repaymentTinybar;
                        ++successfulRepayments;
                        _cover(COVER_REPAY);
                    } catch {}
                }
                _withdrawAndRecord(borrower);
                _withdrawAndRecord(lender);
            } catch {}
        } catch {}
    }

    function fundAcceptAndExerciseTerminal(uint64 seed) external {
        _refreshAssetMaturity();
        uint256 scenario = seed % 5;
        rail.configureSchedule(scenario == 4 ? 0 : 1, 22, address(0x516B));
        AtsCollateralRail.OfferTerms memory terms = _terms(seed);
        (, uint256 principalTinybar, uint256 repaymentTinybar,,,) = rail.previewOffer(terms);
        try lender.fund(rail, terms, principalTinybar) returns (bytes32 positionId) {
            ghostCashLiabilities += principalTinybar;
            ++successfulFunds;
            _cover(COVER_FUND);
            try borrower.accept(rail, positionId) {
                ++successfulAcceptances;
                _cover(COVER_ACCEPT);
                _recordAutomationReservation(positionId);
                AtsCollateralRail.Position memory position = rail.getPosition(positionId);

                if (scenario == 0) {
                    bool wasPending = position.automation == AtsCollateralRail.AutomationState.PENDING;
                    try rail.settle(positionId) returns (bool earlyExecution) {
                        _recordAutomationCompletion(positionId, wasPending);
                        if (earlyExecution) ++successfulDefaults;
                    } catch {
                        ++earlyDefaultRejections;
                        _cover(COVER_EARLY_DEFAULT_REJECTION);
                    }
                    vm.warp(position.maturity + 2);
                    _settleAndRecord(positionId, false, false);
                } else if (scenario == 1) {
                    token.setKyc(address(lender), false);
                    vm.warp(position.maturity + 2);
                    bool wasPending = position.automation == AtsCollateralRail.AutomationState.PENDING;
                    try rail.settle(positionId) returns (bool ineligibleExecution) {
                        _recordAutomationCompletion(positionId, wasPending);
                        if (ineligibleExecution) ++successfulDefaults;
                    } catch {
                        ++kycDefaultRejections;
                        _cover(COVER_KYC_DEFAULT_REJECTION);
                    }
                    token.setKyc(address(lender), true);
                    uint256 defaultsBefore = successfulDefaults;
                    _settleAndRecord(positionId, false, false);
                    if (successfulDefaults > defaultsBefore) {
                        ++successfulKycRetries;
                        _cover(COVER_KYC_RETRY);
                    }
                } else if (scenario == 2) {
                    try borrower.repay(rail, positionId, repaymentTinybar) {
                        ghostCashLiabilities += repaymentTinybar;
                        ++successfulRepayments;
                        _cover(COVER_REPAY);
                    } catch {}
                    _withdrawAndRecord(borrower);
                    _withdrawAndRecord(lender);
                    vm.warp(position.maturity + 2);
                    bool wasPending = position.automation == AtsCollateralRail.AutomationState.PENDING;
                    try rail.settle(positionId) returns (bool executed) {
                        _recordAutomationCompletion(positionId, wasPending);
                        if (!executed) {
                            ++harmlessTerminalNoops;
                            _cover(COVER_TERMINAL_NOOP);
                        }
                    } catch {}
                } else if (scenario == 3) {
                    token.setAdjustedHoldAmount(
                        rail.partition(), address(borrower), position.holdId, terms.collateralAmount + 1
                    );
                    vm.warp(position.maturity + 2);
                    _settleAndRecord(positionId, false, true);
                } else {
                    vm.warp(position.maturity + 12);
                    _settleAndRecord(positionId, true, false);
                }
            } catch {}
        } catch {}
    }

    function sponsorAutomation(uint64 seed) external {
        uint256 amount = 1 + uint256(seed % uint64(2 * 1e8));
        if (address(this).balance < amount) return;
        try rail.fundAutomation{value: amount}() {
            ghostAvailableAutomation += amount;
            ++successfulAutomationFunding;
            _cover(COVER_AUTOMATION_FUNDING);
        } catch {}
    }

    function withdrawUnusedAutomation(uint64 seed) external {
        if (rail.availableAutomation() == 0 && address(this).balance != 0) {
            try rail.fundAutomation{value: 1}() {
                ghostAvailableAutomation += 1;
                ++successfulAutomationFunding;
                _cover(COVER_AUTOMATION_FUNDING);
            } catch {}
        }

        uint256 available = rail.availableAutomation();
        if (available != 0) {
            uint256 amount = 1 + uint256(seed) % available;
            vm.prank(rail.owner());
            try rail.withdrawUnusedAutomation(payable(address(this)), amount) {
                _decreaseGhostAvailable(amount);
                ++successfulUnusedAutomationWithdrawals;
                _cover(COVER_UNUSED_AUTOMATION_WITHDRAWAL);
            } catch {}
        }

        uint256 lockedAmount = rail.availableAutomation() + 1;
        vm.prank(rail.owner());
        try rail.withdrawUnusedAutomation(payable(address(this)), lockedAmount) {
            ghostAccountingMismatch = true;
        } catch {
            ++lockedAutomationWithdrawalRejections;
            _cover(COVER_LOCKED_AUTOMATION_REJECTION);
        }
    }

    function _terms(uint64 seed) internal view returns (AtsCollateralRail.OfferTerms memory) {
        return AtsCollateralRail.OfferTerms({
            borrower: address(borrower),
            collateralAmount: 10,
            principalUsdE8: uint128((1 + uint256(seed % 69)) * 1e8),
            annualRateBps: uint16(seed % 10_001),
            termSeconds: uint64(120 + (seed % uint64(30 days))),
            offerExpiresAt: uint64(block.timestamp + 1 hours)
        });
    }

    function _settleAndRecord(bytes32 positionId, bool fallbackPath, bool adjusted) internal {
        bool wasPending = rail.getPosition(positionId).automation == AtsCollateralRail.AutomationState.PENDING;
        try rail.settle(positionId) returns (bool executed) {
            _recordAutomationCompletion(positionId, wasPending);
            if (executed) {
                ++successfulDefaults;
                _cover(COVER_DEFAULT);
                if (fallbackPath) {
                    ++successfulFallbackDefaults;
                    _cover(COVER_FALLBACK_DEFAULT);
                }
                if (adjusted) {
                    ++successfulAdjustedDefaults;
                    _cover(COVER_ADJUSTED_DEFAULT);
                }
            }
            bool secondWasPending = rail.getPosition(positionId).automation == AtsCollateralRail.AutomationState.PENDING;
            try rail.settle(positionId) returns (bool secondExecution) {
                _recordAutomationCompletion(positionId, secondWasPending);
                if (!secondExecution) {
                    ++harmlessTerminalNoops;
                    _cover(COVER_TERMINAL_NOOP);
                }
            } catch {}
        } catch {}
    }

    function _withdrawAndRecord(RailActor actor) internal {
        uint256 amount = rail.credits(address(actor));
        try actor.withdraw(rail) {
            _decreaseGhostCash(amount);
            ++successfulWithdrawals;
            _cover(COVER_CREDIT_WITHDRAWAL);
        } catch {}
    }

    function _recordAutomationReservation(bytes32 positionId) internal {
        if (rail.getPosition(positionId).automation != AtsCollateralRail.AutomationState.PENDING) return;
        uint256 reserve = rail.HSS_RESERVE_TINYBAR();
        ghostReservedAutomation += reserve;
        _decreaseGhostAvailable(reserve);
    }

    function _recordAutomationCompletion(bytes32 positionId, bool wasPending) internal {
        if (!wasPending) return;
        if (rail.getPosition(positionId).automation != AtsCollateralRail.AutomationState.COMPLETED) return;
        uint256 reserve = rail.HSS_RESERVE_TINYBAR();
        if (ghostReservedAutomation < reserve) {
            ghostAccountingMismatch = true;
            ghostReservedAutomation = 0;
        } else {
            ghostReservedAutomation -= reserve;
        }
        ghostAvailableAutomation += reserve;
    }

    function _decreaseGhostCash(uint256 amount) internal {
        if (ghostCashLiabilities < amount) {
            ghostAccountingMismatch = true;
            ghostCashLiabilities = 0;
        } else {
            ghostCashLiabilities -= amount;
        }
    }

    function _decreaseGhostAvailable(uint256 amount) internal {
        if (ghostAvailableAutomation < amount) {
            ghostAccountingMismatch = true;
            ghostAvailableAutomation = 0;
        } else {
            ghostAvailableAutomation -= amount;
        }
    }

    function _cover(uint256 bit) internal {
        if (postSeedCoverageEnabled) {
            postSeedCoverage |= bit;
            ++postSeedTransitions;
        }
    }

    function _refreshAssetMaturity() internal {
        token.setMaturity(block.timestamp + 730 days);
    }
}

contract RailSolvencyInvariantTest is TestBase, StdInvariantBase {
    bytes32 internal constant PARTITION = bytes32(uint256(1));

    MockAtsToken internal token;
    AtsCollateralRailHarness internal rail;
    RailHandler internal handler;

    function setUp() public {
        token = new MockAtsToken();
        MockOracle oracle = new MockOracle(25_000_000);
        rail = new AtsCollateralRailHarness(
            token, PARTITION, oracle, 0, 100 * 1e8, RailTestPolicy.defaults(), address(this)
        );
        RailActor lender = new RailActor();
        RailActor borrower = new RailActor();
        handler = new RailHandler(rail, token, lender, borrower);

        token.setMaturity(block.timestamp + 730 days);
        token.setKyc(address(lender), true);
        token.setKyc(address(borrower), true);
        token.setBalance(PARTITION, address(borrower), 1e30);
        token.setAllowance(address(borrower), address(rail), type(uint256).max);
        vm.deal(address(lender), 1e30);
        vm.deal(address(borrower), 1e30);
        vm.deal(address(handler), 1e30);

        // Establish a varied initial state before enabling fuzz coverage.
        // Seed activity never contributes to the post-seed coverage mask.
        handler.fundThenCancel(2);
        for (uint256 i = 0; i < 15; ++i) {
            handler.sponsorAutomation(199_999_999);
        }
        rail.configureSchedule(1, 22, address(0x516B));
        handler.fundAcceptAndMaybeRepay(2);
        for (uint64 scenario = 0; scenario < 5; ++scenario) {
            handler.fundAcceptAndExerciseTerminal(scenario);
        }
        handler.enablePostSeedCoverage();

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = RailHandler.fundThenCancel.selector;
        selectors[1] = RailHandler.fundAcceptAndMaybeRepay.selector;
        selectors[2] = RailHandler.sponsorAutomation.selector;
        selectors[3] = RailHandler.fundAcceptAndExerciseTerminal.selector;
        selectors[4] = RailHandler.withdrawUnusedAutomation.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariantBalanceCoversCashAndAutomation() public view {
        assertTrue(address(rail).balance >= rail.cashLiabilities() + rail.reservedAutomation());
    }

    function invariantCashLiabilitiesMatchGhostAccounting() public view {
        assertFalse(handler.ghostAccountingMismatch());
        assertEq(rail.cashLiabilities(), handler.ghostCashLiabilities());
    }

    function invariantAutomationMatchesGhostAccounting() public view {
        assertFalse(handler.ghostAccountingMismatch());
        assertEq(rail.reservedAutomation(), handler.ghostReservedAutomation());
        assertEq(rail.availableAutomation(), handler.ghostAvailableAutomation());
        assertEq(
            address(rail).balance,
            handler.ghostCashLiabilities() + handler.ghostReservedAutomation() + handler.ghostAvailableAutomation()
        );
    }

    function invariantEveryHoldHasAtMostOneTerminalAction() public view {
        assertTrue(token.terminalActions() <= token.holdsCreated());
    }

    function invariantEveryAcceptedPositionCreatedExactlyOneHold() public view {
        assertEq(token.holdsCreated(), handler.successfulAcceptances());
    }

    function invariantAutomationReservesAreWholeScheduleUnits() public view {
        assertEq(rail.reservedAutomation() % rail.HSS_RESERVE_TINYBAR(), 0);
    }

    function invariantEveryTerminalActionBelongsToOneSuccessfulTransition() public view {
        assertEq(token.terminalActions(), handler.successfulRepayments() + handler.successfulDefaults());
    }

    function testPostSeedCoverageReachesEveryCriticalPath() public {
        assertEq(handler.postSeedCoverage(), 0);

        handler.sponsorAutomation(1);
        handler.fundThenCancel(2);
        handler.fundAcceptAndMaybeRepay(2);
        for (uint64 scenario = 0; scenario < 5; ++scenario) {
            handler.fundAcceptAndExerciseTerminal(scenario);
        }
        handler.withdrawUnusedAutomation(1);

        assertEq(handler.postSeedCoverage(), handler.REQUIRED_POST_SEED_COVERAGE());
    }

    // Foundry calls this hook after each generated run. Exact bitmap coverage
    // is enforced by the deterministic test above to avoid random failures.
    function afterInvariant() public view {
        assertTrue(handler.postSeedTransitions() > 0);
        assertTrue(handler.postSeedCoverage() > 0);
    }
}
