// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract ESVSPUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](8);
        _callsList[0] = abi.encodeWithSignature("decimals()");
        _callsList[1] = abi.encodeWithSignature("name()");
        _callsList[2] = abi.encodeWithSignature("symbol()");
        _callsList[3] = abi.encodeWithSignature("esVSP721()");
        _callsList[4] = abi.encodeWithSignature("rewards()");
        _callsList[5] = abi.encodeWithSignature("totalLocked()");
        _callsList[6] = abi.encodeWithSignature("totalBoosted()");
        _callsList[7] = abi.encodeWithSignature("exitPenalty()");
    }
}
