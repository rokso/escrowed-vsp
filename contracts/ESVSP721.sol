// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./access/Governable.sol";
import "./interface/IESVSP.sol";
import "./interface/IESVSP721.sol";

contract ESVSP721 is Governable, IESVSP721, ERC721Enumerable {
    string public baseTokenURI;
    IESVSP public esVSP;
    uint256 public nextTokenId = 1;

    /// Emitted when `baseTokenURI` is updated
    event BaseTokenURIUpdated(string oldBaseTokenURI, string newBaseTokenURI);

    /// Emitted when esVSP contract is updated
    event ESVSPUpdated(IESVSP oldESVSP, IESVSP newESVSP);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    /**
     * @notice Burn NFT
     * @dev Revert if caller isn't the esVSP
     * @param tokenId_ The id of the token to burn
     */
    function burn(uint256 tokenId_) external {
        require(msg.sender == address(esVSP), "not-esvsp");
        _burn(tokenId_);
    }

    /**
     * @notice Mint NFT
     * @dev Revert if caller isn't the esVSP
     * @param to_ The receiver account
     */
    function mint(address to_) external returns (uint256 _tokenId) {
        require(msg.sender == address(esVSP), "not-esvsp");
        _tokenId = nextTokenId++;
        _mint(to_, _tokenId);
    }

    /**
     * @notice Base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
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
            esVSP.transferPosition(tokenId_, to_);
        }
    }

    /** Governance methods **/

    /**
     * @notice Update the base token URI
     */
    function setBaseTokenURI(string memory baseTokenURI_) public onlyGovernor {
        emit BaseTokenURIUpdated(baseTokenURI, baseTokenURI_);
        baseTokenURI = baseTokenURI_;
    }

    /**
     * @notice Set esVSP contract
     */
    function setESVSP(IESVSP esVSP_) public onlyGovernor {
        require(address(esVSP_) != address(0), "address-is-null");
        emit ESVSPUpdated(esVSP, esVSP_);
        esVSP = esVSP_;
    }
}
