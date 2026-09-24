// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHbarUsdOracle} from "../../contracts/interfaces/IPyth.sol";

contract MockOracle is IHbarUsdOracle {
    uint256 public priceUsdE8;
    uint256 public confidenceUsdE8;
    uint64 public publishTime;

    constructor(uint256 priceUsdE8_) {
        priceUsdE8 = priceUsdE8_;
        publishTime = uint64(block.timestamp);
    }

    function setQuote(uint256 price, uint256 confidence, uint64 publishedAt) external {
        priceUsdE8 = price;
        confidenceUsdE8 = confidence;
        publishTime = publishedAt;
    }

    function latestHbarUsd() external view returns (uint256, uint256, uint64) {
        return (priceUsdE8, confidenceUsdE8, publishTime);
    }
}
