// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AtsCollateralRail} from "../../contracts/AtsCollateralRail.sol";
import {IAtsCollateralToken} from "../../contracts/interfaces/IAtsCollateralToken.sol";
import {IHbarUsdOracle} from "../../contracts/interfaces/IPyth.sol";

contract AtsCollateralRailHarness is AtsCollateralRail {
    uint256 public availableOnAttempt;
    uint256 public scheduleAttempts;
    uint64[] public scheduledSeconds;
    int64 public mockResponseCode = 22;
    address public mockScheduleAddress = address(0x516B);

    constructor(
        IAtsCollateralToken atsToken_,
        bytes32 partition_,
        IHbarUsdOracle oracle_,
        uint8 tokenDecimals_,
        uint256 nominalValueUsdE8_,
        address owner_
    ) AtsCollateralRail(atsToken_, partition_, oracle_, tokenDecimals_, nominalValueUsdE8_, owner_) {}

    function configureSchedule(uint256 attempt, int64 responseCode, address scheduleAddress) external {
        availableOnAttempt = attempt;
        mockResponseCode = responseCode;
        mockScheduleAddress = scheduleAddress;
    }

    function schedulePosition(bytes32, uint64 executionSecond)
        external
        override
        returns (int64 responseCode, address scheduleAddress, bool capacity)
    {
        if (msg.sender != address(this)) revert SelfCallOnly();
        ++scheduleAttempts;
        scheduledSeconds.push(executionSecond);
        capacity = availableOnAttempt != 0 && scheduleAttempts >= availableOnAttempt;
        if (!capacity) return (0, address(0), false);
        return (mockResponseCode, mockScheduleAddress, true);
    }
}
