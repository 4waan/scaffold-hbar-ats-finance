// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExchangeRate} from "@hiero-ledger/hiero-contracts/exchange-rate/IExchangeRate.sol";
import {IHbarUsdOracle} from "../interfaces/IPyth.sol";

/// @title HederaExchangeRateOracle
/// @notice Converts the active HIP-475 network exchange rate into USD with
/// eight decimals. This source is intended for HBAR settlement conversion and
/// is not a live market-price oracle or an ATS collateral valuation source.
contract HederaExchangeRateOracle is IHbarUsdOracle {
    address public constant EXCHANGE_RATE_SYSTEM_CONTRACT = address(0x168);
    uint256 public constant TINYBARS_PER_HBAR = 100_000_000;
    uint256 public constant TINYCENTS_PER_USD_E8 = 100;

    error ExchangeRateUnavailable();
    error InvalidExchangeRate(uint256 tinycentsPerHbar);

    function latestHbarUsd() external view returns (uint256 priceUsdE8, uint256 confidenceUsdE8, uint64 observedAt) {
        (bool success, bytes memory result) = EXCHANGE_RATE_SYSTEM_CONTRACT.staticcall(
            abi.encodeWithSelector(IExchangeRate.tinybarsToTinycents.selector, TINYBARS_PER_HBAR)
        );
        if (!success || result.length != 32) revert ExchangeRateUnavailable();

        uint256 tinycentsPerHbar = abi.decode(result, (uint256));
        priceUsdE8 = tinycentsPerHbar / TINYCENTS_PER_USD_E8;
        if (priceUsdE8 == 0 || priceUsdE8 > type(uint64).max) {
            revert InvalidExchangeRate(tinycentsPerHbar);
        }

        // HIP-475 does not expose a publisher timestamp or confidence band.
        // The returned time is the consensus block observation time.
        confidenceUsdE8 = 0;
        observedAt = uint64(block.timestamp);
    }
}
