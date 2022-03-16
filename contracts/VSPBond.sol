// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// TODO: Should use enumurable ERC721?
contract VSPBond is ERC721 {
    address public locker;

    constructor(
        address _locker,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        locker = _locker;
    }

    function mint(address to_, uint256 tokenId_) public {
        require(msg.sender == locker, "SB: mint not smartYield");
        _mint(to_, tokenId_);
    }

    function burn(uint256 tokenId_) public {
        require(msg.sender == locker, "SB: burn not smartYield");
        _burn(tokenId_);
    }
}
