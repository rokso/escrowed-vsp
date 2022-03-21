// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interface/IVSPBond.sol";

// TODO: Should use enumerable ERC721?
contract VSPBond is IVSPBond, ERC721 {
    address public locker;
    uint256 public tokenId; // tokens counter

    constructor(
        address locker_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        locker = locker_;
    }

    function mint(address to_) external returns (uint256) {
        require(msg.sender == locker, "SB: mint not smartYield");
        tokenId++;
        uint256 _tokenId = tokenId;
        _mint(to_, _tokenId);
        return _tokenId;
    }

    function burn(uint256 tokenId_) external {
        require(msg.sender == locker, "SB: burn not smartYield");
        _burn(tokenId_);
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override { 
        // TODO:
        // updateReward(from);
        // updateReward(to);
        // locked[from] -= _lockedAmount;
        // boosted[from] -= _boostedAmount;
        // locked[to] += _lockedAmount;
        // boosted[to] += _boostedAmount;
    }
}
