// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase, StdInvariantBase} from "../TestBase.sol";
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
    AtsCollateralRailHarness public immutable rail;
    RailActor public immutable lender;
    RailActor public immutable borrower;

    constructor(AtsCollateralRailHarness rail_, RailActor lender_, RailActor borrower_) {
        rail = rail_;
        lender = lender_;
        borrower = borrower_;
    }

    receive() external payable {}

    function fundThenCancel(uint64 seed) external {
        AtsCollateralRail.OfferTerms memory terms = _terms(seed);
        (, uint256 principalTinybar,,,,) = rail.previewOffer(terms);
        try lender.fund(rail, terms, principalTinybar) returns (bytes32 offerId) {
            try lender.cancel(rail, offerId) {} catch {}
            try lender.withdraw(rail) {} catch {}
        } catch {}
    }

    function fundAcceptAndMaybeRepay(uint64 seed) external {
        AtsCollateralRail.OfferTerms memory terms = _terms(seed);
        (, uint256 principalTinybar, uint256 repaymentTinybar,,,) = rail.previewOffer(terms);
        try lender.fund(rail, terms, principalTinybar) returns (bytes32 positionId) {
            try borrower.accept(rail, positionId) {
                if (seed % 2 == 0) {
                    try borrower.repay(rail, positionId, repaymentTinybar) {} catch {}
                }
                try borrower.withdraw(rail) {} catch {}
                try lender.withdraw(rail) {} catch {}
            } catch {}
        } catch {}
    }

    function sponsorAutomation(uint64 seed) external {
        uint256 amount = 1 + uint256(seed % uint64(2 * 1e8));
        if (address(this).balance < amount) return;
        try rail.fundAutomation{value: amount}() {} catch {}
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
        handler = new RailHandler(rail, lender, borrower);

        token.setMaturity(block.timestamp + 730 days);
        token.setKyc(address(lender), true);
        token.setKyc(address(borrower), true);
        token.setBalance(PARTITION, address(borrower), 1e30);
        token.setAllowance(address(borrower), address(rail), type(uint256).max);
        vm.deal(address(lender), 1e30);
        vm.deal(address(borrower), 1e30);
        vm.deal(address(handler), 1e30);
        targetContract(address(handler));
    }

    function invariantBalanceCoversCashAndAutomation() public view {
        assertTrue(address(rail).balance >= rail.cashLiabilities() + rail.reservedAutomation());
    }

    function invariantEveryHoldHasAtMostOneTerminalAction() public view {
        assertTrue(token.terminalActions() <= token.holdsCreated());
    }
}
