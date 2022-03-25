// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IESVSP.sol";
import "./interface/IESVSP721.sol";

abstract contract StorageV1 is IESVSP {
    struct StakeData {
        uint256 lockedAmount; // VSP deposited
        uint256 boostedAmount; // based on the `lockPeriod`
        uint256 unlockTime; // now + `lockPeriod`
    }

    // Each RewardToken has its setup
    struct Reward {
        bool isBoosted; // linear distribution if false
        uint256 periodFinish;
        uint256 rewardRates;
        uint256 lastUpdateTime; // stores last drip (or reward deposit) time
        uint256 rewardPerTokenStored;
    }

    uint8 public decimals;
    string public name;
    string public symbol;
    IESVSP721 public esVSP721; // nft contract

    uint256 public totalLocked; // VSP staked accumulator
    uint256 public totalBoosted; // boostedAmount accumulator

    // TODO: See if worth replace these with Enumerable
    /// Array of reward tokens
    address[] public rewardTokens;
    /// Reward token to valid/invalid flag mapping
    mapping(address => bool) public isRewardToken;

    // tokenId => staked
    mapping(uint256 => StakeData) public stakeData;

    // RewardToken => Reward data
    mapping(address => Reward) public rewardData;

    // user => total locked;
    mapping(address => uint256) public locked;

    // user => total boosted;
    mapping(address => uint256) public boosted;

    // TODO: If they are read together worth creating a 2 x uint128 struct
    /// RewardToken => User => Reward per token stored at last reward update
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    /// RewardToken => User => Rewards earned till last reward update
    mapping(address => mapping(address => uint256)) public rewards;

    // RewardToken -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public isRewardDistributor;
    // TODO: add supporting methods to add new reward token 
}
