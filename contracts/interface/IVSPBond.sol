// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IVSPBond is IERC721 {
    function mint(address to_) external returns (uint256);

    function burn(uint256 tokenId_) external;
}
