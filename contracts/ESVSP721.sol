// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./access/Governable.sol";
import "./interface/IESVSP.sol";
import "./interface/IESVSP721.sol";

contract ESVSP721 is Governable, IESVSP721, ERC721Enumerable {
    string public baseTokenURI;
    address public esVSP;
    uint256 public tokenId; // tokens counter

    constructor(
        address esVSP_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        esVSP = esVSP_;
    }

    function burn(uint256 tokenId_) external {
        require(msg.sender == esVSP, "not-esvsp");
        _burn(tokenId_);
    }

    function setBaseTokenURI(string memory baseTokenURI_) public onlyGovernor {
        baseTokenURI = baseTokenURI_;
    }

    function mint(address to_) external returns (uint256) {
        require(msg.sender == esVSP, "not-esvsp");
        tokenId++;
        uint256 _tokenId = tokenId;
        _mint(to_, _tokenId);
        return _tokenId;
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseTokenURI, Strings.toString(_tokenId)));
    }

    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256 tokenId_
    ) internal override {
        if (from_ != address(0) && to_ != address(0)) {
            IESVSP(esVSP).transferPosition(tokenId_, to_);
        }
    }
}
