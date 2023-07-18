// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract ESVSP721Upgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](5);
        _callsList[0] = abi.encodeWithSignature("name()");
        _callsList[1] = abi.encodeWithSignature("symbol()");
        _callsList[2] = abi.encodeWithSignature("baseTokenURI()");
        _callsList[3] = abi.encodeWithSignature("esVSP()");
        _callsList[4] = abi.encodeWithSignature("nextTokenId()");
    }
}
