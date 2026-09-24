// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {MockPyth} from "./mocks/MockPyth.sol";
import {PythHbarUsdOracle} from "../contracts/oracle/PythHbarUsdOracle.sol";

contract PythHbarUsdOracleTest is TestBase {
    bytes32 internal constant PRICE_ID = keccak256("HBAR/USD");

    MockPyth internal pyth;
    PythHbarUsdOracle internal oracle;

    function setUp() public {
        pyth = new MockPyth();
        oracle = new PythHbarUsdOracle(pyth, PRICE_ID);
        pyth.setPrice(25_000_000, 100_000, -8, block.timestamp);
    }

    function testNormalizesPriceAndConfidenceToEightDecimals() public view {
        (uint256 price, uint256 confidence, uint64 publishedAt) = oracle.latestHbarUsd();
        assertEq(price, 25_000_000);
        assertEq(confidence, 100_000);
        assertEq(publishedAt, block.timestamp);
    }

    function testNormalizesAlternateExponentConservatively() public {
        pyth.setPrice(250_001, 101, -6, block.timestamp);
        (uint256 price, uint256 confidence,) = oracle.latestHbarUsd();
        assertEq(price, 25_000_100);
        assertEq(confidence, 10_100);

        pyth.setPrice(2_500_019_999, 101, -10, block.timestamp);
        (price, confidence,) = oracle.latestHbarUsd();
        assertEq(price, 25_000_199);
        assertEq(confidence, 2);
    }

    function testRejectsNonPositivePrice() public {
        pyth.setPrice(0, 0, -8, block.timestamp);
        vm.expectRevert(PythHbarUsdOracle.InvalidPrice.selector);
        oracle.latestHbarUsd();
    }

    function testRejectsStalePrice() public {
        uint256 publishedAt = block.timestamp;
        pyth.setPrice(25_000_000, 100_000, -8, publishedAt);
        vm.warp(publishedAt + 121);
        vm.expectRevert(abi.encodeWithSelector(PythHbarUsdOracle.StalePrice.selector, publishedAt, publishedAt + 121));
        oracle.latestHbarUsd();
    }

    function testRejectsConfidenceAboveTwoPercent() public {
        pyth.setPrice(25_000_000, 500_001, -8, block.timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(PythHbarUsdOracle.ConfidenceTooWide.selector, uint256(500_001), uint256(25_000_000))
        );
        oracle.latestHbarUsd();
    }

    function testPaysExactPythFeeAndReturnsValidatedQuote() public {
        pyth.setUpdateFee(1234);
        bytes[] memory updates = new bytes[](1);
        updates[0] = hex"1234";
        vm.deal(address(this), 1234);
        (uint256 price,,) = oracle.updatePrice{value: 1234}(updates);
        assertEq(price, 25_000_000);
        assertEq(pyth.lastValue(), 1234);
    }

    function testRejectsIncorrectPythFee() public {
        pyth.setUpdateFee(1234);
        bytes[] memory updates = new bytes[](0);
        vm.expectRevert(
            abi.encodeWithSelector(PythHbarUsdOracle.IncorrectUpdateFee.selector, uint256(1), uint256(1234))
        );
        oracle.updatePrice{value: 1}(updates);
    }
}
