// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IESVSP.sol";
import "../interface/IRewards.sol";

abstract contract RewardsStorageV1 is IRewards {
    // Each RewardToken has its setup
    struct Reward {
        bool isBoosted; // linear distribution if false
        uint256 periodFinish;
        uint256 rewardRates;
        uint256 lastUpdateTime; // stores last drip (or reward deposit) time
        uint256 rewardPerTokenStored;
    }

    struct UserReward {
        uint128 rewardPerTokenPaid;
        uint128 claimableRewardsStored;
    }

    IESVSP public esVSP;

    /// Array of reward tokens
    address[] public rewardTokens;

    // RewardToken => Reward data
    mapping(address => Reward) public rewardData;

    mapping(address => mapping(address => UserReward)) public userRewardData;

    // RewardToken -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public isRewardDistributor;
}
