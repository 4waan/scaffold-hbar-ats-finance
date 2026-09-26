// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExchangeRate} from "@hiero-ledger/hiero-contracts/exchange-rate/IExchangeRate.sol";
import {HederaExchangeRateOracle} from "../contracts/oracle/HederaExchangeRateOracle.sol";
import {TestBase} from "./TestBase.sol";

contract HederaExchangeRateOracleTest is TestBase {
    HederaExchangeRateOracle internal oracle;

    function setUp() public {
        oracle = new HederaExchangeRateOracle();
    }

    function testConvertsHip475TinycentsToUsdE8() public {
        vm.mockCall(
            address(0x168),
            abi.encodeWithSelector(IExchangeRate.tinybarsToTinycents.selector, uint256(100_000_000)),
            abi.encode(uint256(780_280_000))
        );
        vm.warp(1_790_000_000);

        (uint256 price, uint256 confidence, uint64 observedAt) = oracle.latestHbarUsd();
        assertEq(price, 7_802_800);
        assertEq(confidence, 0);
        assertEq(observedAt, 1_790_000_000);
    }

    function testRoundsSubE8DustDown() public {
        vm.mockCall(
            address(0x168),
            abi.encodeWithSelector(IExchangeRate.tinybarsToTinycents.selector, uint256(100_000_000)),
            abi.encode(uint256(780_280_099))
        );
        (uint256 price,,) = oracle.latestHbarUsd();
        assertEq(price, 7_802_800);
    }

    function testRejectsZeroRate() public {
        vm.mockCall(
            address(0x168),
            abi.encodeWithSelector(IExchangeRate.tinybarsToTinycents.selector, uint256(100_000_000)),
            abi.encode(uint256(0))
        );
        vm.expectRevert(abi.encodeWithSelector(HederaExchangeRateOracle.InvalidExchangeRate.selector, uint256(0)));
        oracle.latestHbarUsd();
    }
}
