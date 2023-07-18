// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract RewardsUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](1);
        _callsList[0] = abi.encodeWithSignature("esVSP()");
    }
}
