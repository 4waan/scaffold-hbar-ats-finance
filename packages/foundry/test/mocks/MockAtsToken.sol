// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAtsCollateralToken} from "../../contracts/interfaces/IAtsCollateralToken.sol";

contract MockAtsToken is IAtsCollateralToken {
    struct HoldRecord {
        Hold hold;
        uint8 thirdPartyType;
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
    uint256 public terminalResidualAmount;
    bool public clearingActive;
    uint8 public tokenDecimals;
    uint256 public nominalValue = 10_000;
    uint8 public nominalValueDecimals = 2;
    bytes3 public nominalValueCurrency = bytes3("USD");
    bool public corruptNextHold;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackAttempted;
    bool public callbackSucceeded;

    error MockKycRequired();
    error MockInvalidHold();

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

    function setAssetConfiguration(
        bool clearingActive_,
        uint8 tokenDecimals_,
        uint256 nominalValue_,
        uint8 nominalValueDecimals_,
        bytes3 nominalValueCurrency_
    ) external {
        clearingActive = clearingActive_;
        tokenDecimals = tokenDecimals_;
        nominalValue = nominalValue_;
        nominalValueDecimals = nominalValueDecimals_;
        nominalValueCurrency = nominalValueCurrency_;
    }

    function setCorruptNextHold(bool corrupt) external {
        corruptNextHold = corrupt;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function setHoldData(bytes32 partition, address holder, uint256 holdId, bytes calldata data) external {
        HoldRecord storage record = _holds[_key(partition, holder, holdId)];
        if (!record.active) revert MockInvalidHold();
        record.hold.data = data;
    }

    function setTerminalResidualAmount(uint256 amount) external {
        terminalResidualAmount = amount;
    }

    function setAdjustedHoldAmount(bytes32 partition, address holder, uint256 holdId, uint256 adjustedAmount) external {
        HoldRecord storage record = _holds[_key(partition, holder, holdId)];
        if (!record.active || adjustedAmount == 0) revert MockInvalidHold();

        uint256 previousAmount = record.hold.amount;
        record.hold.amount = adjustedAmount;
        if (adjustedAmount > previousAmount) {
            heldBalance[partition][holder] += adjustedAmount - previousAmount;
        } else {
            heldBalance[partition][holder] -= previousAmount - adjustedAmount;
        }
    }

    function holdAmount(bytes32 partition, address holder, uint256 holdId) external view returns (uint256) {
        return _holds[_key(partition, holder, holdId)].hold.amount;
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
        _holds[_key(partition, from, holdId)] = HoldRecord({hold: saved, thirdPartyType: 1, active: true});
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
        return
            (held.amount, held.expirationTimestamp, held.escrow, held.to, held.data, bytes(""), record.thirdPartyType);
    }

    function releaseHoldByPartition(HoldIdentifier calldata id, uint256 amount) external returns (bool success) {
        HoldRecord storage record = _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        if (!record.active || amount != record.hold.amount) return false;
        uint256 residualAmount = terminalResidualAmount;
        if (residualAmount >= amount) return false;
        terminalResidualAmount = 0;
        uint256 releasedAmount = amount - residualAmount;
        heldBalance[id.partition][id.tokenHolder] -= releasedAmount;
        freeBalance[id.partition][id.tokenHolder] += releasedAmount;
        if (residualAmount == 0) {
            delete _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        } else {
            record.hold.amount = residualAmount;
        }
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
        uint256 residualAmount = terminalResidualAmount;
        if (residualAmount >= amount) return (false, id.partition);
        terminalResidualAmount = 0;
        uint256 executedAmount = amount - residualAmount;
        heldBalance[id.partition][id.tokenHolder] -= executedAmount;
        freeBalance[id.partition][to] += executedAmount;
        if (residualAmount == 0) {
            delete _holds[_key(id.partition, id.tokenHolder, id.holdId)];
        } else {
            record.hold.amount = residualAmount;
        }
        ++terminalActions;
        return (true, id.partition);
    }

    function getMaturityDate() external view returns (uint256) {
        return maturityDate;
    }

    function hasRole(bytes32, address) external pure returns (bool) {
        return true;
    }

    function isClearingActivated() external view returns (bool) {
        return clearingActive;
    }

    function decimals() external view returns (uint8) {
        return tokenDecimals;
    }

    function getNominalValue() external view returns (uint256) {
        return nominalValue;
    }

    function getNominalValueDecimals() external view returns (uint8) {
        return nominalValueDecimals;
    }

    function getNominalValueCurrency() external view returns (bytes3) {
        return nominalValueCurrency;
    }

    function isInternalKycActivated() external pure returns (bool) {
        return true;
    }

    function _key(bytes32 partition, address holder, uint256 holdId) internal pure returns (bytes32) {
        return keccak256(abi.encode(partition, holder, holdId));
    }
}
