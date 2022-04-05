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

    struct UserReward {
        uint128 rewardPerTokenPaid;
        uint128 claimableRewardsStored;
    }

    uint8 public decimals;
    string public name;
    string public symbol;
    IESVSP721 public esVSP721; // nft contract

    uint256 public totalLocked; // VSP staked accumulator
    uint256 public totalBoosted; // boostedAmount accumulator

    /// Array of reward tokens
    address[] public rewardTokens;

    /**
     * @notice Fee paid when withdrawing. Decreases linearly as period finish approaches.
     * @dev Use 18 decimals (e.g. 0.5e18 is 50%)
     */
    uint256 public exitPenalty;

    // tokenId => staked
    // TODO: What is the best naming to use uniformly among codebase 1) Lock 2) Stake or 3) Escrow?
    // TODO: Rename to lockPositions or similar?
    mapping(uint256 => StakeData) public stakeData;

    // RewardToken => Reward data
    mapping(address => Reward) public rewardData;

    // user => total locked;
    mapping(address => uint256) public locked;

    // user => total boosted;
    mapping(address => uint256) public boosted;

    mapping(address => mapping(address => UserReward)) public userRewardData;

    // RewardToken -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public isRewardDistributor;
}
