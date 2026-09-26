// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../TestBase.sol";
import {AtsCollateralRail} from "../../contracts/AtsCollateralRail.sol";
import {MockAtsToken} from "../mocks/MockAtsToken.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "../mocks/AtsCollateralRailHarness.sol";
import {RailTestPolicy} from "../RailTestPolicy.sol";

contract RailMathFuzzTest is TestBase {
    bytes32 internal constant PARTITION = bytes32(uint256(1));
    address internal constant LENDER = address(0x1EAD);
    address internal constant BORROWER = address(0xB0770);

    MockAtsToken internal token;
    MockOracle internal oracle;
    AtsCollateralRailHarness internal rail;

    function setUp() public {
        token = new MockAtsToken();
        oracle = new MockOracle(25_000_000);
        rail = new AtsCollateralRailHarness(
            token, PARTITION, oracle, 0, 100 * 1e8, RailTestPolicy.defaults(), address(this)
        );
        token.setKyc(LENDER, true);
        token.setKyc(BORROWER, true);
        token.setMaturity(block.timestamp + 730 days);
        token.setBalance(PARTITION, BORROWER, 1_000);
        token.setAllowance(BORROWER, address(rail), type(uint256).max);
        vm.deal(LENDER, 100_000 * 1e8);
    }

    function testFuzzConversionAndInterestRoundUp(
        uint96 principalSeed,
        uint64 priceSeed,
        uint16 rateSeed,
        uint32 termSeed
    ) public {
        uint256 price = 1 + uint256(priceSeed % 100_000_000_000);
        uint256 principalUsdE8 = 1 + uint256(principalSeed % uint96(700 * 1e8));
        uint16 rate = uint16(rateSeed % 10_001);
        uint64 term = uint64(120 + (uint256(termSeed) % (365 days - 119)));
        oracle.setQuote(price, 0, uint64(block.timestamp));

        AtsCollateralRail.OfferTerms memory terms = AtsCollateralRail.OfferTerms({
            borrower: BORROWER,
            collateralAmount: 10,
            principalUsdE8: uint128(principalUsdE8),
            annualRateBps: rate,
            termSeconds: term,
            offerExpiresAt: uint64(block.timestamp + 1 hours)
        });
        (, uint256 principalTinybar, uint256 repaymentTinybar,,,) = rail.previewOffer(terms);

        uint256 numerator = principalUsdE8 * 1e8;
        assertTrue(principalTinybar * price >= numerator);
        if (principalTinybar > 0) assertTrue((principalTinybar - 1) * price < numerator);
        assertTrue(repaymentTinybar >= principalTinybar);
    }

    function testFuzzMaturityBoundary(uint32 termSeed) public {
        uint64 term = uint64(120 + (uint256(termSeed) % (365 days - 119)));
        AtsCollateralRail.OfferTerms memory terms = _terms(term);
        token.setMaturity(block.timestamp + term);
        (,,, uint64 maturity,,) = rail.previewOffer(terms);
        assertEq(maturity, block.timestamp + term);

        token.setMaturity(block.timestamp + term - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AtsCollateralRail.BeyondAssetMaturity.selector, block.timestamp + term, block.timestamp + term - 1
            )
        );
        rail.previewOffer(terms);
    }

    function testFuzzQuoteMovementBoundary(uint64 priceSeed) public {
        AtsCollateralRail.OfferTerms memory terms = _terms(30 days);
        (, uint256 fundedPrincipal,,,,) = rail.previewOffer(terms);
        vm.prank(LENDER);
        bytes32 offerId = rail.fundOffer{value: fundedPrincipal}(terms);

        uint256 currentPrice = 1 + uint256(priceSeed % 100_000_000);
        oracle.setQuote(currentPrice, 0, uint64(block.timestamp));
        uint256 numerator = uint256(terms.principalUsdE8) * 1e8;
        uint256 currentPrincipal = (numerator + currentPrice - 1) / currentPrice;
        uint256 difference = fundedPrincipal > currentPrincipal
            ? fundedPrincipal - currentPrincipal
            : currentPrincipal - fundedPrincipal;
        bool withinBoundary = difference * 10_000 <= fundedPrincipal * rail.maximumQuoteMovementBps();

        vm.prank(BORROWER);
        if (withinBoundary) {
            rail.acceptOffer(offerId);
            assertEq(token.holdsCreated(), 1);
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(AtsCollateralRail.QuoteMoved.selector, fundedPrincipal, currentPrincipal)
            );
            rail.acceptOffer(offerId);
            assertEq(token.holdsCreated(), 0);
        }
    }

    function _terms(uint64 term) internal view returns (AtsCollateralRail.OfferTerms memory) {
        return AtsCollateralRail.OfferTerms({
            borrower: BORROWER,
            collateralAmount: 10,
            principalUsdE8: uint128(70 * 1e8),
            annualRateBps: 1_000,
            termSeconds: term,
            offerExpiresAt: uint64(block.timestamp + 1 hours)
        });
    }
}
