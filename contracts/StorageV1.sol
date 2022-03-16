// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VSPBond.sol";

abstract contract StorageV1 {
    IERC20 public token;
    // TODO: rename
    VSPBond public bond;
    uint256 public totalLocked;
    uint256 public totalBoosted;
    uint256 public tokenId;
    struct Balance {
        uint256 lockedAmount;
        uint256 boostedAmount;
        uint256 unlockTime;
    }
    mapping(uint256 => Balance) public balances;
}