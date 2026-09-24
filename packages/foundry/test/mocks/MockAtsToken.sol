// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAtsCollateralToken} from "../../contracts/interfaces/IAtsCollateralToken.sol";

contract MockAtsToken is IAtsCollateralToken {
    struct HoldRecord {
        Hold hold;
        bool active;
    }

    mapping(address => KycStatus) public kyc;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => mapping(address => uint256)) public freeBalance;
    mapping(bytes32 => mapping(address => uint256)) public heldBalance;
    mapping(bytes32 => HoldRecord) private _holds;
    uint256 public nextHoldId = 1;
    uint256 public maturityDate;
    uint256 public holdsCreated;
    uint256 public terminalActions;
    bool public corruptNextHold;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackAttempted;
    bool public callbackSucceeded;

    error MockKycRequired();

    function setKyc(address account, bool granted) external {
        kyc[account] = granted ? KycStatus.GRANTED : KycStatus.NOT_GRANTED;
    }

    function setAllowance(address account, address spender, uint256 amount) external {
        allowance[account][spender] = amount;
    }

    function setBalance(bytes32 partition, address account, uint256 amount) external {
        freeBalance[partition][account] = amount;
    }

    function setMaturity(uint256 timestamp) external {
        maturityDate = timestamp;
    }

    function setCorruptNextHold(bool corrupt) external {
        corruptNextHold = corrupt;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function getKycStatusFor(address account) external view returns (KycStatus) {
        return kyc[account];
    }

    function balanceOfByPartition(bytes32 partition, address account) external view returns (uint256) {
        return freeBalance[partition][account];
    }

    function getHeldAmountForByPartition(bytes32 partition, address account) external view returns (uint256) {
        return heldBalance[partition][account];
    }

    function createHoldFromByPartition(bytes32 partition, address from, Hold calldata requested, bytes calldata)
        external
        returns (bool success, uint256 holdId)
    {
        if (allowance[from][msg.sender] < requested.amount) return (false, 0);
        if (freeBalance[partition][from] < requested.amount) return (false, 0);

        allowance[from][msg.sender] -= requested.amount;
        freeBalance[partition][from] -= requested.amount;
        heldBalance[partition][from] += requested.amount;
        holdId = nextHoldId++;

        Hold memory saved = requested;
        if (corruptNextHold) {
            saved.to = address(0xBADD);
            corruptNextHold = false;
        }
        _holds[_key(partition, from, holdId)] = HoldRecord({hold: saved, active: true});
        ++holdsCreated;

        if (callbackTarget != address(0)) {
            callbackAttempted = true;
            (callbackSucceeded,) = callbackTarget.call(callbackData);
        }
        return (true, holdId);
    }

    function getHoldForByPartition(HoldIdentifier calldata id)
        external
        view
        returns (
            uint256 amount,
            uint256 expirationTimestamp,
            address escrow,
            address destination,
            bytes memory data,
            bytes memory operatorData,
            uint8 thirdPartyType
        )
    {
        HoldRecord storage record = _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        Hold storage held = record.hold;
        return (held.amount, held.expirationTimestamp, held.escrow, held.to, held.data, bytes(""), 0);
    }

    function releaseHoldByPartition(HoldIdentifier calldata id, uint256 amount) external returns (bool success) {
        HoldRecord storage record = _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        if (!record.active || amount != record.hold.amount) return false;
        record.active = false;
        heldBalance[id.partition][id.tokenHolder] -= amount;
        freeBalance[id.partition][id.tokenHolder] += amount;
        ++terminalActions;
        return true;
    }

    function executeHoldByPartition(HoldIdentifier calldata id, address to, uint256 amount)
        external
        returns (bool success, bytes32 executedPartition)
    {
        if (kyc[to] != KycStatus.GRANTED) revert MockKycRequired();
        HoldRecord storage record = _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        if (!record.active || amount != record.hold.amount) return (false, id.partition);
        record.active = false;
        heldBalance[id.partition][id.tokenHolder] -= amount;
        freeBalance[id.partition][to] += amount;
        ++terminalActions;
        return (true, id.partition);
    }

    function getMaturityDate() external view returns (uint256) {
        return maturityDate;
    }

    function hasRole(bytes32, address) external pure returns (bool) {
        return true;
    }

    function isInternalKycActivated() external pure returns (bool) {
        return true;
    }

    function _key(bytes32 partition, address holder, uint256 holdId) internal pure returns (bytes32) {
        return keccak256(abi.encode(partition, holder, holdId));
    }
}
