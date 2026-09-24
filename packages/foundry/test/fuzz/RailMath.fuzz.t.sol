// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../TestBase.sol";
import {AtsCollateralRail} from "../../contracts/AtsCollateralRail.sol";
import {MockAtsToken} from "../mocks/MockAtsToken.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "../mocks/AtsCollateralRailHarness.sol";

contract RailMathFuzzTest is TestBase {
    bytes32 internal constant PARTITION = bytes32(uint256(1));
    address internal constant BORROWER = address(0xB0770);

    MockAtsToken internal token;
    MockOracle internal oracle;
    AtsCollateralRailHarness internal rail;

    function setUp() public {
        token = new MockAtsToken();
        oracle = new MockOracle(25_000_000);
        rail = new AtsCollateralRailHarness(token, PARTITION, oracle, 0, 100 * 1e8, address(this));
        token.setMaturity(block.timestamp + 730 days);
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
}
