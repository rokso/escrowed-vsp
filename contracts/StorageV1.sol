// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VSPBond.sol";

abstract contract StorageV1 {
    IERC20 public token;
    struct Balance {
        uint256 lockedAmount;
        uint256 boostedAmount;
        uint256 unlockTime;
    }

    struct Reward {
        bool useBoost;
        uint256 periodFinish;
        uint256 rewardRates;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    // TODO: rename
    VSPBond public bond;
    uint256 public totalLocked;
    uint256 public totalBoosted;
    uint256 public tokenId;
 
    
    /// Array of reward token addresses
    address[] public rewardTokens;

    mapping(uint256 => Balance) public balances;

    /// Reward token to valid/invalid flag mapping
    mapping(address => bool) public isRewardToken;

    /// Reward token => User => Reward per token stored at last reward update
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;

    mapping(address => Reward) public rewardData;

    /// RewardToken => User => Rewards earned till last reward update
    mapping(address => mapping(address => uint256)) public rewards;

    // reward token -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public isRewardDistributor;
}
