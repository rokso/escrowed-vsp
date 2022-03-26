// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interface/IESVSP.sol";
import "./interface/IESVSP721.sol";

// TODO: Should use enumerable ERC721?
contract ESVSP721 is IESVSP721, ERC721 {
    address public esVSP;
    uint256 public tokenId; // tokens counter

    constructor(
        address esVSP_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        esVSP = esVSP_;
    }

    function mint(address to_) external returns (uint256) {
        require(msg.sender == esVSP, "not-esvsp");
        tokenId++;
        uint256 _tokenId = tokenId;
        _mint(to_, _tokenId);
        return _tokenId;
    }

    function burn(uint256 tokenId_) external {
        require(msg.sender == esVSP, "not-esvsp");
        _burn(tokenId_);
    }

    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256 tokenId_
    ) internal override {
        // TODO: Create test case covering transfer to address(0) scenario
        if (from_ != address(0) && to_ != address(0)) {
            IESVSP(esVSP).transferPosition(tokenId_, to_);
        }
    }

    // TODO: add base URI
}
