// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./access/Governable.sol";
import "./interface/IESVSP.sol";
import "./interface/IESVSP721.sol";

contract ESVSP721 is Governable, IESVSP721, ERC721Enumerable {
    string public baseTokenURI;
    address public esVSP;
    uint256 public nextTokenId = 1;

    constructor(
        address esVSP_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        esVSP = esVSP_;
    }

    /**
     * @notice Burn NFT
     * @dev Revert if caller isn't the esVSP
     * @param tokenId_ The id of the token to burn
     */
    function burn(uint256 tokenId_) external {
        require(msg.sender == esVSP, "not-esvsp");
        _burn(tokenId_);
    }

    /**
     * @notice Mint NFT
     * @dev Revert if caller isn't the esVSP
     * @param to_ The receiver account
     */
    function mint(address to_) external returns (uint256 _tokenId) {
        require(msg.sender == esVSP, "not-esvsp");
        _tokenId = nextTokenId++;
        _mint(to_, _tokenId);
    }

    /**
     * @notice Get the token URI
     * @param _tokenId The token id
     */
    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseTokenURI, Strings.toString(_tokenId)));
    }

    /**
     * @notice Transfer position (locked/boosted) when transferring the NFT
     */
    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256 tokenId_
    ) internal override {
        super._beforeTokenTransfer(from_, to_, tokenId_);

        if (from_ != address(0) && to_ != address(0)) {
            IESVSP(esVSP).transferPosition(tokenId_, to_);
        }
    }

    /** Governance methods **/

    /**
     * @notice Update the base token URI
     */
    function setBaseTokenURI(string memory baseTokenURI_) public onlyGovernor {
        baseTokenURI = baseTokenURI_;
    }
}
