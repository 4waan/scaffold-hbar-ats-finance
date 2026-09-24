// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "../../contracts/interfaces/IPyth.sol";

contract MockPyth is IPyth {
    Price private _price;
    uint256 public updateFee;
    uint256 public lastValue;
    bool public failUpdate;

    function setPrice(int64 price, uint64 conf, int32 expo, uint256 publishTime) external {
        _price = Price({price: price, conf: conf, expo: expo, publishTime: publishTime});
    }

    function setUpdateFee(uint256 fee) external {
        updateFee = fee;
    }

    function setFailUpdate(bool fail) external {
        failUpdate = fail;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return updateFee;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        if (failUpdate) revert("mock update failed");
        lastValue = msg.value;
    }

    function getPriceNoOlderThan(bytes32, uint256) external view returns (Price memory price) {
        return _price;
    }
}
